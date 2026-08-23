-- Rotinas de envio geradas por IA: a IA analisa os melhores criativos (Meta Ads) e posts
-- (Instagram), monta uma mensagem pro WhatsApp e, uma vez aprovada no popup, essa rotina passa
-- a disparar sozinha na recorrência escolhida (uma vez / diária / semanal / mensal).
create table if not exists ai_send_routines (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,          -- fe_campaigns.id (live-launchpad-79), sem FK (bancos diferentes)
  campaign_name text not null,
  content_text text not null,
  content_image_url text,
  source_summary text not null,        -- transparência: em que anúncio/post a IA se baseou
  recurrence text not null check (recurrence in ('once', 'daily', 'weekly', 'monthly')),
  day_of_week smallint,                -- 0=domingo..6=sábado, só quando recurrence='weekly'
  day_of_month smallint,               -- 1..28, só quando recurrence='monthly'
  time_of_day text not null,           -- 'HH:MM', horário local America/Sao_Paulo
  next_run_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_send_routines_due_idx on ai_send_routines (status, next_run_at);
