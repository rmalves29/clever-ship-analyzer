-- Diferencia imagem de vídeo redondo na fila do calendário com IA.
-- `content_image_url` permanece como nome legado da URL para não quebrar lotes antigos.

ALTER TABLE public.ai_content_queue
  ADD COLUMN IF NOT EXISTS content_media_type text;

UPDATE public.ai_content_queue
SET content_media_type = CASE
  WHEN content_image_url IS NULL THEN 'none'
  ELSE 'image'
END
WHERE content_media_type IS NULL;

ALTER TABLE public.ai_content_queue
  ALTER COLUMN content_media_type SET DEFAULT 'none',
  ALTER COLUMN content_media_type SET NOT NULL;

ALTER TABLE public.ai_content_queue
  DROP CONSTRAINT IF EXISTS ai_content_queue_media_type_check;

ALTER TABLE public.ai_content_queue
  ADD CONSTRAINT ai_content_queue_media_type_check
  CHECK (content_media_type = ANY (ARRAY[
    'none'::text,
    'image'::text,
    'video_note'::text
  ]));

COMMENT ON COLUMN public.ai_content_queue.content_media_type IS
  'Tipo do anexo: none, image ou video_note (PTV/vídeo redondo no WhatsApp).';
