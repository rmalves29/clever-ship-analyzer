-- Colunas pra guardar a conexão com o banco do live-launchpad-79 (OrderZaps), usada pelo
-- Fluxo de Envio pra ler/escrever fe_groups/fe_campaigns em vez das tabelas envio_* locais.
-- Preenchidas manualmente em Configurações (não são secret de build — este projeto está no
-- plano Pro, sem acesso a "Segredos de compilação", que é recurso Enterprise).
alter table store_settings
  add column if not exists live_launchpad_supabase_url text,
  add column if not exists live_launchpad_supabase_service_role_key text;
