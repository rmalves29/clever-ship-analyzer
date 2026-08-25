import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import {
  buildCustomerContexts,
  type CRMOrderForSegmentation,
  type CRMOrderItemForSegmentation,
  type SegmentRules,
} from "./crm-segmentation-shared";
import {
  matchesAdvancedSegmentRules,
  type CRMAdvancedCustomerContext,
  type ValidPurchaseHistoryEntry,
} from "./crm-product-segmentation";
import { isRevenueValidOrder } from "./crm-rfm-shared";
import { getShopifyProductTaxonomyByIds, type ShopifyProductTaxonomy } from "./crm-product-taxonomy.server";

const ORDER_ITEM_BATCH = 200;
const DAY_MS = 86_400_000;

type LoadedOrder = CRMOrderForSegmentation & {
  orderNumber: string | null;
  subtotalPrice: number;
  totalDiscounts: number;
  totalShippingPrice: number;
  fulfillmentStatus: string | null;
  sourceName: string | null;
  rawData: any;
  createdAt: string;
};

type LoadedItem = CRMOrderItemForSegmentation & {
  id: string;
  totalDiscount: number;
};

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

function sourceOf(order: LoadedOrder): "TRAY" | "SHOPIFY" {
  return order.id.startsWith("tray:") || String(order.sourceName ?? "").toLowerCase() === "tray"
    ? "TRAY"
    : "SHOPIFY";
}

function lineNet(item: LoadedItem): number {
  const quantity = Number(item.quantity ?? 0);
  const price = Number(item.price ?? 0);
  const discount = Number(item.totalDiscount ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price)) return 0;
  return Math.max(0, price * quantity - (Number.isFinite(discount) ? discount : 0));
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
  const current = index.get(customerId);
  if (current) return current;
  const created = new Map<string, T>();
  index.set(customerId, created);
  return created;
}

function buildProductSpendIndex(orders: LoadedOrder[], items: LoadedItem[]) {
  const validOrders = new Map(
    orders.filter((order) => isRevenueValidOrder(order)).map((order) => [order.id, order] as const),
  );
  const result = new Map<string, Map<string, number>>();
  for (const item of items) {
    const order = validOrders.get(item.orderId);
    const productId = String(item.productId ?? "").trim();
    if (!order || !productId) continue;
    const customerSpend = result.get(order.customerId) ?? new Map<string, number>();
    customerSpend.set(productId, (customerSpend.get(productId) ?? 0) + lineNet(item));
    result.set(order.customerId, customerSpend);
  }
  return result;
}

function buildValidPurchaseHistory(orders: LoadedOrder[]): Map<string, ValidPurchaseHistoryEntry[]> {
  const result = new Map<string, ValidPurchaseHistoryEntry[]>();
  for (const order of orders) {
    if (!order.customerId || !order.processedAt || !isRevenueValidOrder(order)) continue;
    const list = result.get(order.customerId) ?? [];
    list.push({ processedAt: order.processedAt, totalPrice: Number(order.totalPrice ?? 0) });
    result.set(order.customerId, list);
  }
  for (const list of result.values()) {
    list.sort((a, b) => new Date(a.processedAt).getTime() - new Date(b.processedAt).getTime());
  }
  return result;
}

function buildTaxonomyIndexes(
  orders: LoadedOrder[],
  items: LoadedItem[],
  taxonomy: Map<string, ShopifyProductTaxonomy>,
): TaxonomyIndexes {
  const validOrders = new Map(
    orders.filter((order) => isRevenueValidOrder(order)).map((order) => [order.id, order] as const),
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
      const type = productTaxonomy.productType.trim();
      setLatestDate(getCustomerMap(result.productTypesLastPurchasedAt, order.customerId), type, order.processedAt);
      addNumber(getCustomerMap(result.productTypesQuantity, order.customerId), type, quantity);
      addNumber(getCustomerMap(result.productTypesSpent, order.customerId), type, net);
    }

    for (const collection of productTaxonomy.collections) {
      setLatestDate(getCustomerMap(result.collectionsLastPurchasedAt, order.customerId), collection.id, order.processedAt);
      addNumber(getCustomerMap(result.collectionsQuantity, order.customerId), collection.id, quantity);
      addNumber(getCustomerMap(result.collectionsSpent, order.customerId), collection.id, net);
    }
  }

  return result;
}

