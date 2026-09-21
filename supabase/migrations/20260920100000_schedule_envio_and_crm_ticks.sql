-- Agenda os processadores automáticos do Fluxo de Envio e a sincronização da Shopify.
-- Esses endpoints já existem em src/server.ts e exigem X-Automation-Secret.
-- Sem um scheduler, as funções só executam quando chamadas manualmente.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'envio-process-scheduled') THEN
    PERFORM cron.unschedule('envio-process-scheduled');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'envio-return-dispatch') THEN
    PERFORM cron.unschedule('envio-return-dispatch');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'envio-cleanup-events') THEN
    PERFORM cron.unschedule('envio-cleanup-events');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-shopify-sync-tick') THEN
    PERFORM cron.unschedule('crm-shopify-sync-tick');
  END IF;
END
$$;

-- Mensagens agendadas: processa com baixa latência.
SELECT cron.schedule(
  'envio-process-scheduled',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://clever-ship-analyzer.lovable.app/api/envio/process-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Convites de retorno: verifica os vencimentos a cada 5 minutos.
SELECT cron.schedule(
  'envio-return-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://clever-ship-analyzer.lovable.app/api/envio/return-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Limpeza de eventos antigos: uma vez por dia, às 03:30 em America/Sao_Paulo (06:30 UTC).
SELECT cron.schedule(
  'envio-cleanup-events',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://clever-ship-analyzer.lovable.app/api/envio/cleanup-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Shopify: sincroniza a cada 10 minutos, conforme a finalidade documentada do endpoint.
SELECT cron.schedule(
  'crm-shopify-sync-tick',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://clever-ship-analyzer.lovable.app/api/crm/sync-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
