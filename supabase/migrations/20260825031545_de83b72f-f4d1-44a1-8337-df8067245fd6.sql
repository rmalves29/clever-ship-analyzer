ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

UPDATE public.shopify_orders
SET cancelled_at = (raw_data->>'cancelledAt')::timestamptz
WHERE cancelled_at IS NULL
  AND raw_data->>'cancelledAt' IS NOT NULL;

CREATE INDEX IF NOT EXISTS shopify_orders_cancelled_at_idx ON public.shopify_orders (cancelled_at);