-- Agenda a atualização diária do playbook de marketing por IA, às 7h America/Sao_Paulo (10h UTC).
SELECT cron.schedule(
  'ai-playbook-tick',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://clever-ship-analyzer.lovable.app/api/ai-routines/playbook-tick',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
               ),
    body    := '{}'::jsonb
  );
  $$
);
