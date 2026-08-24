import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const SETTINGS_ID = "ab94b0b3-7016-4c7e-9400-b092be4adb07";

const saveSchema = z.object({
  domain: z.string().min(3),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

function normalizeDomain(domain: string) {
  return domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Settings for the UI — never returns the secret values. */
export const getStoreSettings = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("store_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    domain: data.shopify_store_domain ?? "",
    hasClientId: Boolean(data.shopify_client_id),
    hasClientSecret: Boolean(data.shopify_client_secret),
    syncStatus: data.sync_status ?? "idle",
    lastSyncAt: data.last_sync_at,
    lastSyncError: data.last_sync_error,
    totalOrdersImported: data.total_orders_imported ?? 0,
  };
});

/** Saves credentials server-side (service role) — empty secret fields keep the stored value. */
export const saveStoreSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("store_settings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      shopify_store_domain: normalizeDomain(data.domain),
      updated_at: new Date().toISOString(),
    };
    if (data.clientId) patch['shopify_client_id'] = data.clientId.trim();
    if (data.clientSecret) patch['shopify_client_secret'] = data.clientSecret.trim();

    const { error } = existing
      ? await supabaseAdmin.from("store_settings").update(patch as never).eq("id", existing.id)
      : await supabaseAdmin
          .from("store_settings")
          .insert({ id: SETTINGS_ID, ...patch } as never);

    if (error) throw new Error(error.message);
    return { success: true };
  });
