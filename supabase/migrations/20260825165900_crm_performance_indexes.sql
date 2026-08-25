-- Índices de suporte aos caminhos mais pesados do CRM.
-- São idempotentes para permitir reaplicação segura em ambientes diferentes.

create index if not exists idx_shopify_orders_customer_processed
  on public.shopify_orders (customer_id, processed_at desc)
  where customer_id is not null;

create index if not exists idx_shopify_orders_financial_cancelled
  on public.shopify_orders (financial_status, cancelled_at, processed_at desc);

create index if not exists idx_shopify_order_items_order
  on public.shopify_order_items (order_id);

create index if not exists idx_shopify_order_items_product_order
  on public.shopify_order_items (product_id, order_id)
  where product_id is not null;

create index if not exists idx_shopify_order_items_sku_order
  on public.shopify_order_items (sku, order_id)
  where sku is not null and sku <> '';

create index if not exists idx_shopify_abandoned_customer_created
  on public.shopify_abandoned_checkouts (customer_id, created_at desc)
  where customer_id is not null;

create index if not exists idx_shopify_fulfillments_created_order
  on public.shopify_fulfillments (created_at desc, order_id);

create index if not exists idx_shopify_customers_updated
  on public.shopify_customers (updated_at desc);

create index if not exists idx_shopify_customers_rfm
  on public.shopify_customers (rfm_segment)
  where rfm_segment is not null;

create index if not exists idx_whatsapp_campaign_recipients_customer_campaign
  on public.whatsapp_campaign_recipients (customer_id, campaign_id, status);

create index if not exists idx_whatsapp_campaign_recipients_campaign_customer
  on public.whatsapp_campaign_recipients (campaign_id, customer_id);

create index if not exists idx_whatsapp_automation_runs_customer_automation
  on public.whatsapp_automation_runs (customer_id, automation_id, status);

create index if not exists idx_whatsapp_automation_runs_automation_customer
  on public.whatsapp_automation_runs (automation_id, customer_id);

create index if not exists idx_crm_segments_created
  on public.crm_segments (criado_em desc);

-- Atualiza estatísticas para o planner aproveitar melhor os novos índices após a migração.
analyze public.shopify_orders;
analyze public.shopify_order_items;
analyze public.shopify_abandoned_checkouts;
analyze public.shopify_fulfillments;
analyze public.shopify_customers;
analyze public.whatsapp_campaign_recipients;
analyze public.whatsapp_automation_runs;
analyze public.crm_segments;
