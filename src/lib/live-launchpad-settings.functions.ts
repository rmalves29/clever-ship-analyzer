import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getLiveLaunchpadStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin.from("store_settings") as any)
    .select("live_launchpad_supabase_url, live_launchpad_supabase_service_role_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    url: (data as any)?.live_launchpad_supabase_url ?? null,
    hasKey: Boolean((data as any)?.live_launchpad_supabase_service_role_key),
  };
});

const saveSchema = z.object({ url: z.string().min(1), serviceRoleKey: z.string().min(1) });

export const saveLiveLaunchpadSettings = createServerFn({ method: "POST" })
  .validator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("store_settings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return { success: false as const, error: "Configure primeiro a conexão com o Shopify em Configurações." };
    }

    const { error } = await (supabaseAdmin.from("store_settings") as any)
      .update({
        live_launchpad_supabase_url: data.url,
        live_launchpad_supabase_service_role_key: data.serviceRoleKey,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as any).id);

    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });
