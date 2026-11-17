/** Regras do programa de afiliadas: classifica cada pedido e calcula a comissão. Função pura. */

export type AffiliateOrderInput = {
  orderId: string;
  createdAt: string;
  financialStatus: string | null;
  cancelledAt: string | null;
  /** Valor dos produtos já com desconto, sem frete (subtotal da Shopify). */
  subtotal: number;
  customerEmail: string | null;
  customerPhone: string | null;
};

export type AffiliateIdentity = {
  commissionPct: number;
  whatsapp: string;
  email: string | null;
};

export type AffiliateProgramRules = {
  /** Dias depois do pedido até a comissão ficar "aprovada" (cobre troca/devolução). */
  holdDays: number;
  /** Só pedidos criados dentro da janela contam. Vazio = sempre. */
  windowStart: string | null;
  windowEnd: string | null;
};

export type CommissionStatus =
  | "pending" // paga, em carência
  | "approved" // paga, carência cumprida, ainda não paga à afiliada
  | "paid" // já paga à afiliada
  | "void" // cancelado, estornado ou expirado
  | "unpaid" // pedido ainda não pago
  | "outside_window" // fora da janela do programa
  | "self_purchase"; // compra da própria afiliada com o cupom dela

export type ClassifiedOrder = {
  status: CommissionStatus;
  base: number;
  commission: number;
  /** Pedido com reembolso parcial, ou estornado depois de pago: conferir à mão. */
  needsReview: boolean;
};

const DAY_MS = 86_400_000;

const VOID_STATUSES = new Set(["VOIDED", "REFUNDED", "EXPIRED"]);
const PAID_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED"]);

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function phoneKey(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 11 ? digits.slice(-11) : digits;
}

function samePerson(order: AffiliateOrderInput, affiliate: AffiliateIdentity): boolean {
  const orderPhone = phoneKey(order.customerPhone);
  const affiliatePhone = phoneKey(affiliate.whatsapp);
  if (orderPhone.length >= 10 && orderPhone === affiliatePhone) return true;
  const orderEmail = (order.customerEmail ?? "").trim().toLowerCase();
  const affiliateEmail = (affiliate.email ?? "").trim().toLowerCase();
  return Boolean(orderEmail && affiliateEmail && orderEmail === affiliateEmail);
}

export function classifyAffiliateOrder(
  order: AffiliateOrderInput,
  affiliate: AffiliateIdentity,
  rules: AffiliateProgramRules,
  alreadyPaid: boolean,
  now: Date = new Date(),
): ClassifiedOrder {
  const base = Math.max(Number(order.subtotal) || 0, 0);
  const commission = round2((base * affiliate.commissionPct) / 100);
  const status = String(order.financialStatus ?? "").toUpperCase();
  const voided = Boolean(order.cancelledAt) || VOID_STATUSES.has(status);

  // Pedido já pago à afiliada continua "pago"; se depois foi estornado, sinaliza para conferência.
  if (alreadyPaid) return { status: "paid", base, commission, needsReview: voided || status === "PARTIALLY_REFUNDED" };

  if (voided) return { status: "void", base, commission: 0, needsReview: false };
  if (!PAID_STATUSES.has(status)) return { status: "unpaid", base, commission: 0, needsReview: false };

  const created = new Date(order.createdAt).getTime();
  const start = rules.windowStart ? new Date(rules.windowStart).getTime() : null;
  const end = rules.windowEnd ? new Date(rules.windowEnd).getTime() : null;
  if ((start !== null && created < start) || (end !== null && created > end)) {
    return { status: "outside_window", base, commission: 0, needsReview: false };
  }

  if (samePerson(order, affiliate)) return { status: "self_purchase", base, commission: 0, needsReview: false };

  const needsReview = status === "PARTIALLY_REFUNDED";
  const released = created + Math.max(rules.holdDays, 0) * DAY_MS <= now.getTime();
  return { status: released ? "approved" : "pending", base, commission, needsReview };
}

export type CommissionTotals = Record<CommissionStatus, { orders: number; commission: number }>;

export function emptyTotals(): CommissionTotals {
  const zero = () => ({ orders: 0, commission: 0 });
  return {
    pending: zero(),
    approved: zero(),
    paid: zero(),
    void: zero(),
    unpaid: zero(),
    outside_window: zero(),
    self_purchase: zero(),
  };
}

export function addToTotals(totals: CommissionTotals, classified: ClassifiedOrder): void {
  const slot = totals[classified.status];
  slot.orders += 1;
  slot.commission = round2(slot.commission + classified.commission);
}

/** Ordem em que o admin vê os status. */
export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  approved: "Aprovada (a pagar)",
  pending: "Em carência",
  paid: "Paga",
  unpaid: "Aguardando pagamento",
  void: "Cancelada/estornada",
  outside_window: "Fora do período",
  self_purchase: "Compra da própria afiliada",
};

// ---------------------------------------------------------------------------------------------
// Cupom exclusivo

function normalizeLetters(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

/** Candidatos de código a partir do nome: ANA, ANA10, ANA11 … ANA99, ANA100 … (mínimo 3 letras). */
export function* affiliateCodeCandidates(name: string): Generator<string> {
  const first = name.trim().split(/\s+/)[0] ?? "";
  let base = normalizeLetters(first).slice(0, 8);
  if (base.length < 3) base = (base + "MM").slice(0, 3).padEnd(3, "M");
  yield base;
  for (let n = 10; n < 1000; n++) yield `${base}${n}`;
}

export function pickAffiliateCode(name: string, taken: Set<string>): string {
  const lowered = new Set([...taken].map((code) => code.toUpperCase()));
  for (const candidate of affiliateCodeCandidates(name)) {
    if (!lowered.has(candidate)) return candidate;
  }
  throw new Error("Não foi possível gerar um código livre para essa afiliada.");
}

export function isValidAffiliateCode(code: string): boolean {
  return /^[A-Z0-9]{3,20}$/.test(code);
}

/** Link que aplica o cupom sozinho na loja e leva à página escolhida. */
export function affiliateLink(storeUrl: string, code: string, redirectPath = "/"): string {
  const base = storeUrl.replace(/\/+$/, "");
  return `${base}/discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(redirectPath)}`;
}

/** Só aceita caminho interno da loja ("/collections/x"); qualquer outra coisa vira "/". */
export function safeRedirectPath(value: string | null | undefined): string {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) return "/";
  return path.slice(0, 300);
}

/** Link curto e amigável da afiliada, no domínio do CRM: /a/ana. Passa por um redirecionamento que conta o clique. */
export function affiliateShortLink(origin: string, code: string, toPath?: string): string {
  const base = `${origin.replace(/\/+$/, "")}/a/${encodeURIComponent(code.toLowerCase())}`;
  const to = safeRedirectPath(toPath);
  return to === "/" ? base : `${base}?to=${encodeURIComponent(to)}`;
}
