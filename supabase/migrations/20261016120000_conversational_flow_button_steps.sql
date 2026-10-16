-- Gatilho "clique em botão" com um caminho por botão: mapa { texto do botão: id da etapa inicial }.
-- Nulo = comportamento antigo (qualquer botão listado em trigger_values começa na primeira etapa).
ALTER TABLE whatsapp_conversational_flows ADD COLUMN IF NOT EXISTS trigger_button_steps jsonb;
