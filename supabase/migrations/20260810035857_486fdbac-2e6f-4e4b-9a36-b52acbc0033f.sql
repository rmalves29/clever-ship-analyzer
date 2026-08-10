GRANT ALL ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
GRANT ALL ON public.store_settings TO anon;

ALTER TABLE public.store_settings DISABLE ROW LEVEL SECURITY;
