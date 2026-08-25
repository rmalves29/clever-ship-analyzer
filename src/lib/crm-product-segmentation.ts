import {
  matchesSegmentCondition,
  type CRMCustomerContext,
  type SegmentCondition,
  type SegmentRules,
} from "./crm-segmentation-shared";

export type ValidPurchaseHistoryEntry = {
  processedAt: string;
  totalPrice: number;
};

export type CRMAdvancedCustomerContext = CRMCustomerContext & {
  productSpentById: Map<string, number>;
  purchasedProductTypes: Set<string>;
  purchasedCollectionIds: Set<string>;
  productTypeLastPurchasedAt: Map<string, string>;
  collectionLastPurchasedAt: Map<string, string>;
  validPurchaseHistory: ValidPurchaseHistoryEntry[];
  productTypeQuantityByValue: Map<string, number>;
  productTypeSpentByValue: Map<string, number>;
  collectionQuantityById: Map<string, number>;
  collectionSpentById: Map<string, number>;
  whatsappCampaignSentIds: Set<string>;
  whatsappCampaignDeliveredIds: Set<string>;
  whatsappCampaignReadIds: Set<string>;
  whatsappCampaignFailedIds: Set<string>;
  whatsappAutomationEnteredIds: Set<string>;
  whatsappAutomationCompletedIds: Set<string>;
};

type RawProductMetricValue = {
  productId?: unknown;
  amount?: unknown;
  min?: unknown;
  max?: unknown;
  days?: unknown;
  sku?: unknown;
};

type ParsedProductMetricValue = {
  productId: string;
  amount?: number;
  min?: number;
  max?: number;
  days?: number;
  sku?: string;
};

type RawTaxonomyMetricValue = {
  taxonomyValue?: unknown;
  amount?: unknown;
  min?: unknown;
  max?: unknown;
  days?: unknown;
};

type ParsedTaxonomyMetricValue = {
  taxonomyValue: string;
  amount?: number;
  min?: number;
  max?: number;
  days?: number;
};

type RawPeriodMetricValue = {
  days?: unknown;
  amount?: unknown;
  min?: unknown;
  max?: unknown;
};

type ParsedPeriodMetricValue = {
  days: number;
  amount?: number;
  min?: number;
  max?: number;
};

const DAY_MS = 86_400_000;

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function numeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProductMetricValue(value: unknown): ParsedProductMetricValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as RawProductMetricValue;
  const productId = String(raw.productId ?? "").trim();
  if (!productId) return null;
  const parsed: ParsedProductMetricValue = { productId };

  if (raw.amount !== undefined && raw.amount !== "") {
    const amount = numeric(raw.amount);
    if (amount === null) return null;
    parsed.amount = amount;
  }
  if (raw.min !== undefined && raw.min !== "") {
    const min = numeric(raw.min);
    if (min === null) return null;
    parsed.min = min;
  }
  if (raw.max !== undefined && raw.max !== "") {
    const max = numeric(raw.max);
    if (max === null) return null;
    parsed.max = max;
  }
  if (raw.days !== undefined && raw.days !== "") {
    const days = numeric(raw.days);
    if (days === null) return null;
    parsed.days = days;
  }
  if (raw.sku !== undefined) parsed.sku = String(raw.sku ?? "").trim();
  return parsed;
}

function parseTaxonomyMetricValue(value: unknown): ParsedTaxonomyMetricValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as RawTaxonomyMetricValue;
  const taxonomyValue = String(raw.taxonomyValue ?? "").trim();
  if (!taxonomyValue) return null;
  const parsed: ParsedTaxonomyMetricValue = { taxonomyValue };

  if (raw.amount !== undefined && raw.amount !== "") {
    const amount = numeric(raw.amount);
    if (amount === null) return null;
    parsed.amount = amount;
  }
  if (raw.min !== undefined && raw.min !== "") {
    const min = numeric(raw.min);
    if (min === null) return null;
    parsed.min = min;
  }
  if (raw.max !== undefined && raw.max !== "") {
    const max = numeric(raw.max);
    if (max === null) return null;
    parsed.max = max;
  }
  if (raw.days !== undefined && raw.days !== "") {
    const days = numeric(raw.days);
    if (days === null) return null;
    parsed.days = days;
  }
  return parsed;
}

