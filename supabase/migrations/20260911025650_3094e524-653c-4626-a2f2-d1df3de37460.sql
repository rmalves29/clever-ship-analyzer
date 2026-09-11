-- ============ 1. TABELAS ============
CREATE TABLE public.wa_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando_aprovacao',
  origin TEXT NOT NULL DEFAULT 'manual',
  audience_kind TEXT NOT NULL DEFAULT 'segment',
  audience_id TEXT,
  audience_label TEXT,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'pt_BR',
  message_type TEXT NOT NULL DEFAULT 'marketing',
  body_params JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_param_tokens JSONB,
  header_media_url TEXT,
  coupon_code TEXT,
  campaign_tag TEXT,
  automation_id UUID,
  conversation_flow_id UUID,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejected_at TIMESTAMPTZ,
  reject_reason TEXT,
  last_error TEXT,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  legacy_campaign_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_campaigns TO authenticated;
GRANT ALL ON public.wa_campaigns TO service_role;
ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados gerenciam campanhas wa" ON public.wa_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.wa_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  customer_id TEXT,
  name TEXT,
  phone TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  wa_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_campaign_recipients TO authenticated;
GRANT ALL ON public.wa_campaign_recipients TO service_role;
ALTER TABLE public.wa_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados gerenciam destinatarios wa" ON public.wa_campaign_recipients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX wa_campaign_recipients_campaign_idx ON public.wa_campaign_recipients (campaign_id, status);
CREATE INDEX wa_campaign_recipients_wamid_idx ON public.wa_campaign_recipients (wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE TABLE public.wa_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL UNIQUE REFERENCES public.wa_campaign_recipients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  priority INTEGER NOT NULL DEFAULT 100,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_attempt_at TIMESTAMPTZ,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_jobs TO authenticated;
GRANT ALL ON public.wa_jobs TO service_role;
ALTER TABLE public.wa_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados gerenciam fila wa" ON public.wa_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX wa_jobs_pickup_idx ON public.wa_jobs (status, priority, scheduled_at);

CREATE TRIGGER wa_campaigns_updated_at BEFORE UPDATE ON public.wa_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER wa_campaign_recipients_updated_at BEFORE UPDATE ON public.wa_campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER wa_jobs_updated_at BEFORE UPDATE ON public.wa_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 2. CONTADORES AUTOMATICOS ============
CREATE OR REPLACE FUNCTION public.wa_recalc_campaign_counters(p_campaign_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.wa_campaigns c SET
    total_recipients = s.total,
    sent_count = s.sent,
    delivered_count = s.delivered,
    read_count = s.read,
    failed_count = s.failed,
    updated_at = now()
  FROM (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status IN ('sent','delivered','read'))::int AS sent,
      count(*) FILTER (WHERE status IN ('delivered','read'))::int AS delivered,
      count(*) FILTER (WHERE status = 'read')::int AS read,
      count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM public.wa_campaign_recipients WHERE campaign_id = p_campaign_id
  ) s
  WHERE c.id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.wa_recipients_counter_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wa_recalc_campaign_counters(OLD.campaign_id);
    RETURN OLD;
  END IF;
  PERFORM public.wa_recalc_campaign_counters(NEW.campaign_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER wa_campaign_recipients_counters
AFTER INSERT OR DELETE OR UPDATE OF status ON public.wa_campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.wa_recipients_counter_trigger();

-- ============ 3. CLAIM ATOMICO DA FILA ============
CREATE OR REPLACE FUNCTION public.claim_wa_jobs(p_limit integer, p_worker text)
RETURNS SETOF public.wa_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.wa_jobs j
    WHERE j.status IN ('queued','retry_wait')
      AND j.scheduled_at <= now()
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
    ORDER BY j.priority ASC, j.next_attempt_at ASC NULLS FIRST, j.created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.wa_jobs t
  SET status = 'sending', attempts = t.attempts + 1, locked_by = p_worker, locked_at = now(), updated_at = now()
  FROM picked WHERE t.id = picked.id
  RETURNING t.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_stale_wa_jobs(p_stale_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH moved AS (
    UPDATE public.wa_jobs
    SET status = CASE WHEN attempts < max_attempts THEN 'retry_wait' ELSE 'failed' END,
        next_attempt_at = CASE WHEN attempts < max_attempts THEN now() ELSE NULL END,
        error = COALESCE(error, 'worker travado; job recolocado na fila'),
        locked_by = NULL, locked_at = NULL, updated_at = now()
    WHERE status = 'sending' AND locked_at IS NOT NULL
      AND locked_at < now() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 15), 1))
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM moved;
  RETURN v_count;
END;
$$;

-- ============ 4. BACKFILL DO HISTORICO ============
ALTER TABLE public.wa_campaign_recipients DISABLE TRIGGER wa_campaign_recipients_counters;

INSERT INTO public.wa_campaigns (
  name, status, origin, audience_kind, audience_id, audience_label,
  template_name, template_language, message_type, body_params, body_param_tokens,
  coupon_code, campaign_tag, automation_id, conversation_flow_id,
  sent_at, approved_at, approved_by, rejected_at, reject_reason, last_error,
  legacy_campaign_id, created_at
)
SELECT
  o.nome, o.status, COALESCE(o.origem,'manual'), 'segment',
  COALESCE(o.segment_id::text, o.segment_type), o.segment_type,
  o.template_name, COALESCE(o.template_language,'pt_BR'), COALESCE(o.message_type,'marketing'),
  COALESCE(o.body_params,'[]'::jsonb), o.body_param_tokens,
  o.coupon_code, o.campaign_tag, o.automation_id, o.conversation_flow_id,
  o.sent_at, o.approved_at, o.approved_by, o.rejected_at, o.reject_reason, o.last_error,
  o.id, o.created_at
FROM public.whatsapp_campaigns o
ON CONFLICT (legacy_campaign_id) DO NOTHING;

-- campanha sintetica para itens de fila sem campanha
INSERT INTO public.wa_campaigns (name, status, origin, audience_kind, audience_label, template_name, template_language, legacy_campaign_id)
SELECT 'Envios avulsos (histórico)', 'finalizada', 'avulso', 'manual', 'Avulsos',
       COALESCE(min(q.template_name), 'desconhecido'), 'pt_BR', '00000000-0000-0000-0000-000000000001'
FROM public.whatsapp_message_queue q WHERE q.campaign_id IS NULL
HAVING count(*) > 0
ON CONFLICT (legacy_campaign_id) DO NOTHING;

-- destinatarios ja registrados
INSERT INTO public.wa_campaign_recipients (campaign_id, customer_id, phone, status, wa_message_id, error_message, sent_at, delivered_at, read_at)
SELECT c.id, r.customer_id::text, r.phone,
  CASE
    WHEN r.read_at IS NOT NULL OR r.status = 'read' THEN 'read'
    WHEN r.delivered_at IS NOT NULL OR r.status = 'delivered' THEN 'delivered'
    WHEN r.status = 'failed' THEN 'failed'
    WHEN r.sent_at IS NOT NULL OR r.status = 'sent' THEN 'sent'
    ELSE 'queued'
  END,
  r.wa_message_id, r.error, r.sent_at, r.delivered_at, r.read_at
FROM public.whatsapp_campaign_recipients r
JOIN public.wa_campaigns c ON c.legacy_campaign_id = r.campaign_id
ON CONFLICT (campaign_id, phone) DO NOTHING;

-- itens de fila que ainda nao existem como destinatario
INSERT INTO public.wa_campaign_recipients (campaign_id, customer_id, phone, params, status, wa_message_id, error_message, sent_at, created_at)
SELECT DISTINCT ON (c.id, q.phone)
  c.id, q.customer_id::text, q.phone, COALESCE(q.body_params,'[]'::jsonb),
  CASE
    WHEN q.status = 'sent' THEN 'sent'
    WHEN q.status = 'failed' THEN 'failed'
    WHEN q.status = 'cancelled' THEN 'cancelled'
    ELSE 'queued'
  END,
  q.wa_message_id, q.error, q.sent_at, q.created_at
FROM public.whatsapp_message_queue q
JOIN public.wa_campaigns c
  ON c.legacy_campaign_id = COALESCE(q.campaign_id, '00000000-0000-0000-0000-000000000001'::uuid)
ORDER BY c.id, q.phone, q.created_at DESC
ON CONFLICT (campaign_id, phone) DO NOTHING;

ALTER TABLE public.wa_campaign_recipients ENABLE TRIGGER wa_campaign_recipients_counters;

-- fila ativa: jobs pendentes migrados
INSERT INTO public.wa_jobs (campaign_id, recipient_id, status, attempts, max_attempts, priority, scheduled_at, next_attempt_at, error)
SELECT r.campaign_id, r.id, 'queued', q.attempts, q.max_attempts, q.priority, q.scheduled_at, q.next_attempt_at, q.error
FROM public.whatsapp_message_queue q
JOIN public.wa_campaigns c ON c.legacy_campaign_id = COALESCE(q.campaign_id, '00000000-0000-0000-0000-000000000001'::uuid)
JOIN public.wa_campaign_recipients r ON r.campaign_id = c.id AND r.phone = q.phone
WHERE q.status IN ('queued','retry_wait','sending')
ON CONFLICT (recipient_id) DO NOTHING;

-- recalcula contadores de todas as campanhas migradas
DO $$
DECLARE v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.wa_campaigns LOOP
    PERFORM public.wa_recalc_campaign_counters(v_id);
  END LOOP;
END $$;