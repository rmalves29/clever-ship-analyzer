-- Credenciais do GA4 usadas somente pelas funções de servidor.
-- A tabela fica no schema public para uso pelo PostgREST com service_role,
-- mas não concede qualquer acesso a anon/authenticated.
create table if not exists public.ga4_settings (
  id smallint primary key default 1 check (id = 1),
  property_id text not null check (property_id ~ '^[0-9]+$'),
  service_account_email text not null,
  service_account_json text not null,
  connected_at timestamptz,
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ga4_settings enable row level security;

revoke all on table public.ga4_settings from public, anon, authenticated;
grant all on table public.ga4_settings to service_role;

comment on table public.ga4_settings is
  'Configuração server-only da Google Analytics Data API; nunca expor service_account_json ao navegador.';

