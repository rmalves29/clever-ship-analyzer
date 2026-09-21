-- Colunas que o app já usa mas nunca foram criadas
ALTER TABLE public.landing_page_leads
  ADD COLUMN IF NOT EXISTS visitor_id text,
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

UPDATE public.landing_page_leads SET clicked_at = criado_em WHERE clicked_at IS NULL;

-- Registro de todo o funil da landing page (acesso, formulário, clique)
CREATE TABLE IF NOT EXISTS public.landing_page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id uuid NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view','form_submit','link_click')),
  visitor_id text,
  phone text,
  lead_id uuid REFERENCES public.landing_page_leads(id) ON DELETE SET NULL,
  customer_id text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landing_page_events_page_idx ON public.landing_page_events (landing_page_id, criado_em);
CREATE INDEX IF NOT EXISTS landing_page_events_lead_idx ON public.landing_page_events (lead_id);
CREATE INDEX IF NOT EXISTS landing_page_leads_page_phone_idx ON public.landing_page_leads (landing_page_id, phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_events TO authenticated;
GRANT ALL ON public.landing_page_events TO service_role;

ALTER TABLE public.landing_page_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read landing page events" ON public.landing_page_events;
CREATE POLICY "Authenticated can read landing page events"
ON public.landing_page_events FOR SELECT TO authenticated USING (true);

-- Backfill: acessos antigos e capturas já existentes viram eventos
INSERT INTO public.landing_page_events (landing_page_id, event_type, criado_em)
SELECT v.landing_page_id, 'view', v.criado_em FROM public.landing_page_views v;

INSERT INTO public.landing_page_events (landing_page_id, event_type, phone, lead_id, criado_em)
SELECT l.landing_page_id, 'form_submit', l.phone, l.id, l.criado_em FROM public.landing_page_leads l;

INSERT INTO public.landing_page_events (landing_page_id, event_type, phone, lead_id, criado_em)
SELECT l.landing_page_id, 'link_click', l.phone, l.id, COALESCE(l.clicked_at, l.criado_em) FROM public.landing_page_leads l;

-- Vincula as capturas aos contatos já existentes no CRM (mesmo telefone)
UPDATE public.landing_page_leads l
SET customer_id = c.id
FROM public.shopify_customers c
WHERE l.customer_id IS NULL AND c.phone = l.phone;

UPDATE public.landing_page_events e
SET customer_id = l.customer_id
FROM public.landing_page_leads l
WHERE e.lead_id = l.id AND e.customer_id IS NULL AND l.customer_id IS NOT NULL;