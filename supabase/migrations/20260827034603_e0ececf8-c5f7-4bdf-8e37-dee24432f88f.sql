CREATE TABLE public.whatsapp_inbox_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  customer_id TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  last_inbound_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_inbox_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.whatsapp_inbox_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  wa_message_id TEXT UNIQUE,
  status TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_inbox_messages_thread ON public.whatsapp_inbox_messages(thread_id, sent_at DESC);
CREATE INDEX idx_wa_inbox_threads_last ON public.whatsapp_inbox_threads(last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_inbox_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_inbox_messages TO authenticated;
GRANT ALL ON public.whatsapp_inbox_threads TO service_role;
GRANT ALL ON public.whatsapp_inbox_messages TO service_role;

ALTER TABLE public.whatsapp_inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_inbox_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage inbox threads" ON public.whatsapp_inbox_threads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage inbox messages" ON public.whatsapp_inbox_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);