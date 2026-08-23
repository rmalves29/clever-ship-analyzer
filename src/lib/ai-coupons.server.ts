import { endOfDay, startOfDay } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const TZ = "America/Sao_Paulo";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const COUPON_WORDS = ["MANIA", "VIP", "MULHER", "GLOW", "STYLE", "PRESENTE", "SORTE", "LOOK"];

/** Código fácil de digitar pra cliente: palavra + 2-3 dígitos, nunca UUID/hash. */
function generateCouponCode(): string {
  const word = COUPON_WORDS[Math.floor(Math.random() * COUPON_WORDS.length)]!;
  const digits = Math.floor(10 + Math.random() * 90); // 10-99
  return `${word}${digits}`;
}

/** Sorteia um percentual entre 5% e 10%, arredondado pro inteiro mais próximo. */
function pickCouponPercentage(): number {
  const pct = 5 + Math.round(Math.random() * 5); // 5-10
  return pct / 100;
}

export type BatchCoupon = {
  code: string;
  percentage: number; // fração 0.05-0.10
  discountId: string;
  startsAt: string;
  endsAt: string; // ISO UTC, fim do dia agendado em America/Sao_Paulo
};

/** Cria (de verdade, na Shopify) o cupom do slot especial de domingo do lote de IA — % sorteado
 *  5-10%, expirando no fim do PRÓPRIO dia de envio (America/Sao_Paulo). Registra em ai_coupons
 *  pra manter histórico. Falha graciosamente — devolve {success:false} em vez de lançar, pra o
 *  lote inteiro não travar por causa da Shopify (quem chama decide o fallback). */
export async function createBatchCoupon(params: {
  scheduledDate: string; // "YYYY-MM-DD"
  batchId: string;
}): Promise<{ success: true; coupon: BatchCoupon } | { success: false; error: string }> {
  const [y, m, d] = params.scheduledDate.split("-").map(Number) as [number, number, number];
  const dayLocal = new Date(y, m - 1, d);
  const startsAt = fromZonedTime(startOfDay(dayLocal), TZ).toISOString();
  const endsAt = fromZonedTime(endOfDay(dayLocal), TZ).toISOString();

  const code = generateCouponCode();
  const percentage = pickCouponPercentage();

  const { createShopifyDiscountCodeBasic } = await import("./shopify.server");
  const result = await createShopifyDiscountCodeBasic({
    title: `Cupom VIP ${params.scheduledDate}`,
    code,
    percentageFraction: percentage,
    startsAt,
    endsAt,
  });

  const supabaseAdmin = await admin();

  if (!result.success) {
    await (supabaseAdmin.from("ai_coupons" as any) as any).insert({
      batch_id: params.batchId,
      code,
      percentage,
      scheduled_date: params.scheduledDate,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "failed",
      error: result.error,
    } as never);
    return { success: false, error: result.error };
  }

  const { error: insertError } = await (supabaseAdmin.from("ai_coupons" as any) as any).insert({
    batch_id: params.batchId,
    code,
    percentage,
    shopify_discount_id: result.discountId,
    scheduled_date: params.scheduledDate,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "active",
  } as never);
  if (insertError) {
    // O cupom real já existe na Shopify e a mensagem precisa sair — perder o tracking local é
    // recuperável, perder a mensagem/cupom não é.
    console.error("createBatchCoupon: cupom criado na Shopify mas falhou ao registrar localmente:", insertError);
  }

  return { success: true, coupon: { code, percentage, discountId: result.discountId, startsAt, endsAt } };
}

/** Associa o cupom já criado ao item de fila correspondente — chamado depois do INSERT em
 *  ai_content_queue daquele dia (o cupom precisa existir ANTES, pro código entrar no prompt). */
export async function associateCouponWithContentItem(batchId: string, scheduledDate: string, contentQueueItemId: string): Promise<void> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin.from("ai_coupons" as any) as any)
    .update({ content_queue_item_id: contentQueueItemId } as never)
    .eq("batch_id", batchId)
    .eq("scheduled_date", scheduledDate)
    .eq("status", "active");
}
