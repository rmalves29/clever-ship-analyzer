-- Análises das pesquisas feitas pela IA: cada rodada guarda o relatório e a MEMÓRIA acumulada (aprendizados), que a
-- rodada seguinte usa como ponto de partida e que a análise geral do dashboard lê. Só o servidor acessa.
create table if not exists public.survey_analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'running',
  mode text not null default 'AB',
  context jsonb not null default '{}'::jsonb,
  surveys jsonb not null default '[]'::jsonb,
  parts jsonb not null default '{}'::jsonb,
  report text,
  memory jsonb,
  error text,
  model text
);
create index if not exists survey_analyses_created_idx on public.survey_analyses (created_at desc);
alter table public.survey_analyses enable row level security;
revoke all on public.survey_analyses from anon, authenticated;
grant all on public.survey_analyses to service_role;
