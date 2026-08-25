import {
  buildCustomerContexts,
  type CRMOrderForSegmentation,
  type CRMOrderItemForSegmentation,
} from "./crm-segmentation-shared";
import type { CRMAdvancedCustomerContext, ValidPurchaseHistoryEntry } from "./crm-product-segmentation";
import { isRevenueValidOrder } from "./crm-rfm-shared";
import { getShopifyProductTaxonomyByIds, type ShopifyProductTaxonomy } from "./crm-product-taxonomy.server";

const PAGE_SIZE = 1000;
const ORDER_ID_BATCH = 200;

type LoadedOrderItem = CRMOrderItemForSegmentation & {
  totalDiscount?: number | null;
};

export type CRMProductOption = { id: string; title: string; skus: string[] };
export type CRMCollectionOption = { id: string; title: string };

type CustomerStringMapIndex = Map<string, Map<string, string>>;
type CustomerNumberMapIndex = Map<string, Map<string, number>>;

type TaxonomyIndexes = {
  productTypesLastPurchasedAt: CustomerStringMapIndex;
  collectionsLastPurchasedAt: CustomerStringMapIndex;
  productTypesQuantity: CustomerNumberMapIndex;
  productTypesSpent: CustomerNumberMapIndex;
  collectionsQuantity: CustomerNumberMapIndex;
  collectionsSpent: CustomerNumberMapIndex;
};

