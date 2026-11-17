-- Campanhas do programa de afiliadas: cada campanha tem sua comissão, desconto ao cliente e período de vendas.
-- A inscrição vale para a campanha aberta (is_active) no momento do cadastro e herda o percentual dela.
-- Também registra o aceite da autorização de uso dos vídeos em anúncios (por N dias).

create table if not exists crm.affiliate_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  commission_pct numeric(5, 2) not null default 15 check (commission_pct >= 0 and commission_pct <= 100),
  discount_pct numeric(5, 2) not null default 5 check (discount_pct >= 1 and discount_pct <= 100),
  -- Período em que as vendas geram comissão (vazio = sem limite).
  sales_start timestamptz,
  sales_end timestamptz,
  -- Aberta para novas inscrições.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table crm.affiliate_campaigns enable row level security;
revoke all on crm.affiliate_campaigns from anon, authenticated;
grant select, insert, update, delete on crm.affiliate_campaigns to service_role;

alter table crm.affiliates add column if not exists campaign_id uuid references crm.affiliate_campaigns (id) on delete set null;
alter table crm.affiliates add column if not exists ads_authorization_at timestamptz;
alter table crm.affiliates add column if not exists ads_authorization_days integer;
create index if not exists affiliates_campaign_idx on crm.affiliates (campaign_id);

alter table crm.affiliate_settings add column if not exists ads_authorization_days integer not null default 5 check (ads_authorization_days >= 1 and ads_authorization_days <= 90);

-- Campanha inicial: Black Friday, comissão só no dia (27/11/2026, horário de Brasília).
insert into crm.affiliate_campaigns (name, commission_pct, discount_pct, sales_start, sales_end, is_active)
select 'Black Friday 2026', 15, 5, '2026-11-27T00:00:00-03:00', '2026-11-27T23:59:59.999-03:00', true
where not exists (select 1 from crm.affiliate_campaigns);

comment on table crm.affiliate_campaigns is 'Campanhas de afiliadas: comissão, desconto, período de vendas e se está aberta a inscrições.';
comment on column crm.affiliates.ads_authorization_at is 'Quando a afiliada aceitou autorizar o uso dos vídeos em anúncios (por ads_authorization_days dias).';