function parsePeriodMetricValue(value: unknown): ParsedPeriodMetricValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as RawPeriodMetricValue;
  const days = numeric(raw.days);
  if (days === null || days < 0) return null;
  const parsed: ParsedPeriodMetricValue = { days };

  if (raw.amount !== undefined && raw.amount !== "") {
    const amount = numeric(raw.amount);
    if (amount === null) return null;
    parsed.amount = amount;
  }
  if (raw.min !== undefined && raw.min !== "") {
    const min = numeric(raw.min);
    if (min === null) return null;
    parsed.min = min;
  }
  if (raw.max !== undefined && raw.max !== "") {
    const max = numeric(raw.max);
    if (max === null) return null;
    parsed.max = max;
  }
  return parsed;
}

function compareNumber(actual: number, operator: string, value: { amount?: number; min?: number; max?: number } | null): boolean {
  if (!value) return false;
  if (operator === "between") {
    return value.min !== undefined && value.max !== undefined && value.min <= value.max
      ? actual >= value.min && actual <= value.max
      : false;
  }
  if (value.amount === undefined) return false;
  if (operator === "gt") return actual > value.amount;
  if (operator === "gte") return actual >= value.amount;
  if (operator === "lt") return actual < value.amount;
  if (operator === "lte") return actual <= value.amount;
  if (operator === "neq") return actual !== value.amount;
  return actual === value.amount;
}

function compareRelativeDate(
  actualIso: string | null,
  operator: string,
  value: { days?: number; min?: number; max?: number } | null,
  now: Date,
): boolean {
  if (!actualIso || !value) return false;
  const actual = new Date(actualIso);
  if (Number.isNaN(actual.getTime())) return false;
  const ageDays = Math.max(0, Math.floor((now.getTime() - actual.getTime()) / DAY_MS));

  if (operator === "last_days") return value.days !== undefined && value.days >= 0 && ageDays <= value.days;
  if (operator === "older_than_days") return value.days !== undefined && value.days >= 0 && ageDays > value.days;
  if (operator === "between_days") {
    return value.min !== undefined && value.max !== undefined && value.min >= 0 && value.min <= value.max
      ? ageDays >= value.min && ageDays <= value.max
      : false;
  }
  return false;
}

function taxonomyMatches(values: Set<string>, operator: string, expected: unknown, normalizeValues: boolean): boolean {
  const target = normalizeValues ? normalize(expected) : String(expected ?? "").trim();
  if (!target) return false;
  const bought = normalizeValues
    ? [...values].some((value) => normalize(value) === target)
    : values.has(target);
  if (operator === "bought") return bought;
  if (operator === "not_bought") return !bought;
  return false;
}

function taxonomyDate(values: Map<string, string>, expected: string, normalizeValues: boolean): string | null {
  if (!normalizeValues) return values.get(expected) ?? null;
  const target = normalize(expected);
  for (const [key, date] of values) {
    if (normalize(key) === target) return date;
  }
  return null;
}

function taxonomyMetric(values: Map<string, number>, expected: string, normalizeValues: boolean): number {
  if (!normalizeValues) return Number(values.get(expected) ?? 0);
  const target = normalize(expected);
  for (const [key, amount] of values) {
    if (normalize(key) === target) return Number(amount ?? 0);
  }
  return 0;
}

function periodMetric(
  history: ValidPurchaseHistoryEntry[],
  days: number,
  metric: "orders" | "spend",
  now: Date,
): number {
  const cutoff = now.getTime() - days * DAY_MS;
  let count = 0;
  let spend = 0;
  for (const purchase of history) {
    const at = new Date(purchase.processedAt).getTime();
    if (!Number.isFinite(at) || at < cutoff || at > now.getTime()) continue;
    count += 1;
    spend += Number(purchase.totalPrice ?? 0);
  }
  return metric === "orders" ? count : spend;
}

function campaignBehaviorMatches(context: CRMAdvancedCustomerContext, operator: string, campaignId: string): boolean {
  const sent = context.whatsappCampaignSentIds.has(campaignId);
  const delivered = context.whatsappCampaignDeliveredIds.has(campaignId);
  const read = context.whatsappCampaignReadIds.has(campaignId);
  const failed = context.whatsappCampaignFailedIds.has(campaignId);
  if (operator === "sent") return sent;
  if (operator === "not_sent") return !sent;
  if (operator === "delivered") return delivered;
  if (operator === "not_delivered") return !delivered;
  if (operator === "read") return read;
  if (operator === "not_read") return !read;
  if (operator === "failed") return failed;
  if (operator === "not_failed") return !failed;
  return false;
}