type WhatsappBehaviorIndexes = {
  campaignSent: Map<string, Set<string>>;
  campaignDelivered: Map<string, Set<string>>;
  campaignRead: Map<string, Set<string>>;
  campaignFailed: Map<string, Set<string>>;
  automationEntered: Map<string, Set<string>>;
  automationCompleted: Map<string, Set<string>>;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadCustomers() {
  const db = await admin();
  const rows: any[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_customers")
      .select("*")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar clientes do CRM: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadOrders(): Promise<CRMOrderForSegmentation[]> {
  const db = await admin();
  const rows: CRMOrderForSegmentation[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await (db.from("shopify_orders") as any)
      .select("id, customer_id, total_price, processed_at, created_at, financial_status, cancelled_at")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar pedidos do CRM: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as any[]) {
      if (!row.customer_id) continue;
      rows.push({
        id: String(row.id),
        customerId: String(row.customer_id),
        totalPrice: Number(row.total_price ?? 0),
        processedAt: String(row.processed_at ?? row.created_at ?? ""),
        financialStatus: row.financial_status,
        cancelledAt: row.cancelled_at,
      });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadValidOrderItems(orders: CRMOrderForSegmentation[]): Promise<LoadedOrderItem[]> {
  const db = await admin();
  const validOrderIds = [...new Set(orders.filter(isRevenueValidOrder).map((order) => order.id))];
  const rows: LoadedOrderItem[] = [];

  for (let start = 0; start < validOrderIds.length; start += ORDER_ID_BATCH) {
    const ids = validOrderIds.slice(start, start + ORDER_ID_BATCH);
    const { data, error } = await db
      .from("shopify_order_items")
      .select("order_id, product_id, variant_id, sku, title, variant_title, quantity, price, total_discount")
      .in("order_id", ids);
    if (error) throw new Error(`Erro ao buscar itens de pedidos válidos do CRM: ${error.message}`);

    for (const item of data ?? []) {
      if (!item.order_id) continue;
      rows.push({
        orderId: String(item.order_id),
        productId: item.product_id ? String(item.product_id) : null,
        variantId: item.variant_id ? String(item.variant_id) : null,
        sku: item.sku,
        title: item.title,
        variantTitle: item.variant_title,
        quantity: item.quantity,
        price: item.price,
        totalDiscount: item.total_discount,
      });
    }
  }

  return rows;
}

function lineNet(item: LoadedOrderItem): number {
  const quantity = Number(item.quantity ?? 0);
  const unitPrice = Number(item.price ?? 0);
  const discount = Number(item.totalDiscount ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) return 0;
  return Math.max(0, unitPrice * quantity - (Number.isFinite(discount) ? discount : 0));
}

function buildProductSpendIndex(
  orders: CRMOrderForSegmentation[],
  items: LoadedOrderItem[],
): Map<string, Map<string, number>> {
  const validOrders = new Map(
    orders
      .filter((order) => order.customerId && isRevenueValidOrder(order))
      .map((order) => [order.id, order] as const),
  );
  const index = new Map<string, Map<string, number>>();

  for (const item of items) {
    const order = validOrders.get(item.orderId);
    const productId = String(item.productId ?? "").trim();
    if (!order || !productId) continue;
    const net = lineNet(item);
    const customerSpend = index.get(order.customerId) ?? new Map<string, number>();
    customerSpend.set(productId, (customerSpend.get(productId) ?? 0) + net);
    index.set(order.customerId, customerSpend);
  }

  return index;
}

function buildValidPurchaseHistoryIndex(
  orders: CRMOrderForSegmentation[],
): Map<string, ValidPurchaseHistoryEntry[]> {
  const index = new Map<string, ValidPurchaseHistoryEntry[]>();
  for (const order of orders) {
    if (!order.customerId || !order.processedAt || !isRevenueValidOrder(order)) continue;
    const list = index.get(order.customerId) ?? [];
    list.push({ processedAt: order.processedAt, totalPrice: Number(order.totalPrice ?? 0) });
    index.set(order.customerId, list);
  }
  for (const list of index.values()) {
    list.sort((a, b) => new Date(a.processedAt).getTime() - new Date(b.processedAt).getTime());
  }
  return index;
}

function setLatestDate(index: Map<string, string>, key: string, date: string) {
  const current = index.get(key);
  if (!current || new Date(date).getTime() > new Date(current).getTime()) index.set(key, date);
}

function addNumber(index: Map<string, number>, key: string, amount: number) {
  if (!Number.isFinite(amount)) return;
  index.set(key, (index.get(key) ?? 0) + amount);
}

function getCustomerMap<T>(index: Map<string, Map<string, T>>, customerId: string): Map<string, T> {
  const existing = index.get(customerId);
  if (existing) return existing;
  const created = new Map<string, T>();
  index.set(customerId, created);
  return created;
}

function buildTaxonomyIndexes(
  orders: CRMOrderForSegmentation[],
  items: LoadedOrderItem[],
  taxonomy: Map<string, ShopifyProductTaxonomy>,
): TaxonomyIndexes {
  const validOrders = new Map(
    orders
      .filter((order) => order.customerId && isRevenueValidOrder(order))
      .map((order) => [order.id, order] as const),
  );
  const result: TaxonomyIndexes = {
    productTypesLastPurchasedAt: new Map(),
    collectionsLastPurchasedAt: new Map(),
    productTypesQuantity: new Map(),
    productTypesSpent: new Map(),
    collectionsQuantity: new Map(),
    collectionsSpent: new Map(),
  };

  for (const item of items) {
    const order = validOrders.get(item.orderId);
    const productId = String(item.productId ?? "").trim();
    if (!order || !productId || !order.processedAt) continue;
    const productTaxonomy = taxonomy.get(productId);
    if (!productTaxonomy) continue;

    const quantity = Math.max(0, Number(item.quantity ?? 0));
    const net = lineNet(item);

    if (productTaxonomy.productType?.trim()) {
      const key = productTaxonomy.productType.trim();
      setLatestDate(getCustomerMap(result.productTypesLastPurchasedAt, order.customerId), key, order.processedAt);
      addNumber(getCustomerMap(result.productTypesQuantity, order.customerId), key, quantity);
      addNumber(getCustomerMap(result.productTypesSpent, order.customerId), key, net);
    }

    for (const collection of productTaxonomy.collections) {
      setLatestDate(getCustomerMap(result.collectionsLastPurchasedAt, order.customerId), collection.id, order.processedAt);
      addNumber(getCustomerMap(result.collectionsQuantity, order.customerId), collection.id, quantity);
      addNumber(getCustomerMap(result.collectionsSpent, order.customerId), collection.id, net);
    }
  }

  return result;
}

function addToSetIndex(index: Map<string, Set<string>>, customerId: string, value: string) {
  const set = index.get(customerId) ?? new Set<string>();
  set.add(value);
  index.set(customerId, set);
}

async function loadWhatsappBehaviorIndexes(): Promise<WhatsappBehaviorIndexes> {
  const db = await admin();
  const indexes: WhatsappBehaviorIndexes = {
    campaignSent: new Map(),
    campaignDelivered: new Map(),
    campaignRead: new Map(),
    campaignFailed: new Map(),
    automationEntered: new Map(),
    automationCompleted: new Map(),
  };

  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("whatsapp_campaign_recipients")
      .select("campaign_id, customer_id, status, sent_at, delivered_at, read_at, error")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar comportamento de campanhas WhatsApp: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      const customerId = String(row.customer_id ?? "").trim();
      const campaignId = String(row.campaign_id ?? "").trim();
      if (!customerId || !campaignId) continue;
      const status = String(row.status ?? "").trim().toLowerCase();
      const sent = Boolean(row.sent_at) || ["sent", "delivered", "read"].includes(status);
      const delivered = Boolean(row.delivered_at) || ["delivered", "read"].includes(status);
      const read = Boolean(row.read_at) || status === "read";
      const failed = status === "failed" || Boolean(row.error);
      if (sent) addToSetIndex(indexes.campaignSent, customerId, campaignId);
      if (delivered) addToSetIndex(indexes.campaignDelivered, customerId, campaignId);
      if (read) addToSetIndex(indexes.campaignRead, customerId, campaignId);
      if (failed) addToSetIndex(indexes.campaignFailed, customerId, campaignId);
    }
    if (data.length < PAGE_SIZE) break;
  }

  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("whatsapp_automation_runs")
      .select("automation_id, customer_id, status, completed_at")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar comportamento de automações WhatsApp: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      const customerId = String(row.customer_id ?? "").trim();
      const automationId = String(row.automation_id ?? "").trim();
      if (!customerId || !automationId) continue;
      addToSetIndex(indexes.automationEntered, customerId, automationId);
      if (row.completed_at || String(row.status ?? "").trim().toLowerCase() === "completed") {
        addToSetIndex(indexes.automationCompleted, customerId, automationId);
      }
    }
    if (data.length < PAGE_SIZE) break;
  }

  return indexes;
}

async function loadLatestAbandonedCheckoutByCustomer(): Promise<Map<string, string>> {
  const db = await admin();
  const latest = new Map<string, string>();
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_abandoned_checkouts")
      .select("customer_id, created_at")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar checkouts abandonados: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (!row.customer_id || !row.created_at) continue;
      const customerId = String(row.customer_id);
      const current = latest.get(customerId);
      if (!current || new Date(row.created_at).getTime() > new Date(current).getTime()) latest.set(customerId, row.created_at);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return latest;
}

function startOfBusinessDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00-03:00`);
}

async function loadShippedTodayValidOrderIds(orders: CRMOrderForSegmentation[], now: Date): Promise<Set<string>> {
  const db = await admin();
  const start = startOfBusinessDay(now);
  const end = new Date(start.getTime() + 86_400_000);
  const validOrderIds = new Set(orders.filter(isRevenueValidOrder).map((order) => order.id));
  if (validOrderIds.size === 0) return new Set<string>();

  const shipped = new Set<string>();
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_fulfillments")
      .select("order_id")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar envios de hoje: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.order_id && validOrderIds.has(String(row.order_id))) shipped.add(String(row.order_id));
    }
    if (data.length < PAGE_SIZE) break;
  }
  return shipped;
}

function productIdsFromItems(items: LoadedOrderItem[]): string[] {
  return [...new Set(items.map((item) => String(item.productId ?? "").trim()).filter(Boolean))];
}

function buildProductOptions(items: LoadedOrderItem[]): CRMProductOption[] {
  const products = new Map<string, { id: string; title: string; skus: Set<string> }>();
  for (const item of items) {
    const id = String(item.productId ?? "").trim();
    if (!id) continue;
    const current = products.get(id) ?? {
      id,
      title: item.title?.trim() || `Produto ${id}`,
      skus: new Set<string>(),
    };
    if (current.title.startsWith("Produto ") && item.title?.trim()) current.title = item.title.trim();
    if (item.sku?.trim()) current.skus.add(item.sku.trim());
    products.set(id, current);
  }
  return [...products.values()]
    .map((product) => ({ ...product, skus: [...product.skus].sort((a, b) => a.localeCompare(b, "pt-BR")) }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

export async function loadCRMProductFilterOptionsBundle(): Promise<{
  products: CRMProductOption[];
  productTypes: string[];
  collections: CRMCollectionOption[];
}> {
  const orders = await loadOrders();
  const items = await loadValidOrderItems(orders);
  const products = buildProductOptions(items);
  const taxonomy = await getShopifyProductTaxonomyByIds(productIdsFromItems(items));
  const productTypes = new Set<string>();
  const collections = new Map<string, CRMCollectionOption>();

  for (const item of taxonomy.values()) {
    if (item.productType?.trim()) productTypes.add(item.productType.trim());
    for (const collection of item.collections) collections.set(collection.id, { id: collection.id, title: collection.title });
  }

  return {
    products,
    productTypes: [...productTypes].sort((a, b) => a.localeCompare(b, "pt-BR")),
    collections: [...collections.values()].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")),
  };
}

export async function loadCRMProductFilterOptions(): Promise<CRMProductOption[]> {
  return (await loadCRMProductFilterOptionsBundle()).products;
}

export async function loadCRMSegmentationContext(now = new Date()): Promise<CRMAdvancedCustomerContext[]> {
  const [customers, orders, abandonedCheckoutAtByCustomer, whatsappBehavior] = await Promise.all([
    loadCustomers(),
    loadOrders(),
    loadLatestAbandonedCheckoutByCustomer(),
    loadWhatsappBehaviorIndexes(),
  ]);
  const [shippedTodayValidOrderIds, orderItems] = await Promise.all([
    loadShippedTodayValidOrderIds(orders, now),
    loadValidOrderItems(orders),
  ]);
  const baseContexts = buildCustomerContexts({
    customers,
    orders,
    orderItems,
    abandonedCheckoutAtByCustomer,
    shippedTodayValidOrderIds,
  });
  const spendIndex = buildProductSpendIndex(orders, orderItems);
  const purchaseHistoryIndex = buildValidPurchaseHistoryIndex(orders);
  const taxonomy = await getShopifyProductTaxonomyByIds(productIdsFromItems(orderItems));
  const taxonomyIndexes = buildTaxonomyIndexes(orders, orderItems, taxonomy);

  return baseContexts.map((context) => {
    const purchasedProductTypes = new Set<string>();
    const purchasedCollectionIds = new Set<string>();
    for (const productId of context.purchasedProducts.keys()) {
      const productTaxonomy = taxonomy.get(productId);
      if (!productTaxonomy) continue;
      if (productTaxonomy.productType?.trim()) purchasedProductTypes.add(productTaxonomy.productType.trim());
      for (const collection of productTaxonomy.collections) purchasedCollectionIds.add(collection.id);
    }

    const customerId = context.customer.id;
    return {
      ...context,
      productSpentById: spendIndex.get(customerId) ?? new Map<string, number>(),
      purchasedProductTypes,
      purchasedCollectionIds,
      productTypeLastPurchasedAt: taxonomyIndexes.productTypesLastPurchasedAt.get(customerId) ?? new Map<string, string>(),
      collectionLastPurchasedAt: taxonomyIndexes.collectionsLastPurchasedAt.get(customerId) ?? new Map<string, string>(),
      validPurchaseHistory: purchaseHistoryIndex.get(customerId) ?? [],
      productTypeQuantityByValue: taxonomyIndexes.productTypesQuantity.get(customerId) ?? new Map<string, number>(),
      productTypeSpentByValue: taxonomyIndexes.productTypesSpent.get(customerId) ?? new Map<string, number>(),
      collectionQuantityById: taxonomyIndexes.collectionsQuantity.get(customerId) ?? new Map<string, number>(),
      collectionSpentById: taxonomyIndexes.collectionsSpent.get(customerId) ?? new Map<string, number>(),
      whatsappCampaignSentIds: whatsappBehavior.campaignSent.get(customerId) ?? new Set<string>(),
      whatsappCampaignDeliveredIds: whatsappBehavior.campaignDelivered.get(customerId) ?? new Set<string>(),
      whatsappCampaignReadIds: whatsappBehavior.campaignRead.get(customerId) ?? new Set<string>(),
      whatsappCampaignFailedIds: whatsappBehavior.campaignFailed.get(customerId) ?? new Set<string>(),
      whatsappAutomationEnteredIds: whatsappBehavior.automationEntered.get(customerId) ?? new Set<string>(),
      whatsappAutomationCompletedIds: whatsappBehavior.automationCompleted.get(customerId) ?? new Set<string>(),
    };
  });
}
