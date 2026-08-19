-- Motor real de automação WhatsApp: sequência de etapas + estado por cliente + scheduler.

ALTER TABLE public.whatsapp_automations
  ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES public.crm_segments(id);

-- Backfill: como não há automações cadastradas em produção hoje, isso é um no-op seguro
-- (mantido por precaução, caso alguém já tenha criado uma automação antes desta migração rodar).
UPDATE public.whatsapp_automations
SET steps = jsonb_build_array(
  jsonb_build_object(
    'id', 'step_1',
    'waitHours', COALESCE(janela_horas, 0),
    'templateName', template_name,
    'templateLanguage', COALESCE(template_language, 'pt_BR'),
    'messageType', COALESCE(message_type, 'marketing'),
    'bodyParams', COALESCE(body_params, '[]'::jsonb),
    'couponCode', coupon_code
  )
)
WHERE steps = '[]'::jsonb;

-- Estado por cliente: impede reenvio duplicado e guarda em que etapa cada cliente está.
CREATE TABLE public.whatsapp_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.whatsapp_automations(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES public.shopify_customers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending_approval', 'active', 'completed', 'failed')),
  current_step_id text NOT NULL,
  next_run_at timestamptz,
  campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, customer_id)
);

CREATE INDEX whatsapp_automation_runs_due_idx
  ON public.whatsapp_automation_runs (next_run_at)
  WHERE status = 'active';

CREATE INDEX whatsapp_automation_runs_automation_idx
  ON public.whatsapp_automation_runs (automation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_automation_runs TO authenticated;
GRANT ALL ON public.whatsapp_automation_runs TO service_role;
ALTER TABLE public.whatsapp_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total para autenticados" ON public.whatsapp_automation_runs FOR ALL TO authenticated USING (true);

-- Log de execução do tick (net.http_post é assíncrono; isso é o que confirma que o
-- endpoint de fato rodou, não só que a chamada foi enfileirada pelo pg_cron).
CREATE TABLE public.automation_tick_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  automations_processed integer NOT NULL DEFAULT 0,
  runs_processed integer NOT NULL DEFAULT 0,
  error text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_tick_runs TO authenticated;
GRANT ALL ON public.automation_tick_runs TO service_role;
ALTER TABLE public.automation_tick_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total para autenticados" ON public.automation_tick_runs FOR ALL TO authenticated USING (true);

-- Segredo compartilhado do endpoint de tick (guardado em store_settings, mesmo padrão
-- já usado pras demais credenciais do projeto, já que não há acesso a env vars do Worker).
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS automation_tick_secret text DEFAULT encode(gen_random_bytes(24), 'hex');

GRANT ALL ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
