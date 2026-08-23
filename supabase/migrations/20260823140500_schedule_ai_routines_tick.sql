-- Agenda o processador das rotinas de envio por IA pra rodar a cada 15 min via pg_cron + pg_net,
-- mesmo padrão do tick de automações (20260818211500_schedule_automations_tick.sql).
SELECT cron.schedule(
  'ai-send-routines-tick',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://clever-ship-analyzer.lovable.app/api/ai-routines/tick',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
               ),
    body    := '{}'::jsonb
  );
  $$
);
