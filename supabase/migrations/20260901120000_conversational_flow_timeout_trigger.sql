-- Novo gatilho "sem resposta em X minutos" pros fluxos conversacionais (bot de atendimento por
-- setor). trigger_type continua sendo validado só no app (zod) — essas tabelas não têm CHECK
-- constraint de trigger_type hoje.
ALTER TABLE whatsapp_conversational_flows ADD COLUMN IF NOT EXISTS trigger_timeout_minutes integer;
