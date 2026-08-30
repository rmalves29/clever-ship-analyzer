-- 1) Trava (lease) para o tick de automações
CREATE TABLE IF NOT EXISTS public.automation_tick_locks (
  name text PRIMARY KEY,
  locked_until timestamptz NOT NULL DEFAULT now(),
  holder text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.automation_tick_locks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.automation_tick_locks TO service_role;

ALTER TABLE public.automation_tick_locks ENABLE ROW LEVEL SECURITY;

INSERT INTO public.automation_tick_locks (name, locked_until)
VALUES ('automations_tick', now() - interval '1 minute')
ON CONFLICT (name) DO NOTHING;

-- 2) Motor a cada 1 minuto (idempotente)
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'whatsapp-automations-tick';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, schedule := '* * * * *');
  ELSE
    PERFORM cron.schedule(
      'whatsapp-automations-tick',
      '* * * * *',
      $cron$
      SELECT net.http_post(
        url     := 'https://clever-ship-analyzer.lovable.app/api/automations/tick',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
                   ),
        body    := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END
$$;

-- 3) Limpeza diária de automation_tick_runs (> 30 dias)
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'automation-tick-runs-cleanup';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id := v_jobid,
      schedule := '20 4 * * *',
      command := $cron$ DELETE FROM public.automation_tick_runs WHERE started_at < now() - interval '30 days'; $cron$
    );
  ELSE
    PERFORM cron.schedule(
      'automation-tick-runs-cleanup',
      '20 4 * * *',
      $cron$ DELETE FROM public.automation_tick_runs WHERE started_at < now() - interval '30 days'; $cron$
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_automation_tick_runs_started_at ON public.automation_tick_runs (started_at);
