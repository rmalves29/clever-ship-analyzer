-- =============================================================
-- CRM recompra: atribuição auditável de 1ª -> 2ª compra
--
-- Por que uma tabela dedicada?
-- - crm_events é uma agenda/event stream genérica e não possui customer_id,
--   campaign_id, order_id, revenue nem evidência de atribuição.
-- - whatsapp_campaign_recipients registra entrega/leitura, mas não registra
--   pedido convertido, receita, janela nem evidência e não cobre outros canais.
--
-- A tabela abaixo NÃO cria automação e NÃO dispara mensagens. Ela apenas
-- prepara persistência futura de conversões com evidência rastreável.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.crm_repurchase_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_source TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES public.shopify_customers(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  channel TEXT,

  sent_at TIMESTAMPTZ NOT NULL,
  converted_at TIMESTAMPTZ NOT NULL,
  order_id TEXT NOT NULL REFERENCES public.shopify_orders(id) ON DELETE CASCADE,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  conversion_window_days INTEGER NOT NULL,

  attribution_evidence TEXT NOT NULL,
  attribution_reference TEXT NOT NULL,
  evidence_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT crm_repurchase_attributions_stage_chk CHECK (
    stage IN ('0–7 dias','8–15 dias','16–30 dias','31–60 dias','61–90 dias','90+ dias')
  ),
  CONSTRAINT crm_repurchase_attributions_revenue_chk CHECK (revenue >= 0),
  CONSTRAINT crm_repurchase_attributions_window_chk CHECK (conversion_window_days >= 0),
  CONSTRAINT crm_repurchase_attributions_time_chk CHECK (converted_at >= sent_at),
  CONSTRAINT crm_repurchase_attributions_evidence_chk CHECK (
    attribution_evidence IN (
      'coupon',
      'tracked_link',
      'campaign_specific_landing',
      'explicit_customer_reply',
      'manual_verified'
    )
  ),
  CONSTRAINT crm_repurchase_attributions_reference_chk CHECK (length(trim(attribution_reference)) > 0),
  CONSTRAINT crm_repurchase_attributions_unique UNIQUE (
    campaign_source,
    campaign_id,
    customer_id,
    order_id
  )
);

CREATE INDEX IF NOT EXISTS crm_repurchase_attributions_customer_idx
  ON public.crm_repurchase_attributions (customer_id, converted_at DESC);

CREATE INDEX IF NOT EXISTS crm_repurchase_attributions_campaign_idx
  ON public.crm_repurchase_attributions (campaign_source, campaign_id);

CREATE INDEX IF NOT EXISTS crm_repurchase_attributions_order_idx
  ON public.crm_repurchase_attributions (order_id);

ALTER TABLE public.crm_repurchase_attributions ENABLE ROW LEVEL SECURITY;

-- O frontend não acessa a tabela diretamente. Acesso deve ocorrer por
-- server functions autenticadas usando o backend/service role.
REVOKE ALL ON public.crm_repurchase_attributions FROM anon, authenticated;
GRANT ALL ON public.crm_repurchase_attributions TO service_role;
