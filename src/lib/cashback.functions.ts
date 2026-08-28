import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { CASHBACK_MIN_EXPIRATION_DAYS } from "./cashback-shared";

export const getCashbackSettings = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { loadCashbackSettings } = await import("./cashback.server");
    return loadCashbackSettings();
  });

const settingsSchema = z.object({
  enabled: z.boolean(),
  percentage: z.number().min(0.01).max(100),
  minimum_purchase_multiplier: z.number().min(1).max(50),
  expiration_days: z.number().int().min(CASHBACK_MIN_EXPIRATION_DAYS).max(365),
});

export const saveCashbackSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCashbackSettings } = await import("./cashback.server");
    const current = await loadCashbackSettings();

    // enabled_at marca o início da elegibilidade: nunca geramos cupons retroativos.
    const enabledAt = data.enabled ? (current.enabled && current.enabled_at ? current.enabled_at : new Date().toISOString()) : current.enabled_at;

    const { error } = await (supabaseAdmin as any)
      .from("cashback_settings")
      .update({
        enabled: data.enabled,
        enabled_at: enabledAt,
        percentage: data.percentage,
        minimum_purchase_multiplier: data.minimum_purchase_multiplier,
        expiration_days: data.expiration_days,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(`Erro ao salvar configuração de cashback: ${error.message}`);
    return loadCashbackSettings();
  });

export const listCashbackCoupons = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("cashback_coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`Erro ao listar cupons de cashback: ${error.message}`);
    return (data ?? []) as any[];
  });

export const reprocessCashbackFailures = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { reprocessPendingCashback } = await import("./cashback.server");
    return reprocessPendingCashback();
  });
