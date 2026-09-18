create table if not exists public.landing_page_leads (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages(id) on delete cascade,
  phone text not null,
  criado_em timestamptz not null default now()
);

create index if not exists landing_page_leads_landing_page_id_idx on public.landing_page_leads (landing_page_id);
create index if not exists landing_page_leads_criado_em_idx on public.landing_page_leads (criado_em);
grant all on public.landing_page_leads to service_role;
alter table public.landing_page_leads enable row level security;
