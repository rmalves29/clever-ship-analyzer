-- Enquetes no Fluxo de Envio: pergunta em content_text, opcoes em poll_options.
alter table public.envio_messages
  add column if not exists poll_options jsonb,
  add column if not exists poll_selectable_count integer;
