ALTER TABLE public.store_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Users can insert store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Users can update store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Users can delete store settings" ON public.store_settings;

CREATE POLICY "Allow all to authenticated" ON public.store_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
