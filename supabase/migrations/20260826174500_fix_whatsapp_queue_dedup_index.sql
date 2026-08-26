-- O enqueue usa PostgREST/Supabase upsert(..., { onConflict: 'dedup_key' }).
-- Um índice UNIQUE parcial (WHERE dedup_key IS NOT NULL) não pode ser inferido por
-- ON CONFLICT (dedup_key), gerando PostgreSQL 42P10 e impedindo qualquer nova
-- mensagem de entrar na fila.
--
-- UNIQUE não-parcial continua permitindo múltiplos NULLs no PostgreSQL e mantém
-- a deduplicação para todas as chaves preenchidas.

DROP INDEX IF EXISTS public.whatsapp_message_queue_dedup_key_uidx;

CREATE UNIQUE INDEX whatsapp_message_queue_dedup_key_uidx
  ON public.whatsapp_message_queue (dedup_key);
