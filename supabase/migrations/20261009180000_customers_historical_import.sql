-- Histórico importado de outro sistema (ex.: exportação de clientes da Tray): total de pedidos e valor
-- ESTIMADO (pedidos x ticket médio). A matriz RFM lê essas colunas em memória; nenhum pedido é criado,
-- então dashboard, faturamento e ticket médio não são afetados.
alter table public.shopify_customers add column if not exists hist_orders_count integer;
alter table public.shopify_customers add column if not exists hist_estimated_value numeric(12,2);
alter table public.shopify_customers add column if not exists hist_source text;
comment on column public.shopify_customers.hist_estimated_value is 'Estimativa (hist_orders_count x ticket médio). Não é receita real.';
