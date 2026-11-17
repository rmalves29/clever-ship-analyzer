-- Programa de afiliadas: cadastro, configurações, pagamentos e a visão que liga pedidos aos cupons.
-- Cada afiliada tem um cupom exclusivo (code). O pedido da Shopify guarda os cupons usados
-- (raw_data->'discountCodes'); a comissão é calculada em cima disso.

create table if not exists crm.affiliates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text not null,
  email text,
  instagram text,
  tiktok text,
  pix_key text,
  code text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'blocked')),
  commission_pct numeric(5, 2) not null default 15 check (commission_pct >= 0 and commission_pct <= 100),
  discount_pct numeric(5, 2) not null default 5 check (discount_pct >= 1 and discount_pct <= 100),
  shopify_discount_id text,
  shopify_error text,
  notes text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index if not exists affiliates_code_key on crm.affiliates (upper(code)) where code is not null;
create unique index if not exists affiliates_whatsapp_key on crm.affiliates (right(regexp_replace(whatsapp, '\D', '', 'g'), 11));
create index if not exists affiliates_status_idx on crm.affiliates (status);

create table if not exists crm.affiliate_settings (
  id boolean primary key default true check (id),
  commission_pct numeric(5, 2) not null default 15 check (commission_pct >= 0 and commission_pct <= 100),
  discount_pct numeric(5, 2) not null default 5 check (discount_pct >= 1 and discount_pct <= 100),
  hold_days integer not null default 10 check (hold_days >= 0 and hold_days <= 90),
  window_start timestamptz,
  window_end timestamptz,
  updated_at timestamptz not null default now()
);
insert into crm.affiliate_settings (id) values (true) on conflict (id) do nothing;

create table if not exists crm.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references crm.affiliates (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  paid_at timestamptz not null default now()
);
create index if not exists affiliate_payouts_affiliate_idx on crm.affiliate_payouts (affiliate_id);

-- Um pedido só pode ser pago uma vez (order_id é a chave).
create table if not exists crm.affiliate_payout_orders (
  order_id text primary key,
  payout_id uuid not null references crm.affiliate_payouts (id) on delete cascade,
  affiliate_id uuid not null references crm.affiliates (id) on delete restrict,
  commission numeric(12, 2) not null
);
create index if not exists affiliate_payout_orders_affiliate_idx on crm.affiliate_payout_orders (affiliate_id);

-- Pedidos que usaram o cupom de uma afiliada (sem diferenciar maiúsculas de minúsculas).
create or replace view crm.affiliate_orders as
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
  a.id as affiliate_id,
  a.code
from crm.shopify_orders o
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(o.raw_data -> 'discountCodes') = 'array' then o.raw_data -> 'discountCodes' else '[]'::jsonb end
) as c (code)
join crm.affiliates a on a.code is not null and upper(a.code) = upper(c.code);

alter table crm.affiliates enable row level security;
alter table crm.affiliate_settings enable row level security;
alter table crm.affiliate_payouts enable row level security;
alter table crm.affiliate_payout_orders enable row level security;
revoke all on crm.affiliate_orders, crm.affiliates, crm.affiliate_settings, crm.affiliate_payouts, crm.affiliate_payout_orders from anon, authenticated;
grant select on crm.affiliate_orders to service_role;

comment on table crm.affiliates is 'Afiliadas do programa de comissão. code = cupom exclusivo (preenchido ao aprovar).';
comment on table crm.affiliate_settings is 'Configuração única do programa: comissão, desconto ao cliente, carência e janela de vendas que contam.';
comment on table crm.affiliate_payout_orders is 'Pedidos já pagos às afiliadas; order_id único impede pagar duas vezes.';
