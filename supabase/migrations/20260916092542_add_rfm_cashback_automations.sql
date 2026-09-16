-- Pacote de automacoes de ciclo de vida:
--   * uma regua para cada segmento comprador da matriz RFM;
--   * uma regua de lembretes de cashback ancorada nas datas reais do cupom;
--   * saida segura quando o cliente muda de RFM ou quando o cashback e usado/cancelado.

ALTER TABLE public.whatsapp_automations
  ADD COLUMN IF NOT EXISTS automation_kind text NOT NULL DEFAULT 'segment',
  ADD COLUMN IF NOT EXISTS trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_automations
  DROP CONSTRAINT IF EXISTS whatsapp_automations_kind_check;
ALTER TABLE public.whatsapp_automations
  ADD CONSTRAINT whatsapp_automations_kind_check
  CHECK (automation_kind IN ('segment', 'rfm', 'cashback'));

CREATE INDEX IF NOT EXISTS whatsapp_automations_kind_active_idx
  ON public.whatsapp_automations (automation_kind, ativo);

ALTER TABLE public.whatsapp_automations
  DROP CONSTRAINT IF EXISTS whatsapp_automations_reentry_mode_check;
ALTER TABLE public.whatsapp_automations
  ADD CONSTRAINT whatsapp_automations_reentry_mode_check
  CHECK (reentry_mode IN ('once', 'per_order', 'per_checkout', 'after_days', 'per_segment_entry'));

ALTER TABLE public.whatsapp_automation_runs
  DROP CONSTRAINT IF EXISTS whatsapp_automation_runs_status_check;
ALTER TABLE public.whatsapp_automation_runs
  ADD CONSTRAINT whatsapp_automation_runs_status_check
  CHECK (status IN ('pending_approval', 'active', 'waiting_send', 'completed', 'failed', 'exited'));

ALTER TABLE public.shopify_customers
  ADD COLUMN IF NOT EXISTS rfm_segment_changed_at timestamptz;

UPDATE public.shopify_customers
SET rfm_segment_changed_at = COALESCE(updated_at, created_at, now())
WHERE rfm_segment_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS shopify_customers_rfm_entry_idx
  ON public.shopify_customers (rfm_segment, rfm_segment_changed_at);

-- A coluna ja e usada pelo codigo atual. O IF NOT EXISTS tambem corrige bancos que
-- receberam a alteracao manualmente antes de ela ganhar uma migration versionada.
ALTER TABLE public.cashback_settings
  ADD COLUMN IF NOT EXISTS activation_delay_days integer NOT NULL DEFAULT 3;

ALTER TABLE public.cashback_settings
  DROP CONSTRAINT IF EXISTS cashback_settings_activation_delay_range;
ALTER TABLE public.cashback_settings
  ADD CONSTRAINT cashback_settings_activation_delay_range
  CHECK (activation_delay_days BETWEEN 0 AND 30);

ALTER TABLE public.cashback_coupons
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS redeemed_order_id text;

ALTER TABLE public.cashback_coupons
  DROP CONSTRAINT IF EXISTS cashback_coupons_status_check;
ALTER TABLE public.cashback_coupons
  ADD CONSTRAINT cashback_coupons_status_check
  CHECK (status IN ('pending', 'active', 'expired', 'used', 'cancel_pending', 'cancelled', 'failed'));

CREATE INDEX IF NOT EXISTS cashback_coupons_open_reminders_idx
  ON public.cashback_coupons (ends_at, starts_at)
  WHERE status IN ('pending', 'active');

-- O motor novo usa wa_jobs/wa_campaign_recipients. Mantem o opt-out como defesa
-- no banco, inclusive se ele chegar depois de o lote ja ter sido enfileirado.
CREATE OR REPLACE FUNCTION public.guard_wa_job_marketing_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('queued', 'retry_wait')
    AND EXISTS (
      SELECT 1
      FROM public.wa_campaign_recipients recipient
      JOIN public.wa_campaigns campaign ON campaign.id = recipient.campaign_id
      JOIN public.whatsapp_suppressions suppression ON suppression.phone = recipient.phone
      WHERE recipient.id = NEW.recipient_id
        AND campaign.message_type = 'marketing'
        AND suppression.marketing_opt_out = true
    )
  THEN
    NEW.status := 'cancelled';
    NEW.error := 'opt-out de marketing';
    NEW.next_attempt_at := null;
    NEW.locked_by := null;
    NEW.locked_at := null;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_jobs_marketing_suppression_guard ON public.wa_jobs;
CREATE TRIGGER wa_jobs_marketing_suppression_guard
  BEFORE INSERT OR UPDATE OF status, next_attempt_at ON public.wa_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_wa_job_marketing_suppression();

