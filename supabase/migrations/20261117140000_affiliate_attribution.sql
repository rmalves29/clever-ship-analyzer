-- Atribuição de pedidos a afiliadas por três caminhos, nesta ordem de prioridade:
--   1) manual: você atribuiu o pedido a uma afiliada (corrige casos como cupom trocado no checkout);
--   2) cupom: o pedido usou o cupom exclusivo da afiliada;
--   3) link: o cliente entrou pelo link da afiliada (/a/<codigo>), que grava o atributo "afiliada" no carrinho
--      e portanto em raw_data->'customAttributes' do pedido, mesmo que o cliente tenha usado outro cupom.

create table if not exists crm.affiliate_order_overrides (
  order_id text primary key,
  affiliate_id uuid not null references crm.affiliates (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table crm.affiliate_order_overrides enable row level security;
revoke all on crm.affiliate_order_overrides from anon, authenticated;
grant select, insert, update, delete on crm.affiliate_order_overrides to service_role;

create or replace view crm.affiliate_orders as
with coupon as (
  select o.id as order_id, a.id as affiliate_id, a.code, 'coupon'::text as attribution
  from crm.shopify_orders o
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(o.raw_data -> 'discountCodes') = 'array' then o.raw_data -> 'discountCodes' else '[]'::jsonb end
  ) as c (code)
  join crm.affiliates a on a.code is not null and upper(a.code) = upper(c.code)
), link as (
  select o.id as order_id, a.id as affiliate_id, a.code, 'link'::text as attribution
  from crm.shopify_orders o
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(o.raw_data -> 'customAttributes') = 'array' then o.raw_data -> 'customAttributes' else '[]'::jsonb end
  ) as ca
  join crm.affiliates a on a.code is not null and upper(a.code) = upper(ca ->> 'value')
  where ca ->> 'key' = 'afiliada'
), manual as (
  select m.order_id, a.id as affiliate_id, a.code, 'manual'::text as attribution
  from crm.affiliate_order_overrides m
  join crm.affiliates a on a.id = m.affiliate_id
), picked as (
  select * from manual
  union all
  select c.* from coupon c where not exists (select 1 from manual m where m.order_id = c.order_id)
  union all
  select l.* from link l
  where not exists (select 1 from manual m where m.order_id = l.order_id)
    and not exists (select 1 from coupon c where c.order_id = l.order_id)
)
select
  o.id as order_id,
  o.order_number,
  o.created_at,
  o.financial_status,
  o.cancelled_at,
  o.subtotal_price,
  o.total_price,
  o.customer_id,
  o.email,
  o.phone,
  p.affiliate_id,
  p.code,
  p.attribution
from picked p
join crm.shopify_orders o on o.id = p.order_id;

revoke all on crm.affiliate_orders from anon, authenticated;
grant select on crm.affiliate_orders to service_role;
