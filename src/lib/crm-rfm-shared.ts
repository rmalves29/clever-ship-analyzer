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
  | "Sem compra"
  | "Campeões"
  | "Leais"
  | "Potencialmente Leais"
  | "Novos"
  | "Precisa de atenção"
  | "Quase hibernando"
  | "Em risco"
  | "Hibernando"
  | "Não pode perder"
  | "Perdidos";

/**
 * Mantido para indicar quando o histórico já permite métricas de longo prazo, como LTV.
 * A segmentação completa NÃO fica bloqueada por esse limite.
 */
export const CLASSIC_MODE_MIN_HISTORY_DAYS = 90;

export const RFM_SEGMENTS_CONFIG: Record<RFMSegment, { color: string; description: string; mode: "base" | "classico" }> = {
  "Sem compra": {
    color: "#64748b",
    description: "Lead sem pedido pago. Permanece identificado fora da matriz dos compradores.",
    mode: "base",
  },
  Campeões: {
    color: "#0ea5e9",
    description: "Compraram recentemente, têm alta frequência e estão entre os clientes de maior valor.",
    mode: "base",
  },
  Leais: {
    color: "#10b981",
    description: "Compram com frequência e mantêm relacionamento recente com a loja.",
    mode: "base",
  },
  "Potencialmente Leais": {
    color: "#84cc16",
    description: "Já fizeram a segunda compra recentemente e têm potencial para se tornar leais.",
    mode: "base",
  },
  Novos: {
    color: "#8b5cf6",
    description: "Fizeram a primeira compra dentro da janela recente de até 8 dias.",
    mode: "base",
  },
  "Precisa de atenção": {
    color: "#f59e0b",
    description: "Estão entre 9 e 15 dias sem comprar e ultrapassando o ciclo normal de recompra.",
    mode: "base",
  },
  "Quase hibernando": {
    color: "#06b6d4",
    description: "Baixa frequência e entre 16 e 30 dias sem comprar.",
    mode: "base",
  },
  "Em risco": {
    color: "#f97316",
    description: "Tinham frequência relevante, mas estão entre 16 e 30 dias sem comprar.",
    mode: "base",
  },
  Hibernando: {
    color: "#d946ef",
    description: "Estão há mais de 30 dias sem comprar, mas ainda possuem frequência ou valor relevante.",
    mode: "base",
  },
  "Não pode perder": {
    color: "#f43f5e",
    description: "Eram clientes frequentes e de alto valor, mas estão há mais de 15 dias sem comprar.",
    mode: "base",
  },
  Perdidos: {
    color: "#475569",
    description: "Baixa frequência, baixo valor e mais de 30 dias sem comprar.",
    mode: "base",
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

/** Faixas de recência calibradas pelo ciclo observado: mediana 3,8 dias e P75 8,7 dias. */
export function scoreRecency(recency: number | null): number {
  if (recency === null) return 0;
  if (recency <= 3) return 5;
  if (recency <= 8) return 4;
  if (recency <= 15) return 3;
  if (recency <= 30) return 2;
  return 1;
}

/** Frequência absoluta: evita que muitos clientes de uma compra recebam score alto por empate. */
export function scoreFrequency(frequency: number): number {
  if (frequency <= 0) return 0;
  if (frequency === 1) return 1;
  if (frequency === 2) return 2;
  if (frequency === 3) return 3;
  if (frequency === 4) return 4;
  return 5;
}

export type ClassifyInput = {
  metrics: CustomerMetrics;
  scores: { r: number; f: number; m: number };
};

/**
 * Matriz completa e mutuamente exclusiva. A ordem é parte da regra:
 * clientes valiosos inativos são "Não pode perder" antes de "Em risco";
 * clientes frequentes e recentes são "Campeões" antes de "Leais".
 */
export function classifyCustomer({ metrics, scores }: ClassifyInput): RFMSegment {
  const { frequency } = metrics;
  const { r, f, m } = scores;

  if (frequency === 0 || metrics.recency === null) return "Sem compra";

  if (r >= 4 && f >= 4 && m >= 4) return "Campeões";
  if (r <= 2 && f >= 4 && m >= 4) return "Não pode perder";
  if (r <= 2 && f >= 3) return "Em risco";
  if (r >= 3 && f >= 3) return "Leais";
  if (r >= 4 && f === 2) return "Potencialmente Leais";
  if (r >= 4 && f === 1) return "Novos";
  if (r === 3) return "Precisa de atenção";
  if (r === 2 && f <= 2) return "Quase hibernando";
  if (r === 1 && (f >= 2 || m >= 3)) return "Hibernando";
  return "Perdidos";
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
  const scoreM = makeScorer(buyers.map((m) => m.monetary), true);

  const customers = metrics.map((m) => {
    const scores =
      m.frequency > 0
        ? { r: scoreRecency(m.recency), f: scoreFrequency(m.frequency), m: scoreM(m.monetary) }
        : { r: 0, f: 0, m: 0 };
    return { ...m, ...scores, segment: classifyCustomer({ metrics: m, scores }) };
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