CREATE OR REPLACE FUNCTION public.close_wa_recipient_for_suppressed_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND NEW.error = 'opt-out de marketing' THEN
    UPDATE public.wa_campaign_recipients
    SET status = 'cancelled',
        error_message = 'opt-out de marketing',
        updated_at = now()
    WHERE id = NEW.recipient_id;

    UPDATE public.whatsapp_automation_runs run
    SET status = 'failed',
        last_error = 'opt-out de marketing',
        next_run_at = null,
        updated_at = now()
    FROM public.wa_campaign_recipients recipient
    WHERE recipient.id = NEW.recipient_id
      AND run.campaign_id = recipient.campaign_id
      AND run.customer_id = recipient.customer_id
      AND run.status IN ('waiting_send', 'pending_approval', 'active');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_jobs_close_suppressed_recipient ON public.wa_jobs;
CREATE TRIGGER wa_jobs_close_suppressed_recipient
  AFTER INSERT OR UPDATE OF status ON public.wa_jobs
  FOR EACH ROW EXECUTE FUNCTION public.close_wa_recipient_for_suppressed_job();

CREATE OR REPLACE FUNCTION public.apply_wa_marketing_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.marketing_opt_out = true THEN
    UPDATE public.wa_jobs job
    SET status = 'cancelled',
        error = 'opt-out de marketing',
        next_attempt_at = null,
        locked_by = null,
        locked_at = null,
        updated_at = now()
    FROM public.wa_campaign_recipients recipient,
         public.wa_campaigns campaign
    WHERE job.recipient_id = recipient.id
      AND campaign.id = recipient.campaign_id
      AND recipient.phone = NEW.phone
      AND campaign.message_type = 'marketing'
      AND job.status IN ('queued', 'retry_wait');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_suppressions_apply_to_wa_queue ON public.whatsapp_suppressions;
CREATE TRIGGER whatsapp_suppressions_apply_to_wa_queue
  AFTER INSERT OR UPDATE OF marketing_opt_out ON public.whatsapp_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.apply_wa_marketing_suppression();

-- Os modelos sao instalados pausados e sem template da Meta. Assim a migration nunca
-- dispara mensagem por acidente: o operador abre cada regua, escolhe os templates
-- aprovados, revisa as variaveis e so entao ativa.
WITH definitions(segmento, slug, descricao, primeiro_dia, intervalo_segundo_envio) AS (
  VALUES
    ('Campeões', 'campeoes', 'Relacionamento VIP: acesso antecipado e beneficio exclusivo.', 7, 23),
    ('Leais', 'leais', 'Fidelizacao: novidades relevantes e incentivo de recorrencia.', 7, 14),
    ('Potencialmente Leais', 'potencialmente-leais', 'Conduz a terceira compra com cross-sell e beneficio progressivo.', 2, 5),
    ('Novos', 'novos', 'Pos-compra e incentivo para a segunda compra.', 1, 4),
    ('Precisa de atenção', 'precisa-atencao', 'Lembrete de retorno antes de o relacionamento esfriar.', 0, 3),
    ('Quase hibernando', 'quase-hibernando', 'Reativacao leve para clientes de baixa frequencia.', 0, 7),
    ('Em risco', 'em-risco', 'Recuperacao prioritaria de clientes que ja compravam com frequencia.', 0, 3),
    ('Hibernando', 'hibernando', 'Campanha de reconquista com motivo forte para voltar.', 0, 7),
    ('Não pode perder', 'nao-pode-perder', 'Resgate VIP rapido para clientes historicamente valiosos.', 0, 2),
    ('Perdidos', 'perdidos', 'Ultima tentativa de reativacao, com reforco posterior.', 0, 7)
), rows_to_insert AS (
  SELECT
    definition.*,
    segment.id AS segment_id,
    jsonb_build_array(
      jsonb_build_object(
        'id', 'rfm-' || definition.slug || '-1',
        'type', 'send',
        'waitMinutes', definition.primeiro_dia * 1440,
        'waitValue', definition.primeiro_dia,
        'waitUnit', 'days',
        'templateName', '',
        'templateLanguage', 'pt_BR',
        'messageType', 'marketing',
        'bodyParams', '[]'::jsonb,
        'bodyParamTokens', '[]'::jsonb,
        'couponCode', null,
        'nextStepId', 'rfm-' || definition.slug || '-2'
      ),
      jsonb_build_object(
        'id', 'rfm-' || definition.slug || '-2',
        'type', 'send',
        'waitMinutes', definition.intervalo_segundo_envio * 1440,
        'waitValue', definition.intervalo_segundo_envio,
        'waitUnit', 'days',
        'templateName', '',
        'templateLanguage', 'pt_BR',
        'messageType', 'marketing',
        'bodyParams', '[]'::jsonb,
        'bodyParamTokens', '[]'::jsonb,
        'couponCode', null,
        'nextStepId', null
      )
    ) AS steps
  FROM definitions AS definition
  JOIN public.crm_segments AS segment
    ON lower(trim(segment.nome)) = lower(trim('RFM — ' || definition.segmento))
)
INSERT INTO public.whatsapp_automations (
  nome,
  descricao,
  segment_type,
  segment_id,
  steps,
  requer_aprovacao,
  ativo,
  origem,
  reentry_mode,
  reentry_after_days,
  automation_kind,
  trigger_config
)
SELECT
  'RFM — ' || row.segmento,
  row.descricao || ' Os tempos sugeridos podem ser alterados antes de ativar.',
  'custom',
  row.segment_id,
  row.steps,
  false,
  false,
  'rfm',
  'per_segment_entry',
  null,
  'rfm',
  jsonb_build_object(
    'rfmSegment', row.segmento,
    'recommendedFirstDay', row.primeiro_dia,
    'recommendedSecondGapDays', row.intervalo_segundo_envio
  )
