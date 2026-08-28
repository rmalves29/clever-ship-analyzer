/** Regras puras do Cashback — sem I/O, para poderem ser testadas isoladamente.
 *  Toda a matemática monetária, a elegibilidade do pedido e a geração das datas
 *  do cupom vivem aqui; o lado servidor só orquestra Shopify + banco. */

export const CASHBACK_ACTIVATION_DELAY_DAYS = 3;
export const CASHBACK_MIN_EXPIRATION_DAYS = CASHBACK_ACTIVATION_DELAY_DAYS + 1; // 4

export type CashbackSettings = {
  enabled: boolean;
  enabled_at: string | null;
  percentage: number;
  minimum_purchase_multiplier: number;
  expiration_days: number;
};

export const DEFAULT_CASHBACK_SETTINGS: CashbackSettings = {
  enabled: false,
  enabled_at: null,
  percentage: 10,
  minimum_purchase_multiplier: 3,
  expiration_days: 30,
};

export type CashbackCouponStatus =
  | "pending"
  | "active"
  | "expired"
  | "cancel_pending"
  | "cancelled"
  | "failed";

/** Arredonda para 2 casas evitando o erro clássico de ponto flutuante (1.005 -> 1.00). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCashbackAmount(orderTotal: number, percentage: number): number {
  const total = Number.isFinite(orderTotal) ? Math.max(0, orderTotal) : 0;
  const pct = Number.isFinite(percentage) ? Math.max(0, percentage) : 0;
  return round2((total * pct) / 100);
}

export function calculateMinimumPurchase(cashbackAmount: number, multiplier: number): number {
  const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return round2(Math.max(0, cashbackAmount) * mult);
}

export type CashbackCalculation = {
  cashbackAmount: number;
  minimumPurchase: number;
  startsAt: string;
  endsAt: string;
};

export function normalizeExpirationDays(days: number): number {
  const value = Math.trunc(Number(days));
  if (!Number.isFinite(value)) return DEFAULT_CASHBACK_SETTINGS.expiration_days;
  return Math.min(365, Math.max(CASHBACK_MIN_EXPIRATION_DAYS, value));
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Datas determinísticas: mesma compra + mesma configuração => sempre os mesmos ISO. */
export function buildCashbackDates(
  purchasedAt: string | Date,
  expirationDays: number,
): { startsAt: string; endsAt: string } {
  const base = purchasedAt instanceof Date ? purchasedAt : new Date(purchasedAt);
  const safeBase = Number.isFinite(base.getTime()) ? base : new Date();
  const days = normalizeExpirationDays(expirationDays);
  return {
    startsAt: addDays(safeBase, CASHBACK_ACTIVATION_DELAY_DAYS).toISOString(),
    endsAt: addDays(safeBase, days).toISOString(),
  };
}

export function calculateCashback(
  orderTotal: number,
  purchasedAt: string | Date,
  settings: Pick<CashbackSettings, "percentage" | "minimum_purchase_multiplier" | "expiration_days">,
): CashbackCalculation {
  const cashbackAmount = calculateCashbackAmount(orderTotal, settings.percentage);
  const minimumPurchase = calculateMinimumPurchase(cashbackAmount, settings.minimum_purchase_multiplier);
  const { startsAt, endsAt } = buildCashbackDates(purchasedAt, settings.expiration_days);
  return { cashbackAmount, minimumPurchase, startsAt, endsAt };
}

/** Código estável por pedido: repetir a sincronização gera exatamente o mesmo código,
 *  o que soma com o unique de shopify_order_id para garantir idempotência. */
export function buildCashbackCode(shopifyOrderId: string): string {
  const digits = String(shopifyOrderId).replace(/\D/g, "");
  const numeric = digits.slice(-12);
  const base = numeric ? BigInt(numeric).toString(36).toUpperCase() : "0";
  let checksum = 0;
  for (const char of String(shopifyOrderId)) checksum = (checksum * 31 + char.charCodeAt(0)) % 1296;
  return `CASHBACK${base}${checksum.toString(36).toUpperCase().padStart(2, "0")}`;
}

export type EligibilityOrder = {
  id: string;
  financialStatus: string | null | undefined;
  cancelledAt: string | null | undefined;
  customerGid: string | null | undefined;
  totalPrice: number;
  purchasedAt: string | null | undefined;
};

export type EligibilityResult = { eligible: true } | { eligible: false; reason: string };

export function isOrderEligibleForCashback(
  order: EligibilityOrder,
  settings: CashbackSettings,
  now: Date = new Date(),
): EligibilityResult {
  if (!settings.enabled) return { eligible: false, reason: "Cashback desativado." };
  if (!settings.enabled_at) return { eligible: false, reason: "Cashback sem data de ativação." };
  if (String(order.financialStatus ?? "").toUpperCase() !== "PAID") {
    return { eligible: false, reason: "Pedido não está pago." };
  }
  if (order.cancelledAt) return { eligible: false, reason: "Pedido cancelado." };
  if (!order.customerGid) return { eligible: false, reason: "Pedido sem cliente Shopify." };
  if (!(order.totalPrice > 0)) return { eligible: false, reason: "Pedido sem valor." };

  const purchasedAt = order.purchasedAt ? new Date(order.purchasedAt) : null;
  if (!purchasedAt || !Number.isFinite(purchasedAt.getTime())) {
    return { eligible: false, reason: "Pedido sem data válida." };
  }
  if (purchasedAt.getTime() < new Date(settings.enabled_at).getTime()) {
    return { eligible: false, reason: "Pedido anterior à ativação do cashback." };
  }
  if (purchasedAt.getTime() > now.getTime() + 60_000) {
    return { eligible: false, reason: "Pedido com data futura." };
  }
  return { eligible: true };
}

/** Status derivado em tempo de leitura — o banco só guarda o ciclo de vida "duro"
 *  (pending/failed/cancel_pending/cancelled); pending->active->expired é função do relógio. */
export function deriveCashbackStatus(
  row: { status: CashbackCouponStatus | string; starts_at: string; ends_at: string },
  now: Date = new Date(),
): CashbackCouponStatus {
  const status = row.status as CashbackCouponStatus;
  if (status === "cancelled" || status === "cancel_pending" || status === "failed") return status;
  const ts = now.getTime();
  if (ts >= new Date(row.ends_at).getTime()) return "expired";
  if (ts < new Date(row.starts_at).getTime()) return "pending";
  return "active";
}

export const CASHBACK_STATUS_LABEL: Record<CashbackCouponStatus, string> = {
  pending: "Aguardando liberação",
  active: "Ativo",
  expired: "Expirado",
  cancel_pending: "Cancelamento pendente",
  cancelled: "Cancelado",
  failed: "Falhou",
};

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function formatCashbackValidity(endsAt: string | null | undefined): string {
  if (!endsAt) return "—";
  const date = new Date(endsAt);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
