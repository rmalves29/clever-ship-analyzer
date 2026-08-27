-- Templates da Meta podem usar parâmetros nomeados ({{primeiro_nome}}) em vez dos
-- posicionais clássicos ({{1}}, {{2}}). Pra montar o payload de envio corretamente
-- (a Meta exige "parameter_name" nesse caso), guardamos os nomes dos tokens junto
-- com os valores em cada etapa do pipeline de envio.
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS body_param_tokens jsonb;
ALTER TABLE whatsapp_message_queue ADD COLUMN IF NOT EXISTS body_param_tokens jsonb;
