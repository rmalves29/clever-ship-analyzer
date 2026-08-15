ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS template_language text NOT NULL DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS body_params jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'crm',
  ADD COLUMN IF NOT EXISTS automation_id uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS total_destinatarios integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.whatsapp_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  segment_type text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'pt_BR',
  message_type text NOT NULL DEFAULT 'marketing',
  body_params jsonb NOT NULL DEFAULT '[]'::jsonb,
  coupon_code text,
  janela_horas integer NOT NULL DEFAULT 24,
  requer_aprovacao boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  origem text NOT NULL DEFAULT 'crm',
  last_run_at timestamptz,
  total_execucoes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.whatsapp_automations TO service_role;
ALTER TABLE public.whatsapp_automations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_campaigns
  ADD CONSTRAINT whatsapp_campaigns_automation_id_fkey
  FOREIGN KEY (automation_id) REFERENCES public.whatsapp_automations(id) ON DELETE SET NULL;