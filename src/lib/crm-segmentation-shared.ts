import { isRevenueValidOrder, VALID_FINANCIAL_STATUSES } from "./crm-rfm-shared";

export type CRMOrderForSegmentation = {
  id: string;
  customerId: string;
  totalPrice: number;
  processedAt: string;
  financialStatus?: string | null;
  cancelledAt?: string | null;
};

export type CRMOrderItemForSegmentation = {
  orderId: string;
  productId?: string | null;
  variantId?: string | null;
  sku?: string | null;
  title?: string | null;
  variantTitle?: string | null;
  quantity?: number | null;
  price?: number | null;
};

export type CRMCustomerForSegmentation = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  province?: string | null;
  tags?: string[] | null;
  tags_custom?: string[] | null;
  rfm_segment?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PurchaseMetrics = {
  customerId: string;
  validOrderCount: number;
  totalSpent: number;
  averageTicket: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  validOrderIds: Set<string>;
  rawFinancialStatuses: Set<string>;
  validFinancialStatuses: Set<string>;
  cancelledOrderCount: number;
};

export type ProductPurchaseSummary = {
  productId: string;
  title: string | null;
  skus: Set<string>;
  quantity: number;
  orderIds: Set<string>;
  lastPurchasedAt: string | null;
};

export type CRMCustomerContext = {
  customer: CRMCustomerForSegmentation;
  metrics: PurchaseMetrics;
  purchasedProducts: Map<string, ProductPurchaseSummary>;
  /** Compatibilidade: representa somente checkout abandonado ATIVO. */
  abandonedCheckout: boolean;
  hadAbandonedCheckout: boolean;
  abandonedCheckoutRecovered: boolean;
  lastAbandonedCheckoutAt: string | null;
  shippedToday: boolean;
};

export type SegmentCondition = {
  field: string;
  operator?: string;
  value?: unknown;
};

export type SegmentRules = {
  groups?: Array<{ type?: "AND" | "OR"; conditions?: SegmentCondition[] }>;
};

const DAY_MS = 86_400_000;
const EMPTY_METRICS = (customerId: string): PurchaseMetrics => ({
  customerId,
  validOrderCount: 0,
  totalSpent: 0,
  averageTicket: 0,
  firstOrderAt: null,
  lastOrderAt: null,
  validOrderIds: new Set<string>(),
  rawFinancialStatuses: new Set<string>(),
  validFinancialStatuses: new Set<string>(),
  cancelledOrderCount: 0,
});