function automationBehaviorMatches(context: CRMAdvancedCustomerContext, operator: string, automationId: string): boolean {
  const entered = context.whatsappAutomationEnteredIds.has(automationId);
  const completed = context.whatsappAutomationCompletedIds.has(automationId);
  if (operator === "entered") return entered;
  if (operator === "not_entered") return !entered;
  if (operator === "completed") return completed;
  if (operator === "not_completed") return !completed;
  return false;
}

export function matchesAdvancedSegmentCondition(
  context: CRMAdvancedCustomerContext,
  condition: SegmentCondition,
  now = new Date(),
): boolean {
  const field = condition.field;
  const operator = condition.operator || "eq";

  if (field === "categoria_produto") {
    return taxonomyMatches(context.purchasedProductTypes, operator, condition.value, true);
  }

  if (field === "colecao_produto") {
    return taxonomyMatches(context.purchasedCollectionIds, operator, condition.value, false);
  }

  if (field === "categoria_periodo" || field === "colecao_periodo") {
    const value = parseTaxonomyMetricValue(condition.value);
    if (!value) return false;
    const isCategory = field === "categoria_periodo";
    const actual = taxonomyDate(
      isCategory ? context.productTypeLastPurchasedAt : context.collectionLastPurchasedAt,
      value.taxonomyValue,
      isCategory,
    );
    return compareRelativeDate(actual, operator, value, now);
  }

  if (
    field === "categoria_quantidade" ||
    field === "categoria_valor_gasto" ||
    field === "colecao_quantidade" ||
    field === "colecao_valor_gasto"
  ) {
    const value = parseTaxonomyMetricValue(condition.value);
    if (!value) return false;
    const isCategory = field.startsWith("categoria_");
    const isSpend = field.endsWith("valor_gasto");
    const map = isCategory
      ? isSpend
        ? context.productTypeSpentByValue
        : context.productTypeQuantityByValue
      : isSpend
        ? context.collectionSpentById
        : context.collectionQuantityById;
    const actual = taxonomyMetric(map, value.taxonomyValue, isCategory);
    return compareNumber(actual, operator, value);
  }

  if (field === "pedidos_periodo" || field === "gasto_periodo") {
    const value = parsePeriodMetricValue(condition.value);
    if (!value) return false;
    const actual = periodMetric(
      context.validPurchaseHistory,
      value.days,
      field === "pedidos_periodo" ? "orders" : "spend",
      now,
    );
    return compareNumber(actual, operator, value);
  }

  if (field === "campanha_whatsapp") {
    const campaignId = String(condition.value ?? "").trim();
    return campaignId ? campaignBehaviorMatches(context, operator, campaignId) : false;
  }

  if (field === "automacao_whatsapp") {
    const automationId = String(condition.value ?? "").trim();
    return automationId ? automationBehaviorMatches(context, operator, automationId) : false;
  }

  const value = parseProductMetricValue(condition.value);

  if (field === "produto_periodo") {
    if (!value) return false;
    const summary = context.purchasedProducts.get(value.productId);
    return compareRelativeDate(summary?.lastPurchasedAt ?? null, operator, value, now);
  }

  if (field === "produto_quantidade") {
    if (!value) return false;
    const quantity = Number(context.purchasedProducts.get(value.productId)?.quantity ?? 0);
    return compareNumber(quantity, operator, value);
  }

  if (field === "produto_valor_gasto") {
    if (!value) return false;
    const spent = Number(context.productSpentById.get(value.productId) ?? 0);
    return compareNumber(spent, operator, value);
  }

  if (field === "produto_sku") {
    if (!value?.sku) return false;
    const summary = context.purchasedProducts.get(value.productId);
    const bought = [...(summary?.skus ?? [])].some((sku) => normalize(sku) === normalize(value.sku));
    if (operator === "bought") return bought;
    if (operator === "not_bought") return !bought;
    return false;
  }

  return matchesSegmentCondition(context, condition, now);
}

/** AND dentro de cada grupo e OR entre grupos. */
export function matchesAdvancedSegmentRules(
  context: CRMAdvancedCustomerContext,
  rules: SegmentRules | null | undefined,
  now = new Date(),
): boolean {
  const groups = (rules?.groups ?? []).filter((group) => (group.conditions ?? []).length > 0);
  if (groups.length === 0) return true;
  return groups.some((group) =>
    (group.conditions ?? []).every((condition) => matchesAdvancedSegmentCondition(context, condition, now)),
  );
}
