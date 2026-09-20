-- Funil completo das landing pages: visitas anonimas, formularios e cliques no CTA.
-- A entrada no grupo continua vindo de fe_group_events (Live Launchpad), que e a fonte
-- autoritativa dos eventos reais do WhatsApp.

ALTER TABLE public.landing_page_leads
  ADD COLUMN IF NOT EXISTS visitor_id text,
  ADD COLUMN IF NOT EXISTS customer_id text REFERENCES public.shopify_customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

-- Antes desta migracao, toda linha de landing_page_leads era criada exatamente no clique do
-- CTA. O backfill preserva esse historico como clique real para os relatorios novos.
UPDATE public.landing_page_leads
SET clicked_at = COALESCE(clicked_at, criado_em)
WHERE clicked_at IS NULL;

-- Leva também os contatos históricos para o CRM. Primeiro reaproveita uma ficha existente pelo
-- telefone; só cria uma ficha phone:* quando nenhuma correspondência já existe.
WITH normalized_leads AS (
  SELECT
    lead.id,
    lead.criado_em,
    page.slug,
    CASE
      WHEN length(regexp_replace(lead.phone, '\D', '', 'g')) IN (10, 11)
        THEN '+55' || regexp_replace(lead.phone, '\D', '', 'g')
      ELSE '+' || regexp_replace(lead.phone, '\D', '', 'g')
    END AS normalized_phone
  FROM public.landing_page_leads AS lead
  JOIN public.landing_pages AS page ON page.id = lead.landing_page_id
), missing_contacts AS (
  SELECT
    normalized_phone,
    min(criado_em) AS created_at,
    array_agg(DISTINCT slug) AS landing_tags
  FROM normalized_leads AS lead
  WHERE normalized_phone <> '+'
    AND NOT EXISTS (
      SELECT 1
      FROM public.shopify_customers AS customer
      WHERE right(regexp_replace(customer.phone, '\D', '', 'g'), 11)
        = right(regexp_replace(lead.normalized_phone, '\D', '', 'g'), 11)
    )
  GROUP BY normalized_phone
)
INSERT INTO public.shopify_customers (id, phone, tags_custom, created_at, updated_at)
SELECT
  'phone:' || normalized_phone,
  normalized_phone,
  landing_tags,
  created_at,
  now()
FROM missing_contacts
ON CONFLICT (id) DO UPDATE
SET
  tags_custom = (
    SELECT array_agg(DISTINCT tag)
    FROM unnest(
      COALESCE(public.shopify_customers.tags_custom, ARRAY[]::text[])
      || EXCLUDED.tags_custom
    ) AS tag
  ),
  updated_at = now();

UPDATE public.landing_page_leads AS lead
SET customer_id = (
  SELECT customer.id AS customer_id
  FROM public.shopify_customers AS customer
  WHERE right(regexp_replace(customer.phone, '\D', '', 'g'), 11)
    = right(regexp_replace(lead.phone, '\D', '', 'g'), 11)
  ORDER BY (customer.id LIKE 'phone:%') ASC, customer.created_at ASC
  LIMIT 1
)
WHERE lead.customer_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.shopify_customers AS customer
    WHERE right(regexp_replace(customer.phone, '\D', '', 'g'), 11)
      = right(regexp_replace(lead.phone, '\D', '', 'g'), 11)
  );

WITH customer_landing_tags AS (
  SELECT lead.customer_id, array_agg(DISTINCT page.slug) AS landing_tags
  FROM public.landing_page_leads AS lead
  JOIN public.landing_pages AS page ON page.id = lead.landing_page_id
  WHERE lead.customer_id IS NOT NULL
  GROUP BY lead.customer_id
)
UPDATE public.shopify_customers AS customer
SET
  tags_custom = (
    SELECT array_agg(DISTINCT tag)
    FROM unnest(
      COALESCE(customer.tags_custom, ARRAY[]::text[])
      || source.landing_tags
    ) AS tag
  ),
  updated_at = now()
FROM customer_landing_tags AS source
WHERE source.customer_id = customer.id;

CREATE INDEX IF NOT EXISTS landing_page_leads_customer_id_idx
  ON public.landing_page_leads (customer_id);
CREATE INDEX IF NOT EXISTS landing_page_leads_phone_idx
  ON public.landing_page_leads (phone);
CREATE INDEX IF NOT EXISTS landing_page_leads_clicked_at_idx
  ON public.landing_page_leads (clicked_at);

CREATE TABLE IF NOT EXISTS public.landing_page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id uuid NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'form_submit', 'link_click')),
  visitor_id text,
  lead_id uuid REFERENCES public.landing_page_leads(id) ON DELETE SET NULL,
  customer_id text REFERENCES public.shopify_customers(id) ON DELETE SET NULL,
  phone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landing_page_events_page_created_idx
  ON public.landing_page_events (landing_page_id, criado_em);
CREATE INDEX IF NOT EXISTS landing_page_events_type_created_idx
  ON public.landing_page_events (event_type, criado_em);
CREATE INDEX IF NOT EXISTS landing_page_events_visitor_idx
  ON public.landing_page_events (landing_page_id, visitor_id)
  WHERE visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS landing_page_events_customer_idx
  ON public.landing_page_events (customer_id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS landing_page_events_phone_idx
  ON public.landing_page_events (phone)
  WHERE phone IS NOT NULL;

GRANT ALL ON public.landing_page_events TO service_role;
ALTER TABLE public.landing_page_events ENABLE ROW LEVEL SECURITY;

-- Reconstrui as duas etapas conhecidas dos leads antigos. Visitas anteriores nao podem ser
-- inventadas e, por isso, passam a contar somente depois do deploy deste rastreamento.
INSERT INTO public.landing_page_events (
  landing_page_id,
  event_type,
  visitor_id,
  lead_id,
  customer_id,
  phone,
  criado_em
)
SELECT
  lead.landing_page_id,
  event_type,
  lead.visitor_id,
  lead.id,
  lead.customer_id,
  lead.phone,
  COALESCE(lead.clicked_at, lead.criado_em)
FROM public.landing_page_leads AS lead
CROSS JOIN (VALUES ('form_submit'::text), ('link_click'::text)) AS event_types(event_type)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.landing_page_events AS existing
  WHERE existing.lead_id = lead.id
    AND existing.event_type = event_types.event_type
);
