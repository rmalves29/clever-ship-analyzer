import { endOfDay, startOfDay } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const TZ = "America/Sao_Paulo";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const COUPON_WORDS = ["MANIA", "VIP", "MULHER", "GLOW", "STYLE", "PRESENTE", "SORTE", "LOOK"];

function generateCouponCode(): string {
  const word = COUPON_WORDS[Math.floor(Math.random() * COUPON_WORDS.length)]!;
  const digits = Math.floor(10 + Math.random() * 90);
  return `${word}${digits}`;
}

function pickCouponPercentage(): number {
  const pct = 5 + Math.round(Math.random() * 5);
  return pct / 100;
}

export type BatchCoupon = {
  id: string;
  code: string;
  percentage: number;
  discountId: string | null;
  startsAt: string;
  endsAt: string;
  status: "prepared" | "active" | "cancelled" | "expired" | "failed";
};

function mapCoupon(row: any): BatchCoupon {
  return {
    id: row.id,
    code: row.code,
    percentage: Number(row.percentage),
    discountId: row.shopify_discount_id ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

/** Reserva localmente os dados do cupom. Nada é criado na Shopify antes da aprovação humana. */
export async function prepareBatchCoupon(params: {
  scheduledDate: string;
  batchId: string;
}): Promise<{ success: true; coupon: BatchCoupon } | { success: false; error: string }> {
  const [year, month, day] = params.scheduledDate.split("-").map(Number) as [number, number, number];
  const dayLocal = new Date(year, month - 1, day);
  const startsAt = fromZonedTime(startOfDay(dayLocal), TZ).toISOString();
  const endsAt = fromZonedTime(endOfDay(dayLocal), TZ).toISOString();
  const percentage = pickCouponPercentage();
  const supabaseAdmin = await admin();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCouponCode();
    const { data, error } = await (supabaseAdmin.from("ai_coupons" as any) as any)
      .insert({
        batch_id: params.batchId,
        code,
        percentage,
        scheduled_date: params.scheduledDate,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "prepared",
      } as never)
      .select("*")
      .single();

    if (!error && data) return { success: true, coupon: mapCoupon(data) };
    if ((error as any)?.code !== "23505") {
      return { success: false, error: error?.message ?? "Falha ao reservar o cupom." };
    }
  }

  return { success: false, error: "Não foi possível gerar um código de cupom único." };
}

export async function associateCouponWithContentItem(batchId: string, scheduledDate: string, contentQueueItemId: string): Promise<void> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin.from("ai_coupons" as any) as any)
    .update({ content_queue_item_id: contentQueueItemId, updated_at: new Date().toISOString() } as never)
    .eq("batch_id", batchId)
    .eq("scheduled_date", scheduledDate)
    .in("status", ["prepared", "active"]);
}

