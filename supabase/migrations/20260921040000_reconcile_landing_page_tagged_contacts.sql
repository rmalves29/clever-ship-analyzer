-- Reconcilia contatos que já receberam a tag da landing page no CRM, mas ficaram sem
-- landing_page_leads por falha parcial durante a captura. A tag do slug é a evidência
-- persistida de origem usada pelo fluxo atual.
WITH tagged_contacts AS (
  SELECT
    customer.id AS customer_id,
    customer.phone,
    page.id AS landing_page_id,
    COALESCE(customer.created_at, now()) AS captured_at
  FROM public.shopify_customers AS customer
  JOIN public.landing_pages AS page
    ON page.slug = ANY(COALESCE(customer.tags_custom, ARRAY[]::text[]))
  WHERE NULLIF(regexp_replace(COALESCE(customer.phone, ''), '\D', '', 'g'), '') IS NOT NULL
), missing_leads AS (
  SELECT tc.*
  FROM tagged_contacts AS tc
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.landing_page_leads AS lead
    WHERE lead.landing_page_id = tc.landing_page_id
      AND right(regexp_replace(lead.phone, '\D', '', 'g'), 11)
        = right(regexp_replace(tc.phone, '\D', '', 'g'), 11)
  )
)
INSERT INTO public.landing_page_leads (
  landing_page_id,
  phone,
  customer_id,
  clicked_at,
  criado_em
)
SELECT
  landing_page_id,
  phone,
  customer_id,
  captured_at,
  captured_at
FROM missing_leads;

-- Os relatórios usam os eventos, então toda captura reconciliada também recebe as duas
-- etapas que o submitLandingPageLead registra hoje.
INSERT INTO public.landing_page_events (
  landing_page_id,
  event_type,
  lead_id,
  customer_id,
  phone,
  criado_em
)
SELECT
  lead.landing_page_id,
  event_type,
  lead.id,
  lead.customer_id,
  lead.phone,
  COALESCE(lead.clicked_at, lead.criado_em)
FROM public.landing_page_leads AS lead
CROSS JOIN (VALUES ('form_submit'::text), ('link_click'::text)) AS event_types(event_type)
WHERE lead.customer_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.shopify_customers AS customer
    JOIN public.landing_pages AS page
      ON page.id = lead.landing_page_id
    WHERE customer.id = lead.customer_id
      AND page.slug = ANY(COALESCE(customer.tags_custom, ARRAY[]::text[]))
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.landing_page_events AS existing
    WHERE existing.lead_id = lead.id
      AND existing.event_type = event_types.event_type
  );
