-- Garante que o worker da fila do WhatsApp rode continuamente.
-- O tick das automações apenas cria/avança jornadas; o envio real acontece
-- em /api/whatsapp/queue-tick, que processa a tabela wa_jobs.
--
-- O worker usa o mesmo segredo compartilhado do tick de automações e executa
-- múltiplos lotes por chamada (com orçamento de 50s), portanto 1 execução/min
-- reduz o risco de jobs ficarem presos e mantém a vazão do outbound.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'whatsapp-queue-tick'
  ) THEN
    PERFORM cron.unschedule('whatsapp-queue-tick');
  END IF;
END
$$;

SELECT cron.schedule(
  'whatsapp-queue-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://clever-ship-analyzer.lovable.app/api/whatsapp/queue-tick',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Automation-Secret', (SELECT automation_tick_secret FROM public.store_settings LIMIT 1)
               ),
    body    := '{}'::jsonb
  );
  $$
);