/** Cria o desconto real somente quando o item correspondente é aprovado. */
export async function activateCouponForContentItem(
  contentQueueItemId: string,
): Promise<{ success: true; coupon: BatchCoupon | null } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { data: row, error } = await (supabaseAdmin.from("ai_coupons" as any) as any)
    .select("*")
    .eq("content_queue_item_id", contentQueueItemId)
    .in("status", ["prepared", "active"])
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!row) return { success: true, coupon: null };

  if (row.status === "active" && row.shopify_discount_id) {
    return { success: true, coupon: mapCoupon(row) };
  }
  if (new Date(row.ends_at).getTime() <= Date.now()) {
    await (supabaseAdmin.from("ai_coupons" as any) as any)
      .update({ status: "expired", updated_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    return { success: false, error: "O cupom desse conteúdo já expirou. Gere um novo lote." };
  }

  const { createShopifyDiscountCodeBasic, deleteShopifyDiscountCode } = await import("./shopify.server");
  const result = await createShopifyDiscountCodeBasic({
    title: `Cupom VIP ${row.scheduled_date}`,
    code: row.code,
    percentageFraction: Number(row.percentage),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  });
  if (!result.success) {
    await (supabaseAdmin.from("ai_coupons" as any) as any)
      .update({ status: "failed", error: result.error, updated_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    return result;
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await (supabaseAdmin.from("ai_coupons" as any) as any)
    .update({
      status: "active",
      shopify_discount_id: result.discountId,
      error: null,
      activated_at: now,
      updated_at: now,
    } as never)
    .eq("id", row.id)
    .eq("status", "prepared")
    .select("*")
    .maybeSingle();

  if (updateError || !updated) {
    await deleteShopifyDiscountCode(result.discountId);
    return { success: false, error: updateError?.message ?? "Cupom mudou de estado durante a aprovação." };
  }
  return { success: true, coupon: mapCoupon(updated) };
}

async function cancelCouponRow(row: any, nextStatus: "cancelled" | "prepared"): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  if (row.shopify_discount_id) {
    const { deleteShopifyDiscountCode } = await import("./shopify.server");
    const deleted = await deleteShopifyDiscountCode(row.shopify_discount_id);
    if (!deleted.success) return deleted;
  }

  const now = new Date().toISOString();
  const { error } = await (supabaseAdmin.from("ai_coupons" as any) as any)
    .update({
      status: nextStatus,
      shopify_discount_id: null,
      cancelled_at: nextStatus === "cancelled" ? now : null,
      activated_at: nextStatus === "prepared" ? null : row.activated_at,
      error: null,
      updated_at: now,
    } as never)
    .eq("id", row.id);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function cancelCouponForContentItem(contentQueueItemId: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { data: row, error } = await (supabaseAdmin.from("ai_coupons" as any) as any)
    .select("*")
    .eq("content_queue_item_id", contentQueueItemId)
    .in("status", ["prepared", "active"])
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!row) return { success: true };
  return cancelCouponRow(row, "cancelled");
}

export async function rollbackActivatedCouponForContentItem(contentQueueItemId: string): Promise<void> {
  const supabaseAdmin = await admin();
  const { data: row } = await (supabaseAdmin.from("ai_coupons" as any) as any)
    .select("*")
    .eq("content_queue_item_id", contentQueueItemId)
    .eq("status", "active")
    .maybeSingle();
  if (row) await cancelCouponRow(row, "prepared");
}

export async function cancelCouponsForBatch(batchId: string): Promise<void> {
  const supabaseAdmin = await admin();
  const { data: rows } = await (supabaseAdmin.from("ai_coupons" as any) as any)
    .select("*")
    .eq("batch_id", batchId)
    .in("status", ["prepared", "active"]);
  for (const row of (rows ?? []) as any[]) await cancelCouponRow(row, "cancelled");
}

/** Remove descontos órfãos/expirados. Chamado pelo aprendizado diário e antes de novos lotes. */
export async function cleanupOrphanedAiCoupons(): Promise<{ cleaned: number }> {
  const supabaseAdmin = await admin();
  const { data: coupons } = await (supabaseAdmin.from("ai_coupons" as any) as any)
    .select("*")
    .in("status", ["prepared", "active"]);
  const rows = (coupons ?? []) as any[];
  const itemIds = rows.map((row) => row.content_queue_item_id).filter(Boolean);
  const { data: queueRows } = itemIds.length > 0
    ? await (supabaseAdmin.from("ai_content_queue" as any) as any).select("id, status").in("id", itemIds)
    : { data: [] as any[] };
  const statusById = new Map(((queueRows ?? []) as any[]).map((row) => [row.id as string, row.status as string]));

  let cleaned = 0;
  for (const row of rows) {
    const queueStatus = row.content_queue_item_id ? statusById.get(row.content_queue_item_id) : null;
    const expired = new Date(row.ends_at).getTime() <= Date.now();
    if (!expired && queueStatus !== "rejected" && queueStatus !== "failed") continue;

    if (row.shopify_discount_id) {
      const { deleteShopifyDiscountCode } = await import("./shopify.server");
      const deleted = await deleteShopifyDiscountCode(row.shopify_discount_id);
      if (!deleted.success) continue;
    }

    const now = new Date().toISOString();
    await (supabaseAdmin.from("ai_coupons" as any) as any)
      .update({
        status: expired ? "expired" : "cancelled",
        shopify_discount_id: null,
        cancelled_at: expired ? null : now,
        updated_at: now,
      } as never)
      .eq("id", row.id);
    cleaned++;
  }
  return { cleaned };
}