function normalizeStatus(status: unknown): string {
  return String(status ?? "").trim().toUpperCase();
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseRange(value: unknown): { min: number; max: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as { min?: unknown; max?: unknown };
  if (raw.min === "" || raw.max === "" || raw.min === null || raw.max === null || raw.min === undefined || raw.max === undefined) return null;
  const min = Number(raw.min);
  const max = Number(raw.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return { min, max };
}

export function buildPurchaseMetricsIndex(orders: CRMOrderForSegmentation[]): Map<string, PurchaseMetrics> {
  const index = new Map<string, PurchaseMetrics>();

  for (const order of orders) {
    if (!order.customerId) continue;
    const metrics = index.get(order.customerId) ?? EMPTY_METRICS(order.customerId);
    const status = normalizeStatus(order.financialStatus);
    if (status) metrics.rawFinancialStatuses.add(status);
    if (order.cancelledAt || status === "CANCELLED" || status === "CANCELED") metrics.cancelledOrderCount += 1;

    if (isRevenueValidOrder(order)) {
      const date = new Date(order.processedAt);
      if (!Number.isNaN(date.getTime())) {
        metrics.validOrderCount += 1;
        metrics.totalSpent += Number(order.totalPrice || 0);
        metrics.validOrderIds.add(order.id);
        if (status) metrics.validFinancialStatuses.add(status);
        if (!metrics.firstOrderAt || date < new Date(metrics.firstOrderAt)) metrics.firstOrderAt = date.toISOString();
        if (!metrics.lastOrderAt || date > new Date(metrics.lastOrderAt)) metrics.lastOrderAt = date.toISOString();
      }
    }
    index.set(order.customerId, metrics);
  }

  for (const metrics of index.values()) {
    metrics.averageTicket = metrics.validOrderCount > 0 ? metrics.totalSpent / metrics.validOrderCount : 0;
  }
  return index;
}

export function buildProductPurchaseIndex(
  orders: CRMOrderForSegmentation[],
  orderItems: CRMOrderItemForSegmentation[],
): Map<string, Map<string, ProductPurchaseSummary>> {
  const validOrderById = new Map(
    orders
      .filter((order) => order.customerId && isRevenueValidOrder(order))
      .map((order) => [order.id, order] as const),
  );
  const index = new Map<string, Map<string, ProductPurchaseSummary>>();

  for (const item of orderItems) {
    const order = validOrderById.get(item.orderId);
    const productId = String(item.productId ?? "").trim();
    if (!order || !productId) continue;

    const quantity = Number(item.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const customerProducts = index.get(order.customerId) ?? new Map<string, ProductPurchaseSummary>();
    const current = customerProducts.get(productId) ?? {
      productId,
      title: item.title?.trim() || null,
      skus: new Set<string>(),
      quantity: 0,
      orderIds: new Set<string>(),
      lastPurchasedAt: null,
    };

    current.quantity += quantity;
    current.orderIds.add(order.id);
    if (!current.title && item.title?.trim()) current.title = item.title.trim();
    if (item.sku?.trim()) current.skus.add(item.sku.trim());

    const purchasedAt = new Date(order.processedAt);
    if (!Number.isNaN(purchasedAt.getTime())) {
      if (!current.lastPurchasedAt || purchasedAt > new Date(current.lastPurchasedAt)) {
        current.lastPurchasedAt = purchasedAt.toISOString();
      }
    }

    customerProducts.set(productId, current);
    index.set(order.customerId, customerProducts);
  }

  return index;
}

function safeTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function buildCustomerContexts(input: {
  customers: CRMCustomerForSegmentation[];
  orders: CRMOrderForSegmentation[];
  orderItems?: CRMOrderItemForSegmentation[];
  /** @deprecated Prefer abandonedCheckoutAtByCustomer para distinguir ativo de recuperado. */
  abandonedCustomerIds?: Set<string>;
  abandonedCheckoutAtByCustomer?: Map<string, string>;
  shippedTodayValidOrderIds?: Set<string>;
}): CRMCustomerContext[] {
  const metricsIndex = buildPurchaseMetricsIndex(input.orders);
  const productsIndex = buildProductPurchaseIndex(input.orders, input.orderItems ?? []);
  const legacyAbandoned = input.abandonedCustomerIds ?? new Set<string>();
  const checkoutAtByCustomer = input.abandonedCheckoutAtByCustomer ?? new Map<string, string>();
  const shipped = input.shippedTodayValidOrderIds ?? new Set<string>();

  return input.customers.map((customer) => {
    const metrics = metricsIndex.get(customer.id) ?? EMPTY_METRICS(customer.id);
    const lastAbandonedCheckoutAt = checkoutAtByCustomer.get(customer.id) ?? null;
    const hadAbandonedCheckout = checkoutAtByCustomer.has(customer.id) || legacyAbandoned.has(customer.id);
    const checkoutTime = safeTime(lastAbandonedCheckoutAt);
    const lastValidOrderTime = safeTime(metrics.lastOrderAt);

    const abandonedCheckout = checkoutTime !== null
      ? lastValidOrderTime === null || lastValidOrderTime < checkoutTime
      : legacyAbandoned.has(customer.id);
    const abandonedCheckoutRecovered = hadAbandonedCheckout && !abandonedCheckout && lastValidOrderTime !== null;

    return {
      customer,
      metrics,
      purchasedProducts: productsIndex.get(customer.id) ?? new Map<string, ProductPurchaseSummary>(),
      abandonedCheckout,
      hadAbandonedCheckout,
      abandonedCheckoutRecovered,
      lastAbandonedCheckoutAt,
      shippedToday: [...metrics.validOrderIds].some((id) => shipped.has(id)),
    };
  });
}

function compareNumber(actual: number, operator: string, expected: unknown): boolean {
  if (operator === "between") {
    const range = parseRange(expected);
    return range ? actual >= range.min && actual <= range.max : false;
  }
  const target = Number(expected);
  if (!Number.isFinite(target)) return false;
  if (operator === "gt") return actual > target;
  if (operator === "gte") return actual >= target;
  if (operator === "lt") return actual < target;
  if (operator === "lte") return actual <= target;
  if (operator === "neq") return actual !== target;
  return actual === target;
}

function compareString(actual: unknown, operator: string, expected: unknown): boolean {
  const a = normalizeText(actual);
  const e = normalizeText(expected);
  if (operator === "neq") return a !== e;
  if (operator === "contains") return a.includes(e);
  if (operator === "not_contains") return !a.includes(e);
  if (operator === "starts_with") return a.startsWith(e);
  return a === e;
}

function compareTagList(tags: string[] | null | undefined, operator: string, expected: unknown): boolean {
  const normalized = (tags ?? []).map(normalizeText);
  const target = normalizeText(expected);
  const has = normalized.some((tag) => operator.includes("contains") ? tag.includes(target) : tag === target);
  if (operator === "neq" || operator === "not_contains") return !has;
  return has;
}

function businessDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function businessDateOrdinal(date: Date): number {
  const [year, month, day] = businessDateKey(date).split("-").map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / DAY_MS);
}

function ageInDays(actual: Date, now: Date): number {
  return Math.max(0, businessDateOrdinal(now) - businessDateOrdinal(actual));
}

function compareDate(actualIso: string | null, operator: string, expected: unknown, now: Date): boolean {
  if (!actualIso) return false;
  const actual = new Date(actualIso);
  if (Number.isNaN(actual.getTime())) return false;

  if (operator === "last_days" || operator === "older_than_days") {
    const days = Number(expected);
    if (!Number.isFinite(days) || days < 0) return false;
    const ageDays = ageInDays(actual, now);
    return operator === "last_days" ? ageDays <= days : ageDays > days;
  }

  if (operator === "between_days") {
    const range = parseRange(expected);
    if (!range || range.min < 0) return false;
    const ageDays = ageInDays(actual, now);
    return ageDays >= range.min && ageDays <= range.max;
  }

  const expectedText = String(expected ?? "").trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(expectedText);
  if (isDateOnly) {
    const actualKey = businessDateKey(actual);
    if (operator === "on" || operator === "eq") return actualKey === expectedText;
    if (operator === "before") return actualKey < expectedText;
    if (operator === "after") return actualKey > expectedText;
    return false;
  }

  const target = new Date(expectedText);
  if (Number.isNaN(target.getTime())) return false;
  if (operator === "on") return businessDateKey(actual) === businessDateKey(target);
  if (operator === "before") return actual < target;
  if (operator === "after") return actual > target;
  return actual.getTime() === target.getTime();
}

function booleanFromValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "sim" || normalized === "true" || normalized === "1" || normalized === "yes";
}

function compareBoolean(actual: boolean, operator: string, expected: unknown): boolean {
  const target = booleanFromValue(expected);
  return operator === "neq" ? actual !== target : actual === target;
}

function hasPurchaseToday(context: CRMCustomerContext, now: Date): boolean {
  if (!context.metrics.lastOrderAt) return false;
  return businessDateKey(new Date(context.metrics.lastOrderAt)) === businessDateKey(now);
}

function purchasedInLast24h(context: CRMCustomerContext, now: Date): boolean {
  if (!context.metrics.lastOrderAt) return false;
  const time = new Date(context.metrics.lastOrderAt).getTime();
  return Number.isFinite(time) && time >= now.getTime() - DAY_MS && time <= now.getTime();
}

function paymentStatusMatches(context: CRMCustomerContext, targetRaw: unknown): boolean {
  const target = normalizeStatus(targetRaw);
  if (!target) return false;
  if (target === "CANCELLED" || target === "CANCELED") return context.metrics.cancelledOrderCount > 0;
  const validStatuses = VALID_FINANCIAL_STATUSES as readonly string[];
  return validStatuses.includes(target)
    ? context.metrics.validFinancialStatuses.has(target)
    : context.metrics.rawFinancialStatuses.has(target);
}

function isBooleanToken(value: unknown): boolean {
  return ["sim", "nao", "true", "false", "1", "0", "yes", "no"].includes(String(value ?? "").trim().toLowerCase());
}

function rfmMatches(actual: string | null | undefined, operator: string, value: unknown): boolean {
  if (operator === "in" || operator === "not_in") {
    const options = Array.isArray(value) ? value.map(normalizeText) : [];
    const found = options.includes(normalizeText(actual));
    return operator === "not_in" ? !found : found;
  }
  return compareString(actual, operator, value);
}

export function matchesSegmentCondition(context: CRMCustomerContext, condition: SegmentCondition, now = new Date()): boolean {
  const field = condition.field;
  const operator = condition.operator || "eq";
  const value = condition.value;
  const { customer, metrics } = context;

  if (field === "cidade") return compareString(customer.city, operator, value);
  if (field === "estado") return compareString(customer.province, operator, value);
  if (field === "customer_tag") return compareTagList(customer.tags, operator, value);
  if (field === "tags_custom") return compareTagList(customer.tags_custom, operator, value);
  if (field === "rfm_segment") return rfmMatches(customer.rfm_segment, operator, value);

  if (field === "produto") {
    const productId = String(value ?? "").trim();
    if (!productId) return false;
    const bought = context.purchasedProducts.has(productId);
    if (operator === "bought") return bought;
    if (operator === "not_bought") return !bought;
    return false;
  }

  if (field === "total_pedidos") return compareNumber(metrics.validOrderCount, operator, value);
  if (field === "total_gasto") return compareNumber(metrics.totalSpent, operator, value);
  if (field === "ticket_medio") return compareNumber(metrics.averageTicket, operator, value);
  if (field === "ultima_compra") return compareDate(metrics.lastOrderAt, operator, value, now);
  if (field === "primeira_compra") return compareDate(metrics.firstOrderAt, operator, value, now);

  if (field === "recorrencia") {
    const legacyNumeric = Number.isFinite(Number(value)) && !isBooleanToken(value);
    if (["gt", "gte", "lt", "lte"].includes(operator) || (["eq", "neq"].includes(operator) && legacyNumeric)) {
      return compareNumber(metrics.validOrderCount, operator, value);
    }
    return compareBoolean(metrics.validOrderCount >= 2, operator, value);
  }

  if (field === "status_pagamento") {
    const matches = paymentStatusMatches(context, value);
    return operator === "neq" ? !matches : matches;
  }

  if (field === "perfil") {
    const profile = String(value ?? "").trim().toLowerCase();
    let matches = false;
    if (profile === "carrinho" || profile === "checkout_abandonado_ativo") matches = context.abandonedCheckout;
    else if (profile === "primeira_compra") matches = metrics.validOrderCount === 1;
    else if (["lead", "acesso_sem_compra", "sem_compra"].includes(profile)) matches = metrics.validOrderCount === 0;
    return operator === "neq" ? !matches : matches;
  }

  if (field === "data_pedido_hoje") return compareBoolean(hasPurchaseToday(context, now), operator, value);
  if (field === "data_pedido_24h") return compareBoolean(purchasedInLast24h(context, now), operator, value);
  if (field === "data_envio_hoje") return compareBoolean(context.shippedToday, operator, value);
  if (field === "checkout_abandonado") return compareBoolean(context.abandonedCheckout, operator, value);
  if (field === "acesso_sem_compra") return compareBoolean(metrics.validOrderCount === 0, operator, value);

  return false;
}

/** AND dentro de cada grupo e OR entre grupos, conforme o editor visual do CRM. */
export function matchesSegmentRules(context: CRMCustomerContext, rules: SegmentRules | null | undefined, now = new Date()): boolean {
  const groups = (rules?.groups ?? []).filter((group) => (group.conditions ?? []).length > 0);
  if (groups.length === 0) return true;
  return groups.some((group) => (group.conditions ?? []).every((condition) => matchesSegmentCondition(context, condition, now)));
}

export function customerMatchesSearch(context: CRMCustomerContext, search: string | undefined): boolean {
  const needle = normalizeText(search);
  if (!needle) return true;
  const c = context.customer;
  return [c.first_name, c.last_name, c.email, c.phone, c.city, c.province]
    .filter(Boolean)
    .some((value) => normalizeText(value).includes(needle));
}