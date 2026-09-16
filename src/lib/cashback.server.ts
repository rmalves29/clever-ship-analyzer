/** Orquestração server-side do Cashback: lê a configuração singleton, decide a
 *  elegibilidade do pedido, cria o cupom real na Shopify e mantém o registro local
 *  coerente (inclusive cancelando o cupom quando o pedido é cancelado).
 *  Nada aqui pode derrubar a sincronização do CRM — todo erro vira estado no banco. */

import {
  buildCashbackCode,
  calculateCashback,
  DEFAULT_CASHBACK_SETTINGS,
  extractCashbackOrderDiscountCodes,
  isOrderEligibleForCashback,
  normalizeCashbackCode,
  type CashbackSettings,
  type EligibilityOrder,
} from "./cashback-shared";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/**
 * Marca como utilizado o cashback resgatado em um pedido novo. A origem do cupom e
 * excluida da busca para nunca confundir geracao com resgate. Idempotente por status.
 */
export async function reconcileCashbackRedemptionForOrder(input: {
  orderId: string;
  processedAt?: string | null;
  rawData: unknown;
}): Promise<{ used: number; codes: string[] }> {
  const codes = extractCashbackOrderDiscountCodes(input.rawData);
  if (codes.length === 0) return { used: 0, codes: [] };

  const db = await admin();
  const { data, error } = await db
    .from("cashback_coupons")
    .select("id, code")
    .in("code", codes)
    .neq("shopify_order_id", input.orderId)
    .in("status", ["pending", "active"]);
  if (error) throw new Error(`Erro ao conferir uso do cashback: ${error.message}`);

  const rows = (data ?? []) as { id: number; code: string }[];
  if (rows.length === 0) return { used: 0, codes: [] };

  const usedAt = input.processedAt && Number.isFinite(new Date(input.processedAt).getTime())
    ? new Date(input.processedAt).toISOString()
    : new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from("cashback_coupons")
    .update({ status: "used", used_at: usedAt, redeemed_order_id: input.orderId, last_error: null })
    .in("id", rows.map((row) => row.id))
    .in("status", ["pending", "active"])
    .select("id");
  if (updateError) throw new Error(`Erro ao registrar uso do cashback: ${updateError.message}`);
  return { used: updated?.length ?? rows.length, codes: rows.map((row) => normalizeCashbackCode(row.code)) };
}

