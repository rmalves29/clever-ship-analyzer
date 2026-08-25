import {
  matchesSegmentCondition,
  type CRMCustomerContext,
  type SegmentCondition,
  type SegmentRules,
} from "./crm-segmentation-shared";

export type CRMAdvancedCustomerContext = CRMCustomerContext & {
  productSpentById: Map<string, number>;
  purchasedProductTypes: Set<string>;
  purchasedCollectionIds: Set<string>;
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

function compareNumber(actual: number, operator: string, value: ParsedProductMetricValue | null): boolean {
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

function compareProductDate(actualIso: string | null, operator: string, value: ParsedProductMetricValue | null, now: Date): boolean {
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

  const value = parseProductMetricValue(condition.value);

  if (field === "produto_periodo") {
    if (!value) return false;
    const summary = context.purchasedProducts.get(value.productId);
    return compareProductDate(summary?.lastPurchasedAt ?? null, operator, value, now);
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

/** AND dentro de cada grupo e OR entre grupos, incluindo os filtros avançados de produto. */
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
