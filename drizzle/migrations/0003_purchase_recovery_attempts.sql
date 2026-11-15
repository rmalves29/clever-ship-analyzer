ALTER TABLE public.whatsapp_automations DROP CONSTRAINT IF EXISTS whatsapp_automations_kind_check;
ALTER TABLE public.whatsapp_automations ADD CONSTRAINT whatsapp_automations_kind_check
  CHECK (automation_kind = ANY (ARRAY['segment'::text, 'rfm'::text, 'cashback'::text, 'purchase_recovery'::text]));

CREATE TABLE public.purchase_recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.whatsapp_automations(id) ON DELETE CASCADE,
  attempt_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('checkout', 'order')),
  source_id text NOT NULL,
  cohort text NOT NULL CHECK (cohort IN ('initial', 'continuous')),
  customer_id text,
  email text,
  phone text,
  phone_key text,
  first_name text,
  recovery_url text,
  attempt_at timestamptz NOT NULL,
  eligible_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued_initial', 'waiting_reminder', 'queued_reminder', 'completed', 'exited', 'excluded', 'failed')),
  exit_reason text,
  initial_recipient_id uuid,
  initial_queued_at timestamptz,
  initial_sent_at timestamptz,
  reminder_due_at timestamptz,
  reminder_recipient_id uuid,
  reminder_queued_at timestamptz,
  reminder_sent_at timestamptz,
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.purchase_recovery_attempts TO service_role;

ALTER TABLE public.purchase_recovery_attempts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX purchase_recovery_attempts_key_idx
  ON public.purchase_recovery_attempts (automation_id, attempt_key);

CREATE UNIQUE INDEX purchase_recovery_attempts_one_open_per_phone_idx
  ON public.purchase_recovery_attempts (automation_id, phone_key)
  WHERE status IN ('pending', 'queued_initial', 'waiting_reminder', 'queued_reminder') AND phone_key IS NOT NULL;

CREATE INDEX purchase_recovery_attempts_status_idx
  ON public.purchase_recovery_attempts (automation_id, status);

CREATE INDEX purchase_recovery_attempts_phone_idx
  ON public.purchase_recovery_attempts (automation_id, phone_key, created_at DESC);

CREATE INDEX purchase_recovery_attempts_initial_recipient_idx
  ON public.purchase_recovery_attempts (initial_recipient_id) WHERE initial_recipient_id IS NOT NULL;

CREATE INDEX purchase_recovery_attempts_reminder_recipient_idx
  ON public.purchase_recovery_attempts (reminder_recipient_id) WHERE reminder_recipient_id IS NOT NULL;

CREATE TRIGGER purchase_recovery_attempts_updated_at
  BEFORE UPDATE ON public.purchase_recovery_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();