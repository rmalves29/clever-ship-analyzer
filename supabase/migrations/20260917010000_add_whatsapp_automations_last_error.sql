-- Coluna de diagnóstico: guarda o último erro de tick isolado por automação (ver
-- automations-engine.server.ts / runAutomationsTick), pra dar visibilidade de qual automação
-- especificamente está falhando sem precisar vasculhar automation_tick_runs.
alter table whatsapp_automations add column if not exists last_error text;
