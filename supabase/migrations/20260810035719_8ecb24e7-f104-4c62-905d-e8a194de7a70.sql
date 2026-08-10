ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Users can view store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Users can update store settings" ON public.store_settings;

CREATE POLICY "Users can view store settings" ON public.store_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert store settings" ON public.store_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update store settings" ON public.store_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete store settings" ON public.store_settings FOR DELETE TO authenticated USING (true);
