-- Rascunhos de campanha de WhatsApp: guarda o formulário da tela "Nova campanha" para editar e enviar depois.
-- Só o servidor (chave de serviço) acessa; nenhuma campanha, destinatário ou fila é criado até o envio.
create table if not exists public.wa_campaign_drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  form jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wa_campaign_drafts enable row level security;
revoke all on public.wa_campaign_drafts from anon, authenticated;
grant all on public.wa_campaign_drafts to service_role;
