CREATE TABLE IF NOT EXISTS public.crm_repurchase_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  target_conversion_rate numeric(6,5) NOT NULL DEFAULT 0.10
    CHECK (target_conversion_rate > 0 AND target_conversion_rate <= 1),
  target_window_days integer NOT NULL DEFAULT 30
    CHECK (target_window_days IN (7, 15, 30, 60, 90)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.crm_repurchase_settings (id, target_conversion_rate, target_window_days)
VALUES (true, 0.10, 30)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.crm_repurchase_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_repurchase_settings FROM anon, authenticated;
GRANT ALL ON public.crm_repurchase_settings TO service_role;

COMMENT ON TABLE public.crm_repurchase_settings IS
  'Meta operacional configurável da primeira para a segunda compra.';
