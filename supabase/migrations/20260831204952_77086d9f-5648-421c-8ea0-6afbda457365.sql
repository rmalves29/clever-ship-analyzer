ALTER TABLE public.shopify_customers
  ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz;

CREATE INDEX IF NOT EXISTS shopify_customers_last_purchase_at_idx
  ON public.shopify_customers (last_purchase_at);