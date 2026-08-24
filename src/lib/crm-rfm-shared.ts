/**
 * Motor RFM — lógica pura (sem banco, sem servidor), compartilhada entre UI, server functions
 * e testes automatizados.
 *
 * REGRA DE RECEITA VÁLIDA (única fonte da verdade para R, F e M):
 * Só entram no cálculo os pedidos com `financial_status` considerado PAGO — hoje, na prática,
 * `PAID` e `PARTIALLY_PAID`. Ficam de fora: `REFUNDED`, `PARTIALLY_REFUNDED`, `VOIDED`,
 * `EXPIRED`, `CANCELLED`/`CANCELED`, `PENDING`, `AUTHORIZED`, `UNPAID` e qualquer pedido com
 * `cancelled_at` preenchido. Pedidos inválidos continuam no banco (histórico bruto preservado),
 * apenas não contam para Recência, Frequência e Monetário.
 */

export const VALID_FINANCIAL_STATUSES = ["PAID", "PARTIALLY_PAID"] as const;

export const INVALID_FINANCIAL_STATUSES = [
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "VOIDED",
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "PENDING",
  "AUTHORIZED",
  "UNPAID",
] as const;

export type RFMSegment =
  // Modo BASE NOVA (histórico útil < 90 dias)
  | "Sem compra"
  | "Nova compra"
  | "2ª compra pendente"
  | "Recorrente"
  | "VIP em formação"
  | "VIP/Leal"
  // Modo CLÁSSICO (habilitado só com >= 90 dias de histórico útil)
  | "Precisa de Atenção"
  | "Em Risco"
  | "Hibernando"
  | "Perdidos";

/** Dias mínimos de histórico útil para liberar os segmentos clássicos de risco/hibernação. */
export const CLASSIC_MODE_MIN_HISTORY_DAYS = 90;

export const RFM_SEGMENTS_CONFIG: Record<RFMSegment, { color: string; description: string; mode: "base" | "classico" }> = {
  "Sem compra": {
    color: "#64748b",
    description: "Contato sem nenhum pedido pago. Lead — nunca comprou.",
    mode: "base",
  },
  "Nova compra": {
    color: "#a855f7",
    description: "Fez a 1ª compra paga nos últimos 30 dias. Momento de onboarding.",
    mode: "base",
  },
  "2ª compra pendente": {
    color: "#f59e0b",
    description: "Comprou uma única vez há mais de 30 dias e ainda não voltou.",
    mode: "base",
  },
  Recorrente: {
    color: "#10b981",
    description: "Tem 2 compras pagas. Já repetiu, ainda não é alto valor.",
    mode: "base",
  },
  "VIP em formação": {
    color: "#84cc16",
    description: "3+ compras pagas ou valor acumulado no topo da base.",
    mode: "base",
  },
  "VIP/Leal": {
    color: "#3b82f6",
    description: "4+ compras pagas e valor acumulado no topo da base.",
    mode: "base",
  },
  "Precisa de Atenção": {
    color: "#f97316",
    description: "Boa frequência histórica, mas a recência começou a cair.",
    mode: "classico",
  },
  "Em Risco": {
    color: "#ef4444",
    description: "Comprava bem e com frequência, mas não volta há muito tempo.",
    mode: "classico",
  },
  Hibernando: {
    color: "#ec4899",
    description: "Última compra há muito tempo e poucos pedidos.",
    mode: "classico",
  },
  Perdidos: {
    color: "#475569",
    description: "Scores baixos em recência, frequência e valor.",
    mode: "classico",
  },
};

export type ValidOrder = {
  customerId: string;
  totalPrice: number;
  /** ISO da data considerada do pedido (processed_at, com fallback para created_at). */
  processedAt: string;
  financialStatus?: string | null;
  cancelledAt?: string | null;
};

export type CustomerMetrics = {
  customerId: string;
  /** Dias desde o último pedido VÁLIDO. `null` quando o cliente não tem pedido válido. */
  recency: number | null;
  /** Total de pedidos VÁLIDOS. */
  frequency: number;
  /** Receita acumulada em pedidos VÁLIDOS. */
  monetary: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  /** Dias desde a primeira compra válida (métrica real, usada no lugar de LTV estimado). */
  tenureDays: number | null;
};

export type ScoredCustomer = CustomerMetrics & {
  r: number;
  f: number;
  m: number;
  segment: RFMSegment;
};

