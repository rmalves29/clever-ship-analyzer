-- Fluxo conversacional: caminho que sai do botão de link de uma etapa de envio. O clique passa por
-- /fc/<run>/<etapa> (registra e redireciona) e abre uma execução nova; source_click evita abrir duas
-- execuções se a cliente tocar mais de uma vez.
ALTER TABLE whatsapp_conversation_runs ADD COLUMN IF NOT EXISTS source_click text;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversation_runs_source_click_key
  ON whatsapp_conversation_runs (source_click) WHERE source_click IS NOT NULL;
