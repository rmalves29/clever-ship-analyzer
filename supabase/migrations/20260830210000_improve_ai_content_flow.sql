-- Segurança, auditoria e estados reais do calendário de mensagens gerado por IA.

ALTER TABLE public.ai_content_queue
  ADD COLUMN IF NOT EXISTS envio_message_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS generation_model text,
  ADD COLUMN IF NOT EXISTS prompt_snapshot text,
  ADD COLUMN IF NOT EXISTS generation_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.ai_content_queue
  DROP CONSTRAINT IF EXISTS ai_content_queue_status_check;

ALTER TABLE public.ai_content_queue
  ADD CONSTRAINT ai_content_queue_status_check
  CHECK (status = ANY (ARRAY[
    'review'::text,
    'processing'::text,
    'approved'::text,
    'scheduled'::text,
    'rejected'::text,
    'sent'::text,
    'failed'::text
  ]));

ALTER TABLE public.ai_coupons
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.ai_coupons
  ALTER COLUMN status SET DEFAULT 'prepared';

ALTER TABLE public.ai_coupons
  DROP CONSTRAINT IF EXISTS ai_coupons_status_check;

ALTER TABLE public.ai_coupons
  ADD CONSTRAINT ai_coupons_status_check
  CHECK (status = ANY (ARRAY[
    'prepared'::text,
    'active'::text,
    'cancelled'::text,
    'expired'::text,
    'failed'::text
  ]));

UPDATE public.ai_content_queue
SET envio_message_ids = ARRAY[envio_message_id]
WHERE envio_message_id IS NOT NULL
  AND cardinality(envio_message_ids) = 0;

UPDATE public.ai_content_queue AS queue
SET
  status = CASE
    WHEN message.status = 'sent' THEN 'sent'
    WHEN message.status = 'failed' THEN 'failed'
    ELSE 'scheduled'
  END,
  approved_at = COALESCE(queue.approved_at, queue.updated_at),
  sent_at = CASE WHEN message.status = 'sent' THEN message.sent_at ELSE queue.sent_at END,
  last_error = CASE WHEN message.status = 'failed' THEN 'O envio vinculado falhou.' ELSE queue.last_error END
FROM public.envio_messages AS message
WHERE queue.envio_message_id = message.id
  AND queue.status IN ('approved', 'sent');

UPDATE public.ai_content_queue
SET rejection_reason = COALESCE(rejection_reason, 'Rejeitada antes da atualização do fluxo de IA.')
WHERE status = 'rejected';

UPDATE public.ai_coupons
SET status = 'expired', updated_at = now()
WHERE status = 'active' AND ends_at < now();

CREATE INDEX IF NOT EXISTS ai_content_queue_envio_message_ids_idx
  ON public.ai_content_queue USING gin (envio_message_ids);

CREATE INDEX IF NOT EXISTS ai_coupons_status_date_idx
  ON public.ai_coupons (status, scheduled_date);

COMMENT ON COLUMN public.ai_content_queue.prompt_snapshot IS
  'Prompt textual exato enviado ao modelo, sem imagens em base64.';
COMMENT ON COLUMN public.ai_content_queue.generation_context IS
  'Contexto auditável da geração: briefing, fontes verificadas, ângulos, datas e eventos.';
COMMENT ON COLUMN public.ai_content_queue.envio_message_ids IS
  'Todos os envios criados para os grupos vinculados à campanha.';