/** Um pedido só conta para RFM se estiver pago e não cancelado. */
export function isRevenueValidOrder(order: {
  financialStatus?: string | null;
  cancelledAt?: string | null;
  processedAt?: string | null;
}): boolean {
  if (order.cancelledAt) return false;
  const status = (order.financialStatus ?? "").trim().toUpperCase();
  if (!status) return false;
  return (VALID_FINANCIAL_STATUSES as readonly string[]).includes(status);
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/** Agrega os pedidos válidos por cliente. Clientes sem pedido válido entram zerados. */
export function buildCustomerMetrics(
  customerIds: string[],
  orders: ValidOrder[],
  now: Date = new Date(),
): CustomerMetrics[] {
  const byCustomer = new Map<string, { freq: number; money: number; last: Date | null; first: Date | null }>();
  for (const id of customerIds) byCustomer.set(id, { freq: 0, money: 0, last: null, first: null });

  for (const order of orders) {
    if (!order.customerId) continue;
    if (!isRevenueValidOrder(order)) continue;
    const date = new Date(order.processedAt);
    if (Number.isNaN(date.getTime())) continue;
    const acc = byCustomer.get(order.customerId) ?? { freq: 0, money: 0, last: null, first: null };
    acc.freq += 1;
    acc.money += Number(order.totalPrice ?? 0);
    if (!acc.last || date > acc.last) acc.last = date;
    if (!acc.first || date < acc.first) acc.first = date;
    byCustomer.set(order.customerId, acc);
  }

  return Array.from(byCustomer.entries()).map(([customerId, acc]) => ({
    customerId,
    recency: acc.last ? daysBetween(acc.last, now) : null,
    frequency: acc.freq,
    monetary: acc.money,
    lastOrderAt: acc.last ? acc.last.toISOString() : null,
    firstOrderAt: acc.first ? acc.first.toISOString() : null,
    tenureDays: acc.first ? daysBetween(acc.first, now) : null,
  }));
}

/**
 * Score 1..5 por `cume_dist` (fração de valores <= v), com tratamento correto de EMPATES:
 * valores iguais recebem sempre o mesmo score. Substitui o `findIndex` bugado da versão antiga.
 * Quando a distribuição tem um único valor distinto, todos recebem 3 (score neutro) — não faz
 * sentido ranquear uma base sem variância.
 */
export function makeScorer(values: number[], higherIsBetter = true): (value: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const distinct = new Set(sorted).size;
  if (sorted.length === 0 || distinct <= 1) return () => 3;

  return (value: number) => {
    // count(x <= value) via busca binária (limite superior)
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! <= value) lo = mid + 1;
      else hi = mid;
    }
    const cume = lo / sorted.length;
    const raw = Math.min(5, Math.max(1, Math.ceil(cume * 5)));
    return higherIsBetter ? raw : 6 - raw;
  };
}

/** Dias de histórico útil = distância entre o pedido válido mais antigo e hoje. */
export function computeHistoryDays(orders: ValidOrder[], now: Date = new Date()): number {
  const dates = orders
    .filter(isRevenueValidOrder)
    .map((o) => new Date(o.processedAt))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (dates.length === 0) return 0;
  const oldest = dates.reduce((a, b) => (a < b ? a : b));
  return daysBetween(oldest, now);
}

export type ClassifyInput = {
  metrics: CustomerMetrics;
  scores: { r: number; f: number; m: number };
  /** true quando há >= 90 dias de histórico útil. */
  classicMode: boolean;
};

/**
 * Classificação.
 *
 * Base nova (< 90 dias): proibido rotular alguém como Hibernando/Perdido — não existe base
 * suficiente para afirmar churn. Usa regras ABSOLUTAS de recência/frequência.
 * Modo clássico (>= 90 dias): libera os segmentos de risco/hibernação por score.
 */
export function classifyCustomer({ metrics, scores, classicMode }: ClassifyInput): RFMSegment {
  const { frequency, recency, monetary } = metrics;

  if (frequency === 0 || recency === null) return "Sem compra";

  const highValue = scores.m >= 5;

  if (!classicMode) {
    if (frequency === 1) return recency <= 30 ? "Nova compra" : "2ª compra pendente";
    if (frequency >= 4 && (scores.m >= 4 || highValue)) return "VIP/Leal";
    if (frequency >= 3 || highValue) return "VIP em formação";
    return "Recorrente";
  }

  // Modo clássico — só com histórico suficiente.
  if (frequency === 1 && recency <= 30) return "Nova compra";
  if (recency > 180 && (frequency >= 3 || monetary > 0 ? scores.m >= 4 : false)) return "Em Risco";
  if (recency > 180 && scores.f <= 2 && scores.m <= 2) return "Perdidos";
  if (recency > 120) return "Hibernando";
  if (recency > 60 && frequency >= 2) return "Precisa de Atenção";
  if (frequency === 1) return "2ª compra pendente";
  if (frequency >= 4 && scores.m >= 4) return "VIP/Leal";
  if (frequency >= 3 || highValue) return "VIP em formação";
  return "Recorrente";
}

/** Pipeline completo: pedidos válidos -> métricas -> scores com empate correto -> segmento. */
export function computeRFM(
  customerIds: string[],
  orders: ValidOrder[],
  now: Date = new Date(),
): { customers: ScoredCustomer[]; historyDays: number; classicMode: boolean } {
  const metrics = buildCustomerMetrics(customerIds, orders, now);
  const historyDays = computeHistoryDays(orders, now);
  const classicMode = historyDays >= CLASSIC_MODE_MIN_HISTORY_DAYS;

  const buyers = metrics.filter((m) => m.frequency > 0);
  const scoreR = makeScorer(buyers.map((m) => m.recency ?? 0), false);
  const scoreF = makeScorer(buyers.map((m) => m.frequency), true);
  const scoreM = makeScorer(buyers.map((m) => m.monetary), true);

  const customers = metrics.map((m) => {
    const scores =
      m.frequency > 0
        ? { r: scoreR(m.recency ?? 0), f: scoreF(m.frequency), m: scoreM(m.monetary) }
        : { r: 0, f: 0, m: 0 };
    return { ...m, ...scores, segment: classifyCustomer({ metrics: m, scores, classicMode }) };
  });

  return { customers, historyDays, classicMode };
}

/** Faixas de frequência usadas nos painéis (1x / 2x / 3+ / VIP 4+). */
export function frequencyBucket(frequency: number): "0x" | "1x" | "2x" | "3x" | "4x+" {
  if (frequency <= 0) return "0x";
  if (frequency === 1) return "1x";
  if (frequency === 2) return "2x";
  if (frequency === 3) return "3x";
  return "4x+";
}