function startOfBusinessDay(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00-03:00`);
}

async function loadOrderItems(orderIds: string[]): Promise<LoadedItem[]> {
  if (orderIds.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: LoadedItem[] = [];
  for (let start = 0; start < orderIds.length; start += ORDER_ITEM_BATCH) {
    const ids = orderIds.slice(start, start + ORDER_ITEM_BATCH);
    const { data, error } = await supabaseAdmin
      .from("shopify_order_items")
      .select("id, order_id, product_id, variant_id, sku, title, variant_title, quantity, price, total_discount")
      .in("order_id", ids);
    if (error) throw new Error(`Erro ao buscar produtos da cliente: ${error.message}`);
    for (const row of data ?? []) {
      rows.push({
        id: String(row.id),
        orderId: String(row.order_id),
        productId: row.product_id ? String(row.product_id) : null,
        variantId: row.variant_id ? String(row.variant_id) : null,
        sku: row.sku,
        title: row.title,
        variantTitle: row.variant_title,
        quantity: Number(row.quantity ?? 0),
        price: Number(row.price ?? 0),
        totalDiscount: Number(row.total_discount ?? 0),
      });
    }
  }
  return rows;
}

async function loadCustomerAdvancedContext(
  customer: any,
  orders: LoadedOrder[],
  items: LoadedItem[],
  now: Date,
): Promise<CRMAdvancedCustomerContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const validOrderIds = orders.filter(isRevenueValidOrder).map((order) => order.id);
  const start = startOfBusinessDay(now);
  const end = new Date(start.getTime() + DAY_MS);

  const [checkoutResult, fulfillmentResult, campaignResult, automationResult] = await Promise.all([
    supabaseAdmin
      .from("shopify_abandoned_checkouts")
      .select("created_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1),
    validOrderIds.length > 0
      ? supabaseAdmin
          .from("shopify_fulfillments")
          .select("order_id")
          .in("order_id", validOrderIds.slice(0, 200))
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
      : Promise.resolve({ data: [], error: null } as any),
    supabaseAdmin
      .from("whatsapp_campaign_recipients")
      .select("campaign_id, status, sent_at, delivered_at, read_at, error")
      .eq("customer_id", customer.id),
    supabaseAdmin
      .from("whatsapp_automation_runs")
      .select("automation_id, status, completed_at")
      .eq("customer_id", customer.id),
  ]);

  if (checkoutResult.error) throw new Error(`Erro ao buscar abandono da cliente: ${checkoutResult.error.message}`);
  if (fulfillmentResult.error) throw new Error(`Erro ao buscar envios da cliente: ${fulfillmentResult.error.message}`);
  if (campaignResult.error) throw new Error(`Erro ao buscar campanhas da cliente: ${campaignResult.error.message}`);
  if (automationResult.error) throw new Error(`Erro ao buscar automações da cliente: ${automationResult.error.message}`);

  const abandonedCheckoutAtByCustomer = new Map<string, string>();
  const latestCheckoutAt = checkoutResult.data?.[0]?.created_at;
  if (latestCheckoutAt) abandonedCheckoutAtByCustomer.set(customer.id, String(latestCheckoutAt));

  const shippedTodayValidOrderIds = new Set<string>(
    (fulfillmentResult.data ?? []).map((row: any) => String(row.order_id)).filter(Boolean),
  );

  const baseContext = buildCustomerContexts({
    customers: [customer],
    orders,
    orderItems: items,
    abandonedCheckoutAtByCustomer,
    shippedTodayValidOrderIds,
  })[0];
  if (!baseContext) throw new Error("Não foi possível montar o contexto da cliente.");

  const productIds = [
    ...new Set(
      items
        .map((item) => String(item.productId ?? "").trim())
        .filter((id) => id.startsWith("gid://shopify/Product/")),
    ),
  ];
  const taxonomy = await getShopifyProductTaxonomyByIds(productIds);
  const taxonomyIndexes = buildTaxonomyIndexes(orders, items, taxonomy);
  const spendIndex = buildProductSpendIndex(orders, items);
  const purchaseHistory = buildValidPurchaseHistory(orders);

  const purchasedProductTypes = new Set<string>();
  const purchasedCollectionIds = new Set<string>();
  for (const productId of baseContext.purchasedProducts.keys()) {
    const productTaxonomy = taxonomy.get(productId);
    if (!productTaxonomy) continue;
    if (productTaxonomy.productType?.trim()) purchasedProductTypes.add(productTaxonomy.productType.trim());
    for (const collection of productTaxonomy.collections) purchasedCollectionIds.add(collection.id);
  }

  const campaignSent = new Set<string>();
  const campaignDelivered = new Set<string>();
  const campaignRead = new Set<string>();
  const campaignFailed = new Set<string>();
  for (const row of campaignResult.data ?? []) {
    const id = String((row as any).campaign_id ?? "").trim();
    if (!id) continue;
    const status = String((row as any).status ?? "").toLowerCase();
    if ((row as any).sent_at || ["sent", "delivered", "read"].includes(status)) campaignSent.add(id);
    if ((row as any).delivered_at || ["delivered", "read"].includes(status)) campaignDelivered.add(id);
    if ((row as any).read_at || status === "read") campaignRead.add(id);
    if ((row as any).error || status === "failed") campaignFailed.add(id);
  }

  const automationEntered = new Set<string>();
  const automationCompleted = new Set<string>();
  for (const row of automationResult.data ?? []) {
    const id = String((row as any).automation_id ?? "").trim();
    if (!id) continue;
    automationEntered.add(id);
    if ((row as any).completed_at || String((row as any).status ?? "").toLowerCase() === "completed") {
      automationCompleted.add(id);
    }
  }

  return {
    ...baseContext,
    productSpentById: spendIndex.get(customer.id) ?? new Map<string, number>(),
    purchasedProductTypes,
    purchasedCollectionIds,
    productTypeLastPurchasedAt: taxonomyIndexes.productTypesLastPurchasedAt.get(customer.id) ?? new Map<string, string>(),
    collectionLastPurchasedAt: taxonomyIndexes.collectionsLastPurchasedAt.get(customer.id) ?? new Map<string, string>(),
    validPurchaseHistory: purchaseHistory.get(customer.id) ?? [],
    productTypeQuantityByValue: taxonomyIndexes.productTypesQuantity.get(customer.id) ?? new Map<string, number>(),
    productTypeSpentByValue: taxonomyIndexes.productTypesSpent.get(customer.id) ?? new Map<string, number>(),
    collectionQuantityById: taxonomyIndexes.collectionsQuantity.get(customer.id) ?? new Map<string, number>(),
    collectionSpentById: taxonomyIndexes.collectionsSpent.get(customer.id) ?? new Map<string, number>(),
    whatsappCampaignSentIds: campaignSent,
    whatsappCampaignDeliveredIds: campaignDelivered,
    whatsappCampaignReadIds: campaignRead,
    whatsappCampaignFailedIds: campaignFailed,
    whatsappAutomationEnteredIds: automationEntered,
    whatsappAutomationCompletedIds: automationCompleted,
  };
}

export const getCustomer360 = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ customerId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("shopify_customers")
      .select("id, email, first_name, last_name, phone, city, province, country, tags, tags_custom, rfm_segment, created_at, updated_at")
      .eq("id", data.customerId)
      .maybeSingle();
    if (customerError) throw new Error(`Erro ao buscar a cliente: ${customerError.message}`);
    if (!customer) throw new Error("Cliente não encontrada no CRM.");

    const { data: orderRows, error: ordersError } = await (supabaseAdmin.from("shopify_orders") as any)
      .select("id, order_number, customer_id, total_price, subtotal_price, total_discounts, total_shipping_price, financial_status, fulfillment_status, processed_at, created_at, cancelled_at, source_name, raw_data")
      .eq("customer_id", data.customerId)
      .order("processed_at", { ascending: false })
      .limit(1000);
    if (ordersError) throw new Error(`Erro ao buscar os pedidos da cliente: ${ordersError.message}`);

    const orders: LoadedOrder[] = (orderRows ?? []).map((row: any) => ({
      id: String(row.id),
      orderNumber: row.order_number ? String(row.order_number) : null,
      customerId: String(row.customer_id ?? data.customerId),
      totalPrice: Number(row.total_price ?? 0),
      subtotalPrice: Number(row.subtotal_price ?? 0),
      totalDiscounts: Number(row.total_discounts ?? 0),
      totalShippingPrice: Number(row.total_shipping_price ?? 0),
      processedAt: String(row.processed_at ?? row.created_at ?? ""),
      createdAt: String(row.created_at ?? row.processed_at ?? ""),
      financialStatus: row.financial_status,
      fulfillmentStatus: row.fulfillment_status,
      cancelledAt: row.cancelled_at,
      sourceName: row.source_name,
      rawData: row.raw_data,
    }));

    const items = await loadOrderItems(orders.map((order) => order.id));
    const now = new Date();
    const context = await loadCustomerAdvancedContext(customer, orders, items, now);

    const { data: segments, error: segmentsError } = await supabaseAdmin
      .from("crm_segments")
      .select("id, nome, descricao, regras")
      .order("nome", { ascending: true });
    if (segmentsError) throw new Error(`Erro ao buscar segmentos da cliente: ${segmentsError.message}`);
    const currentSegments = (segments ?? [])
      .filter((segment: any) => matchesAdvancedSegmentRules(context, segment.regras as SegmentRules, now))
      .map((segment: any) => ({ id: String(segment.id), name: String(segment.nome), description: segment.descricao ? String(segment.descricao) : null }));

    const validOrders = orders.filter(isRevenueValidOrder).sort((a, b) => new Date(a.processedAt).getTime() - new Date(b.processedAt).getTime());
    const totalSpent = validOrders.reduce((sum, order) => sum + Number(order.totalPrice ?? 0), 0);
    const trayOrders = validOrders.filter((order) => sourceOf(order) === "TRAY").length;
    const shopifyOrders = validOrders.length - trayOrders;
    const firstOrderAt = validOrders[0]?.processedAt ?? null;
    const lastOrderAt = validOrders.at(-1)?.processedAt ?? null;
    const daysSinceLastPurchase = lastOrderAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / DAY_MS))
      : null;
    let daysToSecondPurchase: number | null = null;
    const firstValidOrder = validOrders[0];
    const secondValidOrder = validOrders[1];
    if (firstValidOrder && secondValidOrder) {
      daysToSecondPurchase = Math.max(
        0,
        Math.round((new Date(secondValidOrder.processedAt).getTime() - new Date(firstValidOrder.processedAt).getTime()) / DAY_MS),
      );
    }

    const orderById = new Map(orders.map((order) => [order.id, order] as const));
    const itemsByOrder = new Map<string, LoadedItem[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    const productMap = new Map<string, {
      productId: string | null;
      title: string;
      sku: string | null;
      quantity: number;
      spent: number;
      orderIds: Set<string>;
      lastPurchasedAt: string | null;
      sources: Set<string>;
    }>();
    const validOrderIdSet = new Set(validOrders.map((order) => order.id));
    for (const item of items) {
      if (!validOrderIdSet.has(item.orderId)) continue;
      const order = orderById.get(item.orderId);
      if (!order) continue;
      const sku = item.sku?.trim() || null;
      const productId = item.productId ? String(item.productId) : null;
      const key = sku ? `sku:${sku.toLocaleLowerCase("pt-BR")}` : `product:${productId ?? item.title ?? item.id}`;
      const current = productMap.get(key) ?? {
        productId,
        title: item.title?.trim() || "Produto",
        sku,
        quantity: 0,
        spent: 0,
        orderIds: new Set<string>(),
        lastPurchasedAt: null,
        sources: new Set<string>(),
      };
      current.quantity += Number(item.quantity ?? 0);
      current.spent += lineNet(item);
      current.orderIds.add(item.orderId);
      current.sources.add(sourceOf(order));
      if (!current.lastPurchasedAt || new Date(order.processedAt).getTime() > new Date(current.lastPurchasedAt).getTime()) {
        current.lastPurchasedAt = order.processedAt;
      }
      productMap.set(key, current);
    }

    const { data: abandonedRows, error: abandonedError } = await supabaseAdmin
      .from("shopify_abandoned_checkouts")
      .select("id, created_at, total_price")
      .eq("customer_id", data.customerId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (abandonedError) throw new Error(`Erro ao buscar checkouts abandonados: ${abandonedError.message}`);

    const { data: campaignRows, error: campaignError } = await supabaseAdmin
      .from("whatsapp_campaign_recipients")
      .select("campaign_id, status, sent_at, delivered_at, read_at, error")
      .eq("customer_id", data.customerId)
      .order("sent_at", { ascending: false })
      .limit(30);
    if (campaignError) throw new Error(`Erro ao buscar histórico de WhatsApp: ${campaignError.message}`);
    const campaignIds = [...new Set((campaignRows ?? []).map((row: any) => String(row.campaign_id)).filter(Boolean))];
    const campaignNames = new Map<string, string>();
    if (campaignIds.length > 0) {
      const { data: campaignDefinitions } = await supabaseAdmin.from("whatsapp_campaigns").select("id, nome").in("id", campaignIds);
      for (const row of campaignDefinitions ?? []) campaignNames.set(String(row.id), String(row.nome ?? "Campanha"));
    }

    const { data: automationRows, error: automationError } = await supabaseAdmin
      .from("whatsapp_automation_runs")
      .select("automation_id, status, completed_at")
      .eq("customer_id", data.customerId)
      .limit(30);
    if (automationError) throw new Error(`Erro ao buscar automações da cliente: ${automationError.message}`);
    const automationIds = [...new Set((automationRows ?? []).map((row: any) => String(row.automation_id)).filter(Boolean))];
    const automationNames = new Map<string, string>();
    if (automationIds.length > 0) {
      const { data: automationDefinitions } = await supabaseAdmin.from("whatsapp_automations").select("id, nome").in("id", automationIds);
      for (const row of automationDefinitions ?? []) automationNames.set(String(row.id), String(row.nome ?? "Automação"));
    }

    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime())
      .slice(0, 20)
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        source: sourceOf(order),
        date: order.processedAt,
        total: order.totalPrice,
        subtotal: order.subtotalPrice,
        discount: order.totalDiscounts,
        shipping: order.totalShippingPrice,
        financialStatus: order.financialStatus ?? null,
        fulfillmentStatus: order.fulfillmentStatus,
        validRevenue: isRevenueValidOrder(order),
        paymentType: order.rawData?.payment_type ?? null,
        coupon: order.rawData?.coupon ?? null,
        items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
          id: item.id,
          title: item.title ?? "Produto",
          sku: item.sku ?? null,
          quantity: Number(item.quantity ?? 0),
          unitPrice: Number(item.price ?? 0),
        })),
      }));

    return {
      customer: {
        id: customer.id,
        name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Cliente sem nome",
        firstName: customer.first_name ?? null,
        lastName: customer.last_name ?? null,
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        city: customer.city ?? null,
        province: customer.province ?? null,
        country: customer.country ?? null,
        tags: customer.tags ?? [],
        tagsCustom: customer.tags_custom ?? [],
        rfmSegment: customer.rfm_segment ?? null,
        createdAt: customer.created_at ?? null,
        updatedAt: customer.updated_at ?? null,
      },
      metrics: {
        totalOrders: validOrders.length,
        totalSpent,
        averageTicket: validOrders.length > 0 ? totalSpent / validOrders.length : 0,
        firstOrderAt,
        lastOrderAt,
        daysSinceLastPurchase,
        trayOrders,
        shopifyOrders,
        recurrence: validOrders.length >= 2,
        purchaseStage: validOrders.length === 0 ? "SEM_COMPRA" : validOrders.length === 1 ? "SEGUNDA_COMPRA_PENDENTE" : "RECORRENTE",
        daysToSecondPurchase,
      },
      segments: currentSegments,
      products: [...productMap.values()]
        .map((product) => ({
          productId: product.productId,
          title: product.title,
          sku: product.sku,
          quantity: product.quantity,
          spent: product.spent,
          orderCount: product.orderIds.size,
          lastPurchasedAt: product.lastPurchasedAt,
          sources: [...product.sources],
        }))
        .sort((a, b) => b.spent - a.spent),
      recentOrders,
      engagement: {
        abandonedCheckouts: (abandonedRows ?? []).map((row: any) => ({
          id: String(row.id),
          createdAt: row.created_at ? String(row.created_at) : null,
          total: Number(row.total_price ?? 0),
        })),
        campaigns: (campaignRows ?? []).map((row: any) => ({
          campaignId: String(row.campaign_id),
          name: campaignNames.get(String(row.campaign_id)) ?? "Campanha",
          status: row.status ?? null,
          sentAt: row.sent_at ?? null,
          deliveredAt: row.delivered_at ?? null,
          readAt: row.read_at ?? null,
          error: row.error ?? null,
        })),
        automations: (automationRows ?? []).map((row: any) => ({
          automationId: String(row.automation_id),
          name: automationNames.get(String(row.automation_id)) ?? "Automação",
          status: row.status ?? null,
          completedAt: row.completed_at ?? null,
        })),
      },
    };
  });