/** Reconfere pedidos ja sincronizados para corrigir cupons usados antes desta versao. */
export async function reconcileCashbackRedemptions(): Promise<{ scannedOrders: number; used: number }> {
  const db = await admin();
  const { data: openRows, error: openError } = await db
    .from("cashback_coupons")
    .select("id, code, shopify_order_id, created_at")
    .in("status", ["pending", "active"])
    .order("created_at", { ascending: true });
  if (openError) throw new Error(`Erro ao carregar cashbacks em aberto: ${openError.message}`);
  const open = (openRows ?? []) as { id: number; code: string; shopify_order_id: string; created_at: string }[];
  if (open.length === 0) return { scannedOrders: 0, used: 0 };

  const byCode = new Map(open.map((row) => [normalizeCashbackCode(row.code), row]));
  const oldest = open[0]!.created_at;
  let scannedOrders = 0;
  let used = 0;
  const pageSize = 500;

  for (let page = 0; ; page++) {
    const { data: orders, error } = await db
      .from("shopify_orders")
      .select("id, processed_at, created_at, raw_data")
      .gte("created_at", oldest)
      .order("created_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(`Erro ao conferir pedidos com cashback: ${error.message}`);
    if (!orders?.length) break;
    scannedOrders += orders.length;

    for (const order of orders as any[]) {
      const matched = extractCashbackOrderDiscountCodes(order.raw_data)
        .map((code) => byCode.get(code))
        .filter((row): row is (typeof open)[number] => Boolean(row && row.shopify_order_id !== String(order.id)));
      if (matched.length === 0) continue;
      const usedAt = order.processed_at ?? order.created_at ?? new Date().toISOString();
      const { data: updated, error: updateError } = await db
        .from("cashback_coupons")
        .update({ status: "used", used_at: usedAt, redeemed_order_id: order.id, last_error: null })
        .in("id", matched.map((row) => row.id))
        .in("status", ["pending", "active"])
        .select("id");
      if (updateError) throw new Error(`Erro ao corrigir cashback utilizado: ${updateError.message}`);
      used += updated?.length ?? 0;
      for (const row of matched) byCode.delete(normalizeCashbackCode(row.code));
    }

    if (orders.length < pageSize || byCode.size === 0) break;
  }

  return { scannedOrders, used };
}

export async function loadCashbackSettings(): Promise<CashbackSettings> {
  const db = await admin();
  const { data } = await db.from("cashback_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return { ...DEFAULT_CASHBACK_SETTINGS };
  return {
    enabled: Boolean(data.enabled),
    enabled_at: data.enabled_at ?? null,
    percentage: Number(data.percentage ?? DEFAULT_CASHBACK_SETTINGS.percentage),
    minimum_purchase_multiplier: Number(
      data.minimum_purchase_multiplier ?? DEFAULT_CASHBACK_SETTINGS.minimum_purchase_multiplier,
    ),
    expiration_days: Number(data.expiration_days ?? DEFAULT_CASHBACK_SETTINGS.expiration_days),
    activation_delay_days: Number(
      data.activation_delay_days ?? DEFAULT_CASHBACK_SETTINGS.activation_delay_days,
    ),
  };
}

export type CashbackOrderInput = EligibilityOrder & {
  orderNumber?: string | null;
  customerRowId?: string | null;
  customerName?: string | null;
  currencyCode?: string | null;
};

export type CashbackReconcileResult =
  | { action: "skipped"; reason: string }
  | { action: "created"; code: string }
  | { action: "retried"; code: string }
  | { action: "cancelled"; code: string }
  | { action: "cancel_pending"; code: string; error: string }
  | { action: "failed"; code: string; error: string };

async function createOnShopify(
  row: {
    code: string;
    cashback_amount: number;
    minimum_purchase: number;
    starts_at: string;
    ends_at: string;
    shopify_customer_gid: string | null;
    order_number: string | null;
  },
): Promise<{ success: true; discountId: string } | { success: false; error: string }> {
  if (!row.shopify_customer_gid) return { success: false, error: "Pedido sem cliente Shopify." };
  const { createShopifyCashbackDiscount } = await import("./shopify.server");
  return createShopifyCashbackDiscount({
    title: `Cashback pedido ${row.order_number ?? ""}`.trim(),
    code: row.code,
    amount: Number(row.cashback_amount),
    minimumSubtotal: Number(row.minimum_purchase),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    customerGid: row.shopify_customer_gid,
  });
}

async function cancelCoupon(db: any, row: any): Promise<CashbackReconcileResult> {
  if (!row.shopify_discount_id) {
    await db
      .from("cashback_coupons")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    return { action: "cancelled", code: row.code };
  }
  const { deleteShopifyDiscountCode } = await import("./shopify.server");
  const result = await deleteShopifyDiscountCode(row.shopify_discount_id);
  if (result.success) {
    await db
      .from("cashback_coupons")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    return { action: "cancelled", code: row.code };
  }
  await db.from("cashback_coupons").update({ status: "cancel_pending", last_error: result.error }).eq("id", row.id);
  return { action: "cancel_pending", code: row.code, error: result.error };
}

/** Ponto único de reconciliação por pedido. Idempotente: o unique em shopify_order_id
 *  + o código determinístico impedem qualquer duplicidade, mesmo em sincronizações
 *  simultâneas. */
export async function reconcileCashbackForOrder(
  order: CashbackOrderInput,
  settings?: CashbackSettings,
): Promise<CashbackReconcileResult> {
  const db = await admin();
  const config = settings ?? (await loadCashbackSettings());

  const { data: existing } = await db
    .from("cashback_coupons")
    .select("*")
    .eq("shopify_order_id", order.id)
    .maybeSingle();

  // Pedido cancelado: derruba o cupom existente (independente de o recurso estar ligado).
  if (order.cancelledAt) {
    if (!existing) return { action: "skipped", reason: "Pedido cancelado sem cashback." };
    if (existing.status === "cancelled") return { action: "skipped", reason: "Cashback já cancelado." };
    return cancelCoupon(db, existing);
  }

  if (existing) {
    if (existing.status === "cancel_pending") return cancelCoupon(db, existing);
    if (existing.shopify_discount_id) return { action: "skipped", reason: "Cashback já existe." };
    if (existing.status !== "failed" && existing.status !== "pending") {
      return { action: "skipped", reason: "Cashback já existe." };
    }
    const retry = await createOnShopify(existing);
    if (retry.success) {
      await db
        .from("cashback_coupons")
        .update({ shopify_discount_id: retry.discountId, status: "pending", last_error: null })
        .eq("id", existing.id);
      return { action: "retried", code: existing.code };
    }
    await db.from("cashback_coupons").update({ status: "failed", last_error: retry.error }).eq("id", existing.id);
    return { action: "failed", code: existing.code, error: retry.error };
  }

  const eligibility = isOrderEligibleForCashback(order, config);
  if (!eligibility.eligible) return { action: "skipped", reason: eligibility.reason };

  const purchasedAt = order.purchasedAt as string;
  const calc = calculateCashback(order.totalPrice, purchasedAt, config);
  if (calc.cashbackAmount <= 0) return { action: "skipped", reason: "Cashback calculado é zero." };
  const code = buildCashbackCode({ orderNumber: order.orderNumber, purchasedAt, customerName: order.customerName });

  const payload = {
    shopify_order_id: order.id,
    order_number: order.orderNumber ?? null,
    customer_row_id: order.customerRowId ?? null,
    shopify_customer_gid: order.customerGid ?? null,
    customer_name: order.customerName ?? null,
    code,
    order_total: order.totalPrice,
    percentage: config.percentage,
    cashback_amount: calc.cashbackAmount,
    minimum_purchase: calc.minimumPurchase,
    currency_code: order.currencyCode ?? "BRL",
    starts_at: calc.startsAt,
    ends_at: calc.endsAt,
    status: "pending",
  };

  const { data: inserted, error: insertError } = await db
    .from("cashback_coupons")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (insertError) {
    // 23505 = corrida com outra sincronização; o outro processo cuida da criação.
    if (String((insertError as any).code) === "23505") {
      return { action: "skipped", reason: "Cashback criado por outra sincronização." };
    }
    return { action: "failed", code, error: insertError.message };
  }

  const created = await createOnShopify(inserted);
  if (created.success) {
    await db
      .from("cashback_coupons")
      .update({ shopify_discount_id: created.discountId, status: "pending", last_error: null })
      .eq("id", inserted.id);
    return { action: "created", code };
  }
  await db.from("cashback_coupons").update({ status: "failed", last_error: created.error }).eq("id", inserted.id);
  return { action: "failed", code, error: created.error };
}

/** Chamado no fim da sincronização (e pelo botão da tela): reprocessa cupons que
 *  falharam na criação e cancelamentos que a Shopify recusou antes. */
export async function reprocessPendingCashback(limit = 50): Promise<{
  retried: number;
  cancelled: number;
  stillFailing: number;
}> {
  const db = await admin();
  const { data: rows } = await db
    .from("cashback_coupons")
    .select("*")
    .in("status", ["failed", "cancel_pending"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  let retried = 0;
  let cancelled = 0;
  let stillFailing = 0;

  for (const row of rows ?? []) {
    try {
      if (row.status === "cancel_pending") {
        const result = await cancelCoupon(db, row);
        if (result.action === "cancelled") cancelled++;
        else stillFailing++;
        continue;
      }
      if (row.shopify_discount_id) continue;
      const result = await createOnShopify(row);
      if (result.success) {
        await db
          .from("cashback_coupons")
          .update({ shopify_discount_id: result.discountId, status: "pending", last_error: null })
          .eq("id", row.id);
        retried++;
      } else {
        await db.from("cashback_coupons").update({ last_error: result.error }).eq("id", row.id);
        stillFailing++;
      }
    } catch (error) {
      stillFailing++;
      console.error("reprocessPendingCashback falhou para o cupom", row?.id, error);
    }
  }

  return { retried, cancelled, stillFailing };
}

export type CashbackContextSnapshot = {
  id: number;
  code: string;
  amount: number;
  minimumPurchase: number;
  startsAt: string;
  endsAt: string;
} | null;

/** Ajuste único: antecipa a liberação (starts_at) dos cupons ainda pendentes/ativos para a
 *  data da própria compra — tanto no banco quanto no cupom real da Shopify, já que é lá que
 *  o bloqueio de uso é aplicado de fato. Idempotente: cupom cujo starts_at já bate com a data
 *  do pedido é pulado. Processa em lote (padrão 50) para não estourar tempo de execução nem
 *  o rate limit da Shopify — chame de novo até `remaining` ser 0. */
export async function backfillCashbackStartsAtToPurchaseDate(limit = 50): Promise<{
  updated: number;
  skipped: number;
  failed: number;
  remaining: number;
  errors: { code: string; error: string }[];
}> {
  const db = await admin();

  // Busca tudo de uma vez (são poucas centenas) e filtra em memória quem realmente precisa
  // mudar — só assim dá pra paginar sem repetir o mesmo lote a cada chamada (o "já ajustado"
  // não dá pra filtrar direto na query porque starts_at e processed_at vivem em tabelas
  // diferentes e o cliente do Supabase não faz join real).
  const { data: allRowsRaw } = await db
    .from("cashback_coupons")
    .select("id, code, shopify_order_id, shopify_discount_id, starts_at")
    .in("status", ["pending", "active"])
    .not("shopify_discount_id", "is", null)
    .order("created_at", { ascending: true });
  const allRows = (allRowsRaw ?? []) as {
    id: number;
    code: string;
    shopify_order_id: string;
    shopify_discount_id: string;
    starts_at: string;
  }[];

  const orderIds = Array.from(new Set(allRows.map((r) => r.shopify_order_id)));
  const { data: ordersRaw } = orderIds.length
    ? await db.from("shopify_orders").select("id, processed_at").in("id", orderIds)
    : { data: [] };
  const orders = (ordersRaw ?? []) as { id: string; processed_at: string }[];
  const purchasedAtByOrderId = new Map(orders.map((o) => [o.id, o.processed_at]));

  let skipped = 0;
  let failed = 0;
  const errors: { code: string; error: string }[] = [];
  const pending: { id: number; code: string; shopify_discount_id: string; purchasedAt: string }[] = [];

  for (const row of allRows) {
    const purchasedAt = purchasedAtByOrderId.get(row.shopify_order_id);
    if (!purchasedAt) {
      failed++;
      errors.push({ code: row.code, error: "Pedido de origem não encontrado." });
      continue;
    }
    if (purchasedAt === row.starts_at) {
      skipped++;
      continue;
    }
    pending.push({ id: row.id, code: row.code, shopify_discount_id: row.shopify_discount_id, purchasedAt });
  }

  const batch = pending.slice(0, limit);
  let updated = 0;

  for (const row of batch) {
    try {
      const { updateShopifyDiscountStartsAt } = await import("./shopify.server");
      const result = await updateShopifyDiscountStartsAt(row.shopify_discount_id, row.purchasedAt);
      if (!result.success) {
        failed++;
        errors.push({ code: row.code, error: result.error });
        continue;
      }
      await db.from("cashback_coupons").update({ starts_at: row.purchasedAt }).eq("id", row.id);
      updated++;
    } catch (error) {
      failed++;
      errors.push({ code: row.code, error: error instanceof Error ? error.message : "Erro desconhecido." });
    }
  }

  const remaining = Math.max(0, pending.length - batch.length);
  return { updated, skipped, failed, remaining, errors };
}

/** Cupom de cashback do pedido — usado para congelar os tokens no contexto da automação. */
export async function loadCashbackForOrder(orderId: string): Promise<CashbackContextSnapshot> {
  if (!orderId) return null;
  const db = await admin();
  const { data } = await db
    .from("cashback_coupons")
    .select("id, code, cashback_amount, minimum_purchase, starts_at, ends_at, status")
    .eq("shopify_order_id", orderId)
    .maybeSingle();
  if (!data || ["cancelled", "cancel_pending", "failed", "expired", "used"].includes(String(data.status))) return null;
  return {
    id: Number(data.id),
    code: String(data.code),
    amount: Number(data.cashback_amount ?? 0),
    minimumPurchase: Number(data.minimum_purchase ?? 0),
    startsAt: String(data.starts_at),
    endsAt: String(data.ends_at),
  };
}
