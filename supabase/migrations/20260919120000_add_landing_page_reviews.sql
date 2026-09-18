create table if not exists public.landing_page_reviews (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages(id) on delete cascade,
  nome text not null,
  texto text not null,
  estrelas integer not null default 5,
  aprovado boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists landing_page_reviews_landing_page_id_idx on public.landing_page_reviews (landing_page_id);
grant all on public.landing_page_reviews to service_role;
alter table public.landing_page_reviews enable row level security;
