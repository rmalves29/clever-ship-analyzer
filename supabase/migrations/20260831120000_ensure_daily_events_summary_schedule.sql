-- Mantém a geração do resumo diário registrada no código do projeto e idempotente no banco.
-- 11:00 UTC = 08:00 em America/Sao_Paulo.
DO $$
DECLARE
  v_jobid bigint;
  v_command text := $cron$
    SELECT net.http_post(
      url     := 'https://clever-ship-analyzer.lovable.app/api/events/daily-analysis',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
                 ),
      body    := '{}'::jsonb
    );
  $cron$;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'crm-daily-events-analysis';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id := v_jobid,
      schedule := '0 11 * * *',
      command := v_command,
      active := true
    );
  ELSE
    PERFORM cron.schedule(
      'crm-daily-events-analysis',
      '0 11 * * *',
      v_command
    );
  END IF;
END
$$;
