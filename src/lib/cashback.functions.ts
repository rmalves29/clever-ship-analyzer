import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { minExpirationDays } from "./cashback-shared";

export const getCashbackSettings = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { loadCashbackSettings } = await import("./cashback.server");
    return loadCashbackSettings();
  });

const settingsSchema = z
  .object({
    enabled: z.boolean(),
    percentage: z.number().min(0.01).max(100),
    minimum_purchase_multiplier: z.number().min(1).max(50),
    expiration_days: z.number().int().min(1).max(365),
    activation_delay_days: z.number().int().min(0).max(30),
  })
  .refine((data) => data.expiration_days >= minExpirationDays(data.activation_delay_days), {
    message: "A validade precisa ser maior que o prazo de liberação.",
    path: ["expiration_days"],
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
        activation_delay_days: data.activation_delay_days,
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
    // Pagina até trazer TODOS os cupons — os cards de resumo somam em cima dessa lista, e um
    // limite fixo deixava os cupons mais antigos (ex.: já utilizados) de fora da conta.
    const rows: any[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 50; page++) {
      const { data, error } = await (supabaseAdmin as any)
        .from("cashback_coupons")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(`Erro ao listar cupons de cashback: ${error.message}`);
      rows.push(...((data ?? []) as any[]));
      if (!data || data.length < pageSize) break;
    }

    // Valor total do pedido que resgatou cada cupom (não só o valor do cashback).
    const redeemedIds = Array.from(new Set(rows.map((row) => row.redeemed_order_id).filter(Boolean))) as string[];
    const totalByOrderId = new Map<string, number>();
    for (let start = 0; start < redeemedIds.length; start += 200) {
      const batch = redeemedIds.slice(start, start + 200);
      const { data: orders, error: ordersError } = await (supabaseAdmin as any)
        .from("shopify_orders")
        .select("id, total_price")
        .in("id", batch);
      if (ordersError) throw new Error(`Erro ao buscar pedidos que usaram cashback: ${ordersError.message}`);
      for (const order of (orders ?? []) as any[]) totalByOrderId.set(String(order.id), Number(order.total_price ?? 0));
    }
    return rows.map((row) => ({
      ...row,
      redeemed_order_total: row.redeemed_order_id ? (totalByOrderId.get(String(row.redeemed_order_id)) ?? null) : null,
    })) as any[];
  });

export const reprocessCashbackFailures = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { reconcileCashbackRedemptions, reconcileCashbackUsageViaShopify, reprocessPendingCashback } = await import(
      "./cashback.server"
    );
    const redemptions = await reconcileCashbackRedemptions();
    const usageViaShopify = await reconcileCashbackUsageViaShopify();
    const failures = await reprocessPendingCashback();
    return { ...failures, redemptions, usageViaShopify };
  });

/** Ajuste único (chamado manualmente da tela): antecipa a liberação dos cupons ainda não
 *  usados para a data da própria compra, no banco e no cupom real da Shopify. */
export const backfillCashbackStartsAt = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { backfillCashbackStartsAtToPurchaseDate } = await import("./cashback.server");
    return backfillCashbackStartsAtToPurchaseDate(50);
  });
