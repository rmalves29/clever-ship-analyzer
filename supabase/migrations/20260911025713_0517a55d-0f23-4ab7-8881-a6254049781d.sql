REVOKE EXECUTE ON FUNCTION public.claim_wa_jobs(integer, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.requeue_stale_wa_jobs(integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.wa_recalc_campaign_counters(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.wa_recipients_counter_trigger() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_wa_jobs(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_stale_wa_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_recalc_campaign_counters(uuid) TO service_role;