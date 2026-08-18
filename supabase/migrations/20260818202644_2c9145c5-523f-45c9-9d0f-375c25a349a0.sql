CREATE TABLE IF NOT EXISTS public.shopify_abandoned_checkouts (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES public.shopify_customers(id),
    email TEXT,
    phone TEXT,
    total_price NUMERIC,
    checkout_url TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    raw_data JSONB
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_abandoned_checkouts TO authenticated;
GRANT ALL ON public.shopify_abandoned_checkouts TO service_role;

ALTER TABLE public.shopify_abandoned_checkouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth access abandoned checkouts" 
ON public.shopify_abandoned_checkouts 
FOR ALL TO authenticated 
USING (true);

CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_customer_id ON public.shopify_abandoned_checkouts(customer_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_email ON public.shopify_abandoned_checkouts(email);
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_created_at ON public.shopify_abandoned_checkouts(created_at);