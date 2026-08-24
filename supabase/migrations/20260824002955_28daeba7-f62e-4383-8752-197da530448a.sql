CREATE TABLE public.whatsapp_message_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES public.shopify_customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'crm',
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'pt_BR',
  body_params JSONB NOT NULL DEFAULT '[]'::jsonb,
  header_media_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','retry_wait','sent','failed','cancelled','skipped')),
  priority INTEGER NOT NULL DEFAULT 5,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ DEFAULT now(),
  error TEXT,
  wa_message_id TEXT,
  sent_at TIMESTAMPTZ,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  dedup_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX whatsapp_message_queue_dedup_key_uidx
  ON public.whatsapp_message_queue (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX whatsapp_message_queue_claim_idx
  ON public.whatsapp_message_queue (priority, next_attempt_at, created_at)
  WHERE status IN ('queued','retry_wait');

CREATE INDEX whatsapp_message_queue_campaign_idx
  ON public.whatsapp_message_queue (campaign_id);

CREATE INDEX whatsapp_message_queue_stale_idx
  ON public.whatsapp_message_queue (locked_at)
  WHERE status = 'sending';

GRANT ALL ON public.whatsapp_message_queue TO service_role;

ALTER TABLE public.whatsapp_message_queue ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER whatsapp_message_queue_updated_at
  BEFORE UPDATE ON public.whatsapp_message_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_whatsapp_message_queue(p_limit INTEGER, p_worker TEXT)
RETURNS SETOF public.whatsapp_message_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.whatsapp_message_queue q
    WHERE q.status IN ('queued','retry_wait')
      AND q.scheduled_at <= now()
      AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= now())
    ORDER BY q.priority ASC, q.next_attempt_at ASC NULLS FIRST, q.created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 20), 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_message_queue t
  SET status = 'sending',
      attempts = t.attempts + 1,
      locked_by = p_worker,
      locked_at = now(),
      updated_at = now()
  FROM picked
  WHERE t.id = picked.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_message_queue(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_message_queue(INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.requeue_stale_whatsapp_queue(p_stale_minutes INTEGER DEFAULT 15)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH moved AS (
    UPDATE public.whatsapp_message_queue
    SET status = CASE WHEN attempts < max_attempts THEN 'retry_wait' ELSE 'failed' END,
        next_attempt_at = CASE WHEN attempts < max_attempts THEN now() ELSE NULL END,
        error = COALESCE(error, 'worker travado; job recolocado na fila'),
        locked_by = NULL,
        locked_at = NULL,
        updated_at = now()
    WHERE status = 'sending'
      AND locked_at IS NOT NULL
      AND locked_at < now() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 15), 1))
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM moved;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.requeue_stale_whatsapp_queue(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_stale_whatsapp_queue(INTEGER) TO service_role;