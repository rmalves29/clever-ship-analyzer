-- Mantém o histórico de códigos de cupom por campanha e prepara a atribuição GANHE5 -> POP5.
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_coupon_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  code text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  backfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_campaign_coupon_codes_nonempty CHECK (length(btrim(code)) > 0),
  CONSTRAINT whatsapp_campaign_coupon_codes_uppercase CHECK (code = upper(btrim(code))),
  CONSTRAINT whatsapp_campaign_coupon_codes_campaign_code_key UNIQUE (campaign_id, code)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_coupon_codes_code
  ON public.whatsapp_campaign_coupon_codes (code);

ALTER TABLE public.whatsapp_campaign_coupon_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_campaign_coupon_codes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaign_coupon_codes TO service_role;

-- A campanha Tag Pop-up passa a usar POP5 daqui para frente.
UPDATE public.whatsapp_campaigns
SET coupon_code = 'POP5'
WHERE id = '316634b0-de9d-4670-934e-b26f53c7d1c7';

-- GANHE5 continua ligado à mesma campanha para medir o histórico.
INSERT INTO public.whatsapp_campaign_coupon_codes (campaign_id, code, is_current)
SELECT id, alias.code, alias.is_current
FROM public.whatsapp_campaigns
CROSS JOIN (
  VALUES
    ('GANHE5'::text, false),
    ('POP5'::text, true)
) AS alias(code, is_current)
WHERE id = '316634b0-de9d-4670-934e-b26f53c7d1c7'
ON CONFLICT (campaign_id, code)
DO UPDATE SET
  is_current = EXCLUDED.is_current,
  updated_at = now();

-- A etapa da automação também fica configurada com o código atual.
UPDATE public.whatsapp_automations
SET
  steps = (
    SELECT jsonb_agg(
      CASE
        WHEN item.step->>'type' = 'send'
          THEN item.step || jsonb_build_object('couponCode', 'POP5')
        ELSE item.step
      END
      ORDER BY item.ordinality
    )
    FROM jsonb_array_elements(COALESCE(steps, '[]'::jsonb))
      WITH ORDINALITY AS item(step, ordinality)
  ),
  updated_at = now()
WHERE id = '51681263-8b5b-4d09-8f77-f97dd57d03fc';
