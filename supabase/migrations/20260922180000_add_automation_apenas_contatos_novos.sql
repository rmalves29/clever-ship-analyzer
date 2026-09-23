alter table public.whatsapp_automations
  add column if not exists apenas_contatos_novos boolean not null default false;
