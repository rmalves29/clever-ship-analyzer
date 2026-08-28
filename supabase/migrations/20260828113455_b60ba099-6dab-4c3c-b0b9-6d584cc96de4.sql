CREATE TABLE IF NOT EXISTS public.cashback_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  percentage numeric(5,2) NOT NULL DEFAULT 10,
  minimum_purchase_multiplier numeric(6,2) NOT NULL DEFAULT 3,
  expiration_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_settings_singleton CHECK (id = 1),
  CONSTRAINT cashback_settings_percentage_range CHECK (percentage > 0 AND percentage <= 100),
  CONSTRAINT cashback_settings_multiplier_range CHECK (minimum_purchase_multiplier >= 1 AND minimum_purchase_multiplier <= 100),
  CONSTRAINT cashback_settings_expiration_range CHECK (expiration_days >= 4 AND expiration_days <= 365)
);

CREATE TABLE IF NOT EXISTS public.cashback_coupons (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shopify_order_id text NOT NULL,
  order_number text,
  customer_row_id text,
  shopify_customer_gid text,
  customer_name text,
  code text NOT NULL,
  shopify_discount_id text,
  order_total numeric(12,2) NOT NULL DEFAULT 0,
  percentage numeric(5,2) NOT NULL,
  cashback_amount numeric(12,2) NOT NULL,
  minimum_purchase numeric(12,2) NOT NULL,
  currency_code text NOT NULL DEFAULT 'BRL',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_coupons_status_check CHECK (status IN ('pending','active','expired','cancel_pending','cancelled','failed')),
  CONSTRAINT cashback_coupons_dates_check CHECK (ends_at > starts_at),
  CONSTRAINT cashback_coupons_amount_check CHECK (cashback_amount >= 0 AND minimum_purchase >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS cashback_coupons_order_uidx ON public.cashback_coupons (shopify_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS cashback_coupons_code_uidx ON public.cashback_coupons (code);
CREATE UNIQUE INDEX IF NOT EXISTS cashback_coupons_discount_uidx ON public.cashback_coupons (shopify_discount_id) WHERE shopify_discount_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cashback_coupons_status_idx ON public.cashback_coupons (status);
CREATE INDEX IF NOT EXISTS cashback_coupons_dates_idx ON public.cashback_coupons (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS cashback_coupons_customer_idx ON public.cashback_coupons (customer_row_id);
CREATE INDEX IF NOT EXISTS cashback_coupons_created_idx ON public.cashback_coupons (created_at DESC);

INSERT INTO public.cashback_settings (id, enabled, percentage, minimum_purchase_multiplier, expiration_days)
VALUES (1, false, 10, 3, 30)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS cashback_settings_updated_at ON public.cashback_settings;
CREATE TRIGGER cashback_settings_updated_at BEFORE UPDATE ON public.cashback_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS cashback_coupons_updated_at ON public.cashback_coupons;
CREATE TRIGGER cashback_coupons_updated_at BEFORE UPDATE ON public.cashback_coupons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.cashback_settings FROM anon, authenticated;
REVOKE ALL ON public.cashback_coupons FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.cashback_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.cashback_coupons TO service_role;

ALTER TABLE public.cashback_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_coupons ENABLE ROW LEVEL SECURITY;