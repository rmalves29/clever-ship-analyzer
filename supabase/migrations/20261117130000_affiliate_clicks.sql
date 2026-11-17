-- Cliques no link curto da afiliada (/a/<codigo>): contagem por afiliada.
create table if not exists crm.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references crm.affiliates (id) on delete cascade,
  created_at timestamptz not null default now(),
  referrer text
);
create index if not exists affiliate_clicks_affiliate_idx on crm.affiliate_clicks (affiliate_id, created_at desc);

alter table crm.affiliate_clicks enable row level security;
revoke all on crm.affiliate_clicks from anon, authenticated;
grant select, insert, delete on crm.affiliate_clicks to service_role;

create or replace view crm.affiliate_click_counts as
select
  affiliate_id,
  count(*)::int as clicks,
  count(*) filter (where created_at >= now() - interval '7 days')::int as clicks_7d
from crm.affiliate_clicks
group by affiliate_id;
revoke all on crm.affiliate_click_counts from anon, authenticated;
grant select on crm.affiliate_click_counts to service_role;
