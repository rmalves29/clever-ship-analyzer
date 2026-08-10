CREATE TABLE IF NOT EXISTS public.store_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    shopify_store_domain TEXT UNIQUE NOT NULL,
    shopify_client_id TEXT,
    shopify_client_secret TEXT,
    shopify_admin_access_token TEXT,
    last_sync_at TIMESTAMPTZ,
    last_sync_error TEXT,
    sync_status TEXT DEFAULT 'idle',
    total_orders_imported INTEGER DEFAULT 0,
    last_imported_order_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view store settings" 
ON public.store_settings FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can update store settings" 
ON public.store_settings FOR UPDATE 
TO authenticated 
USING (true);

CREATE TABLE IF NOT EXISTS public.shopify_customers (
    id TEXT PRIMARY KEY,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    city TEXT,
    province TEXT,
    country TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_customers TO authenticated;
GRANT ALL ON public.shopify_customers TO service_role;
ALTER TABLE public.shopify_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth access customers" ON public.shopify_customers FOR ALL TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.shopify_orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,
    customer_id TEXT REFERENCES public.shopify_customers(id),
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL,
    financial_status TEXT,
    fulfillment_status TEXT,
    currency_code TEXT,
    subtotal_price NUMERIC,
    total_discounts NUMERIC,
    total_shipping_price NUMERIC,
    total_tax NUMERIC,
    total_price NUMERIC NOT NULL,
    source_name TEXT,
    landing_site TEXT,
    referring_site TEXT,
    city TEXT,
    province TEXT,
    country TEXT,
    raw_data JSONB
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_orders TO authenticated;
GRANT ALL ON public.shopify_orders TO service_role;
ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth access orders" ON public.shopify_orders FOR ALL TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.shopify_order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.shopify_orders(id) ON DELETE CASCADE,
    product_id TEXT,
    variant_id TEXT,
    title TEXT,
    variant_title TEXT,
    sku TEXT,
    quantity INTEGER,
    price NUMERIC,
    total_discount NUMERIC
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_order_items TO authenticated;
GRANT ALL ON public.shopify_order_items TO service_role;
ALTER TABLE public.shopify_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth access order items" ON public.shopify_order_items FOR ALL TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.shopify_fulfillments (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.shopify_orders(id) ON DELETE CASCADE,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    tracking_company TEXT,
    tracking_number TEXT,
    tracking_url TEXT,
    raw_data JSONB
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_fulfillments TO authenticated;
GRANT ALL ON public.shopify_fulfillments TO service_role;
ALTER TABLE public.shopify_fulfillments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth access fulfillments" ON public.shopify_fulfillments FOR ALL TO authenticated USING (true);
