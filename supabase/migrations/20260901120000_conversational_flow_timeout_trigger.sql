-- Novo gatilho "sem resposta em X minutos" pros fluxos conversacionais (bot de atendimento por
-- setor). trigger_type É validado por CHECK constraint no banco (whatsapp_conversational_flows_
-- trigger_type_check) — precisa ser recriada pra aceitar o valor novo, não só validar no app.
ALTER TABLE whatsapp_conversational_flows ADD COLUMN IF NOT EXISTS trigger_timeout_minutes integer;

ALTER TABLE whatsapp_conversational_flows DROP CONSTRAINT IF EXISTS whatsapp_conversational_flows_trigger_type_check;
ALTER TABLE whatsapp_conversational_flows ADD CONSTRAINT whatsapp_conversational_flows_trigger_type_check
  CHECK (trigger_type = ANY (ARRAY['button_click'::text, 'keyword'::text, 'unanswered_timeout'::text]));
