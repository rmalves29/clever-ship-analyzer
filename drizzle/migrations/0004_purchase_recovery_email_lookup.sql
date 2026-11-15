CREATE OR REPLACE FUNCTION public.purchase_recovery_orders_by_emails(p_emails text[], p_since timestamptz)
RETURNS TABLE(id text, customer_id text, email text, phone text, created_at timestamptz, financial_status text, cancelled_at timestamptz)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT o.id, o.customer_id, o.email, o.phone, o.created_at, o.financial_status, o.cancelled_at
  FROM public.shopify_orders o
  WHERE lower(o.email) = ANY (SELECT lower(e) FROM unnest(p_emails) e)
    AND o.created_at >= p_since;
$$;

CREATE OR REPLACE FUNCTION public.purchase_recovery_customers_by_emails(p_emails text[])
RETURNS TABLE(id text, email text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT c.id, c.email
  FROM public.shopify_customers c
  WHERE lower(c.email) = ANY (SELECT lower(e) FROM unnest(p_emails) e);
$$;

REVOKE ALL ON FUNCTION public.purchase_recovery_orders_by_emails(text[], timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_recovery_customers_by_emails(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_recovery_orders_by_emails(text[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.purchase_recovery_customers_by_emails(text[]) TO service_role;