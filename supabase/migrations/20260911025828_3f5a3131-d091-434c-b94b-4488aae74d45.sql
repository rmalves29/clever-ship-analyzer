ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS automation_step_id TEXT,
  ADD COLUMN IF NOT EXISTS conversation_flow_step_id TEXT,
  ADD COLUMN IF NOT EXISTS queue_paused BOOLEAN NOT NULL DEFAULT false;

UPDATE public.wa_campaigns c
SET automation_step_id = o.automation_step_id,
    conversation_flow_step_id = o.conversation_flow_step_id
FROM public.whatsapp_campaigns o
WHERE o.id = c.legacy_campaign_id;

ALTER TABLE public.wa_campaign_recipients
  ADD COLUMN IF NOT EXISTS event_key TEXT NOT NULL DEFAULT '';

ALTER TABLE public.wa_campaign_recipients
  DROP CONSTRAINT IF EXISTS wa_campaign_recipients_campaign_id_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS wa_campaign_recipients_dedup_idx
  ON public.wa_campaign_recipients (campaign_id, phone, event_key);