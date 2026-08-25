-- A automação não pode avançar só porque uma mensagem entrou na fila.
-- waiting_send significa: mensagem enfileirada/enviando, aguardando resultado definitivo do worker.

ALTER TABLE public.whatsapp_automation_runs
  DROP CONSTRAINT IF EXISTS whatsapp_automation_runs_status_check;

ALTER TABLE public.whatsapp_automation_runs
  ADD CONSTRAINT whatsapp_automation_runs_status_check
  CHECK (status IN ('pending_approval', 'active', 'waiting_send', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS whatsapp_automation_runs_campaign_customer_status_idx
  ON public.whatsapp_automation_runs (campaign_id, customer_id, status);
