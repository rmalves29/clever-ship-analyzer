-- Agenda o motor de automação pra rodar sozinho a cada 15 min via pg_cron + pg_net,
-- chamando o endpoint /api/automations/tick (src/server.ts) autenticado por
-- store_settings.automation_tick_secret.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'whatsapp-automations-tick',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://clever-ship-analyzer.lovable.app/api/automations/tick',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
               ),
    body    := '{}'::jsonb
  );
  $$
);
