const DAY_MS = 86_400_000;
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

export const SOCIAL_PROOF_DELAY_AFTER_CAPTURE_MS = 10_000;
export const SOCIAL_PROOF_INTERVAL_MS = 30_000;
export const SOCIAL_PROOF_VISIBLE_MS = 9_000;
export const SOCIAL_PROOF_FALLBACK_DELAY_MS = 20_000;

export type SocialProofLineItem = {
  title?: string | null;
  quantity?: number | null;
  image?: { url?: string | null } | null;
  product?: {
    featuredMedia?: {
      preview?: { image?: { url?: string | null } | null } | null;
    } | null;
  } | null;
};

export type SocialProofOrder = {
  createdAt?: string | null;
  processedAt?: string | null;
  cancelledAt?: string | null;
  displayFinancialStatus?: string | null;
  test?: boolean | null;
  customer?: { firstName?: string | null } | null;
  shippingAddress?: {
    firstName?: string | null;
    city?: string | null;
    provinceCode?: string | null;
  } | null;
  lineItems?: { nodes?: SocialProofLineItem[] | null } | null;
};

export type PublicSocialProofSale = {
  firstName: string;
  city: string | null;
  state: string | null;
  productTitle: string;
  productImageUrl: string | null;
  itemCount: number;
  purchasedAt: string;
  timeLabel: string;
};

function localDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function isoDay(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Intervalo UTC que representa exatamente o dia anterior em America/Sao_Paulo.
 * O Brasil não usa horário de verão desde 2019; São Paulo permanece em UTC-3. */
export function getPreviousDayRangeSaoPaulo(now = new Date()) {
  const current = localDateParts(now);
  const currentDayUtc = Date.UTC(current.year, current.month - 1, current.day);
  const previous = new Date(currentDayUtc - DAY_MS);
  const year = previous.getUTCFullYear();
  const month = previous.getUTCMonth() + 1;
  const day = previous.getUTCDate();
  const start = new Date(Date.UTC(year, month - 1, day, SAO_PAULO_UTC_OFFSET_HOURS));
  const end = new Date(start.getTime() + DAY_MS);
  return {
    date: isoDay(year, month, day),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function publicFirstName(value: string | null | undefined): string | null {
  const clean = cleanText(value);
  if (!clean) return null;
  const first = clean.split(" ")[0]?.trim();
  if (!first) return null;
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
}

function lineItemImage(item: SocialProofLineItem | undefined): string | null {
  return cleanText(item?.image?.url) || cleanText(item?.product?.featuredMedia?.preview?.image?.url) || null;
}

export function sanitizeSocialProofOrder(order: SocialProofOrder): PublicSocialProofSale | null {
  const status = cleanText(order.displayFinancialStatus).toUpperCase();
  if (status !== "PAID" && status !== "PARTIALLY_PAID") return null;
  if (order.cancelledAt || order.test) return null;

  const firstName = publicFirstName(order.shippingAddress?.firstName || order.customer?.firstName);
  if (!firstName) return null;

  const items = (order.lineItems?.nodes ?? []).filter((item) => cleanText(item?.title));
  if (!items.length) return null;
  const primary = items.find((item) => lineItemImage(item)) ?? items[0];
  const productTitle = cleanText(primary?.title);
  if (!productTitle) return null;

  const purchasedAt = cleanText(order.processedAt || order.createdAt);
  if (!purchasedAt || !Number.isFinite(new Date(purchasedAt).getTime())) return null;

  const itemCount = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity ?? 1) || 1), 0);
  return {
    firstName,
    city: cleanText(order.shippingAddress?.city) || null,
    state: cleanText(order.shippingAddress?.provinceCode) || null,
    productTitle,
    productImageUrl: lineItemImage(primary),
    itemCount,
    purchasedAt,
    timeLabel: "ontem",
  };
}

export function sanitizeSocialProofOrders(orders: SocialProofOrder[]): PublicSocialProofSale[] {
  return orders.map(sanitizeSocialProofOrder).filter((sale): sale is PublicSocialProofSale => Boolean(sale));
}

export function buildSocialProofShopifyQuery(startIso: string, endIso: string) {
  return `created_at:>='${startIso}' created_at:<'${endIso}'`;
}
