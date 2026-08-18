-- Adicionar coluna rfm_segment à tabela shopify_customers
ALTER TABLE public.shopify_customers ADD COLUMN IF NOT EXISTS rfm_segment TEXT;

-- Garantir que as permissões continuem corretas
GRANT SELECT, UPDATE, INSERT ON public.shopify_customers TO authenticated;
GRANT ALL ON public.shopify_customers TO service_role;

-- Comentário para documentar os segmentos possíveis
COMMENT ON COLUMN public.shopify_customers.rfm_segment IS 'Segmentação RFM: Campeões, Leais, Potencialmente Leais, Novos, Precisa de Atenção, Quase Hibernando, Em Risco, Hibernando, Não pode perder, Perdidos';
