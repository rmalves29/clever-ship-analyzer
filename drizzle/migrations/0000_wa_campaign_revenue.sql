CREATE OR REPLACE FUNCTION public.wa_campaign_revenue(p_window_days integer DEFAULT 30)
RETURNS TABLE (campaign_id uuid, orders integer, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH sent AS (
    SELECT r.campaign_id,
           regexp_replace(r.phone, '\D', '', 'g') AS digits,
           r.sent_at
    FROM public.wa_campaign_recipients r
    WHERE r.sent_at IS NOT NULL
      AND r.status IN ('sent','delivered','read')
  ),
  paid AS (
    SELECT o.id,
           regexp_replace(o.phone, '\D', '', 'g') AS digits,
           COALESCE(o.processed_at, o.created_at) AS paid_at,
           COALESCE(o.total_price, 0) AS total_price
    FROM public.shopify_orders o
    WHERE o.phone IS NOT NULL
      AND o.cancelled_at IS NULL
      AND upper(o.financial_status) IN ('PAID','PARTIALLY_PAID')
  ),
  matched AS (
    SELECT DISTINCT ON (p.id) p.id, s.campaign_id, p.total_price
    FROM paid p
    JOIN sent s
      ON s.digits = p.digits
     AND p.paid_at >= s.sent_at
     AND p.paid_at <= s.sent_at + make_interval(days => GREATEST(COALESCE(p_window_days, 30), 1))
    ORDER BY p.id, s.sent_at ASC
  )
  SELECT m.campaign_id, count(*)::int AS orders, COALESCE(sum(m.total_price), 0)::numeric AS revenue
  FROM matched m
  GROUP BY m.campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.wa_campaign_revenue(integer) TO service_role;