-- envio_link_clicks.campaign_id/redirected_group_id referenciavam envio_campaigns/envio_groups
-- locais, órfãs desde o repontamento pro live-launchpad-79. O redirect público (/fluxo/{slug})
-- estava quebrado silenciosamente. Remove as FKs órfãs e adiciona a coluna que permite atribuir
-- um clique a uma mensagem específica (não só à campanha).
alter table envio_link_clicks drop constraint if exists envio_link_clicks_campaign_id_fkey;
alter table envio_link_clicks drop constraint if exists envio_link_clicks_redirected_group_id_fkey;
alter table envio_link_clicks add column if not exists envio_message_id uuid;

-- Fila de revisão da geração em lote de conteúdo por IA.
create table if not exists ai_content_queue (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  campaign_id text not null,
  campaign_name text not null,
  content_text text not null,
  content_image_url text,
  link_type text check (link_type in ('instagram', 'site', 'none')),
  link_url text,
  source_summary text not null,
  scheduled_date date not null,
  time_of_day text not null,
  status text not null default 'review' check (status in ('review', 'approved', 'rejected', 'sent', 'failed')),
  envio_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_content_queue_batch_idx on ai_content_queue (batch_id);
create index if not exists ai_content_queue_status_idx on ai_content_queue (status, scheduled_date);

-- Feedback manual (bom/ruim) sobre uma mensagem já enviada — genérico, serve tanto pra
-- postagens geradas por IA quanto pras compostas manualmente.
create table if not exists envio_message_feedback (
  id uuid primary key default gen_random_uuid(),
  envio_message_id uuid not null,
  feedback text not null check (feedback in ('good', 'bad')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists envio_message_feedback_message_idx on envio_message_feedback (envio_message_id);

-- Memória de longo prazo da IA: resumo do que tem funcionado, atualizado 1x/dia, injetado em
-- todo prompt de geração futura.
alter table store_settings add column if not exists ai_marketing_playbook text;
alter table store_settings add column if not exists ai_marketing_playbook_updated_at timestamptz;
