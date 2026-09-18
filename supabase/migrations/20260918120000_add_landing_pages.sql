create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  status text not null default 'rascunho',
  conteudo jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists landing_pages_status_idx on public.landing_pages (status);
grant all on public.landing_pages to service_role;
alter table public.landing_pages enable row level security;