FROM rows_to_insert AS row
WHERE NOT EXISTS (
  SELECT 1
  FROM public.whatsapp_automations AS existing
  WHERE existing.automation_kind = 'rfm'
    AND existing.trigger_config->>'rfmSegment' = row.segmento
);

INSERT INTO public.whatsapp_automations (
  nome,
  descricao,
  segment_type,
  segment_id,
  steps,
  requer_aprovacao,
  ativo,
  origem,
  reentry_mode,
  reentry_after_days,
  automation_kind,
  trigger_config
)
SELECT
  'Cashback — lembretes ate expirar',
  'Avisa quando o cashback e liberado e reforca 7, 3 e 1 dia antes, alem do ultimo aviso 3 horas antes de expirar.',
  'cashback_expiring',
  null,
  jsonb_build_array(
    jsonb_build_object(
      'id', 'cashback-liberado', 'type', 'send', 'waitMinutes', 0,
      'templateName', '', 'templateLanguage', 'pt_BR', 'messageType', 'marketing',
      'bodyParams', '[]'::jsonb, 'bodyParamTokens', '[]'::jsonb, 'couponCode', null,
      'schedule', jsonb_build_object('anchor', 'cashback_starts_at', 'offsetMinutes', 0),
      'nextStepId', 'cashback-7d'
    ),
    jsonb_build_object(
      'id', 'cashback-7d', 'type', 'send', 'waitMinutes', 0,
      'templateName', '', 'templateLanguage', 'pt_BR', 'messageType', 'marketing',
      'bodyParams', '[]'::jsonb, 'bodyParamTokens', '[]'::jsonb, 'couponCode', null,
      'schedule', jsonb_build_object('anchor', 'cashback_ends_at', 'offsetMinutes', -10080),
      'nextStepId', 'cashback-3d'
    ),
    jsonb_build_object(
      'id', 'cashback-3d', 'type', 'send', 'waitMinutes', 0,
      'templateName', '', 'templateLanguage', 'pt_BR', 'messageType', 'marketing',
      'bodyParams', '[]'::jsonb, 'bodyParamTokens', '[]'::jsonb, 'couponCode', null,
      'schedule', jsonb_build_object('anchor', 'cashback_ends_at', 'offsetMinutes', -4320),
      'nextStepId', 'cashback-1d'
    ),
    jsonb_build_object(
      'id', 'cashback-1d', 'type', 'send', 'waitMinutes', 0,
      'templateName', '', 'templateLanguage', 'pt_BR', 'messageType', 'marketing',
      'bodyParams', '[]'::jsonb, 'bodyParamTokens', '[]'::jsonb, 'couponCode', null,
      'schedule', jsonb_build_object('anchor', 'cashback_ends_at', 'offsetMinutes', -1440),
      'nextStepId', 'cashback-final'
    ),
    jsonb_build_object(
      'id', 'cashback-final', 'type', 'send', 'waitMinutes', 0,
      'templateName', '', 'templateLanguage', 'pt_BR', 'messageType', 'marketing',
      'bodyParams', '[]'::jsonb, 'bodyParamTokens', '[]'::jsonb, 'couponCode', null,
      'schedule', jsonb_build_object('anchor', 'cashback_ends_at', 'offsetMinutes', -180),
      'nextStepId', null
    )
  ),
  false,
  false,
  'cashback',
  'per_order',
  null,
  'cashback',
  jsonb_build_object('stopWhenUsed', true, 'stopWhenExpired', true)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.whatsapp_automations AS existing
  WHERE existing.automation_kind = 'cashback'
);
