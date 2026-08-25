-- Congela o contexto comercial que originou cada execução de automação.
-- Isso impede uma etapa futura de usar acidentalmente um pedido/checkout mais novo do cliente.

ALTER TABLE public.whatsapp_automation_runs
  ADD COLUMN IF NOT EXISTS event_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS context_key text;

UPDATE public.whatsapp_automation_runs
SET context_key = 'legacy:' || id::text
WHERE context_key IS NULL;

CREATE INDEX IF NOT EXISTS whatsapp_automation_runs_context_key_idx
  ON public.whatsapp_automation_runs (automation_id, context_key);
