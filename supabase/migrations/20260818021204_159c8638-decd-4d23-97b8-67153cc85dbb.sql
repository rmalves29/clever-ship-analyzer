
-- 1. Adicionar coluna de tags em shopify_customers
ALTER TABLE public.shopify_customers 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- 2. Adicionar coluna de campaign_tag em whatsapp_campaigns
ALTER TABLE public.whatsapp_campaigns 
ADD COLUMN IF NOT EXISTS campaign_tag text;

-- 3. Garantir privilégios
GRANT UPDATE(tags) ON public.shopify_customers TO authenticated;
GRANT UPDATE(tags) ON public.shopify_customers TO service_role;
GRANT SELECT(tags) ON public.shopify_customers TO authenticated;
GRANT SELECT(tags) ON public.shopify_customers TO service_role;

GRANT ALL ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;
