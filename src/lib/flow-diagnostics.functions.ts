import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const getFlowStatus = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // 1. Check if webhook is receiving events
  const { count: webhookCount } = await supabaseAdmin
    .from("flow_webhook_events" as any)
    .select("*", { count: 'exact', head: true });
    
  // 2. Check recent errors (last 10 minutes to reflect real-time status after user fix)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentErrors } = await supabaseAdmin
    .from("flow_dispatch_logs" as any)
    .select("error_message, created_at")
    .eq("status", "error")
    .gt("created_at", tenMinutesAgo)
    .order("created_at", { ascending: false })
    .limit(5);

  // 3. Check credentials
  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("instagram_page_access_token, instagram_business_account_id, whatsapp_meta_app_secret")
    .single();

  return {
    webhookCount: webhookCount || 0,
    recentErrors: (recentErrors ?? []).map((e: any) => ({
      message: e.error_message,
      at: e.created_at
    })),
    hasCredentials: !!(settings?.instagram_page_access_token && settings?.instagram_business_account_id),
    hasAppSecret: !!settings?.whatsapp_meta_app_secret
  };
});
