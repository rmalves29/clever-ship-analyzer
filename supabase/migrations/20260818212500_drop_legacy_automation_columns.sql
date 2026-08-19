-- Limpeza: as colunas abaixo eram usadas por whatsapp_automations antes do motor de etapas
-- (steps jsonb). Confirmado por grep que nada no código lê mais delas — a etapa 1 de "steps"
-- já carrega o mesmo template/params/janela que essas colunas guardavam.
ALTER TABLE public.whatsapp_automations
  DROP COLUMN IF EXISTS template_name,
  DROP COLUMN IF EXISTS template_language,
  DROP COLUMN IF EXISTS message_type,
  DROP COLUMN IF EXISTS body_params,
  DROP COLUMN IF EXISTS coupon_code,
  DROP COLUMN IF EXISTS janela_horas;
