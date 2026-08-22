
CREATE TABLE IF NOT EXISTS public.flow_node_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID REFERENCES public.flow_automations(id) ON DELETE CASCADE NOT NULL,
    node_id TEXT NOT NULL,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(automation_id, node_id)
);

GRANT SELECT, INSERT, UPDATE ON public.flow_node_stats TO authenticated;
GRANT ALL ON public.flow_node_stats TO service_role;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='flow_dispatch_logs' AND column_name='node_id') THEN
        ALTER TABLE public.flow_dispatch_logs ADD COLUMN node_id TEXT;
    END IF;
END $$;
