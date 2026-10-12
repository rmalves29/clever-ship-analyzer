-- Pesquisa por WhatsApp: cada cliente que clica no convite (modelo aprovado) abre uma "run" que anda pela árvore da pesquisa
-- (botões, listas, texto livre) e, ao terminar, grava a resposta em survey_responses (origem "whatsapp") com as etiquetas.
create table if not exists public.survey_wa_runs (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  phone text not null,
  customer_id text,
  context jsonb not null default '{}'::jsonb,
  node_id text not null,
  awaiting text,
  status text not null default 'active',
  answers jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  retries integer not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  response_id uuid
);
create unique index if not exists survey_wa_runs_one_active_idx on public.survey_wa_runs (phone) where status = 'active';
create index if not exists survey_wa_runs_survey_idx on public.survey_wa_runs (survey_id, status);
alter table public.survey_wa_runs enable row level security;
revoke all on public.survey_wa_runs from anon, authenticated;
grant all on public.survey_wa_runs to service_role;

-- Configuração por pesquisa: qual modelo aprovado é o convite e se o envio por WhatsApp está ligado (começa desligado).
create table if not exists public.survey_wa_config (
  survey_id uuid primary key references public.surveys(id) on delete cascade,
  template_name text,
  template_language text not null default 'pt_BR',
  enabled boolean not null default false,
  expire_hours integer not null default 24,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.survey_wa_config enable row level security;
revoke all on public.survey_wa_config from anon, authenticated;
grant all on public.survey_wa_config to service_role;
