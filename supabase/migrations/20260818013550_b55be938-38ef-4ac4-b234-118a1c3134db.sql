ALTER TABLE public.whatsapp_campaigns ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES public.crm_segments(id);
GRANT ALL ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;