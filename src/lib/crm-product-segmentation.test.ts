import { describe, expect, it } from "vitest";
import {
  matchesAdvancedSegmentCondition,
  matchesAdvancedSegmentRules,
  type CRMAdvancedCustomerContext,
} from "./crm-product-segmentation";

const NOW = new Date("2026-08-24T15:00:00-03:00");

const context: CRMAdvancedCustomerContext = {
  customer: { id: "c1", rfm_segment: "Recorrente" },
  metrics: {
    customerId: "c1",
    validOrderCount: 3,
    totalSpent: 500,
    averageTicket: 500 / 3,
    firstOrderAt: "2026-07-20T12:00:00-03:00",
    lastOrderAt: "2026-08-20T12:00:00-03:00",
    validOrderIds: new Set(["o1", "o2", "o3"]),
    rawFinancialStatuses: new Set(["PAID"]),
    validFinancialStatuses: new Set(["PAID"]),
    cancelledOrderCount: 0,
    rawFulfillmentStatuses: new Set(["FULFILLED"]),
  },
  purchasedProducts: new Map([
    ["p-brinco", {
      productId: "p-brinco",
      title: "Brinco Londres",
      skus: new Set(["BR-LON-DOU", "BR-LON-PRA"]),
      quantity: 4,
      orderIds: new Set(["o1", "o2"]),
      lastPurchasedAt: "2026-08-20T12:00:00-03:00",
    }],
  ]),
  productSpentById: new Map([["p-brinco", 320]]),
  purchasedProductTypes: new Set(["Brincos"]),
  purchasedCollectionIds: new Set(["gid://shopify/Collection/100"]),
  productTypeLastPurchasedAt: new Map([["Brincos", "2026-08-20T12:00:00-03:00"]]),
  collectionLastPurchasedAt: new Map([["gid://shopify/Collection/100", "2026-08-10T12:00:00-03:00"]]),
  validPurchaseHistory: [
    { processedAt: "2026-07-20T12:00:00-03:00", totalPrice: 200 },
    { processedAt: "2026-08-10T12:00:00-03:00", totalPrice: 200 },
    { processedAt: "2026-08-20T12:00:00-03:00", totalPrice: 100 },
  ],
  productTypeQuantityByValue: new Map([["Brincos", 4]]),
  productTypeSpentByValue: new Map([["Brincos", 320]]),
  collectionQuantityById: new Map([["gid://shopify/Collection/100", 2]]),
  collectionSpentById: new Map([["gid://shopify/Collection/100", 180]]),
  whatsappCampaignSentIds: new Set(["camp-1"]),
  whatsappCampaignDeliveredIds: new Set(["camp-1"]),
  whatsappCampaignReadIds: new Set(["camp-1"]),
  whatsappCampaignFailedIds: new Set(["camp-2"]),
  whatsappAutomationEnteredIds: new Set(["auto-1", "auto-2"]),
  whatsappAutomationCompletedIds: new Set(["auto-1"]),
  abandonedCheckout: false,
  hadAbandonedCheckout: false,
  abandonedCheckoutRecovered: false,
  lastAbandonedCheckoutAt: null,
  shippedToday: false,
};

const match = (field: string, operator: string, value: unknown) =>
  matchesAdvancedSegmentCondition(context, { field, operator, value }, NOW);

describe("filtros avançados por produto e comportamento", () => {
  it("filtra pela última compra do produto", () => {
    expect(match("produto_periodo", "last_days", { productId: "p-brinco", days: 7 })).toBe(true);
    expect(match("produto_periodo", "last_days", { productId: "p-brinco", days: 2 })).toBe(false);
    expect(match("produto_periodo", "older_than_days", { productId: "p-brinco", days: 3 })).toBe(true);
    expect(match("produto_periodo", "between_days", { productId: "p-brinco", min: 3, max: 7 })).toBe(true);
  });

  it("filtra quantidade acumulada do produto", () => {
    expect(match("produto_quantidade", "gte", { productId: "p-brinco", amount: 4 })).toBe(true);
    expect(match("produto_quantidade", "gt", { productId: "p-brinco", amount: 4 })).toBe(false);
    expect(match("produto_quantidade", "between", { productId: "p-brinco", min: 3, max: 5 })).toBe(true);
  });

  it("filtra valor líquido acumulado do produto", () => {
    expect(match("produto_valor_gasto", "gte", { productId: "p-brinco", amount: 300 })).toBe(true);
    expect(match("produto_valor_gasto", "lt", { productId: "p-brinco", amount: 300 })).toBe(false);
    expect(match("produto_valor_gasto", "between", { productId: "p-brinco", min: 300, max: 350 })).toBe(true);
  });

  it("filtra SKU comprado e não comprado", () => {
    expect(match("produto_sku", "bought", { productId: "p-brinco", sku: "br-lon-dou" })).toBe(true);
    expect(match("produto_sku", "not_bought", { productId: "p-brinco", sku: "BR-LON-ROS" })).toBe(true);
    expect(match("produto_sku", "bought", { productId: "p-brinco", sku: "BR-LON-ROS" })).toBe(false);
  });

  it("filtra categoria/tipo comprado ignorando acentos e caixa", () => {
    expect(match("categoria_produto", "bought", "brincos")).toBe(true);
    expect(match("categoria_produto", "not_bought", "Colares")).toBe(true);
  });

  it("filtra coleção comprada pelo ID estável da Shopify", () => {
    expect(match("colecao_produto", "bought", "gid://shopify/Collection/100")).toBe(true);
    expect(match("colecao_produto", "not_bought", "gid://shopify/Collection/200")).toBe(true);
  });

  it("filtra período da categoria pela última compra válida daquela categoria", () => {
    expect(match("categoria_periodo", "last_days", { taxonomyValue: "brincos", days: 7 })).toBe(true);
    expect(match("categoria_periodo", "last_days", { taxonomyValue: "Brincos", days: 2 })).toBe(false);
    expect(match("categoria_periodo", "between_days", { taxonomyValue: "BRINCOS", min: 3, max: 7 })).toBe(true);
  });

  it("filtra período da coleção pelo ID estável", () => {
    expect(match("colecao_periodo", "last_days", { taxonomyValue: "gid://shopify/Collection/100", days: 15 })).toBe(true);
    expect(match("colecao_periodo", "last_days", { taxonomyValue: "gid://shopify/Collection/100", days: 10 })).toBe(false);
    expect(match("colecao_periodo", "older_than_days", { taxonomyValue: "gid://shopify/Collection/100", days: 10 })).toBe(true);
  });

  it("filtra quantidade e valor por categoria", () => {
    expect(match("categoria_quantidade", "gte", { taxonomyValue: "brincos", amount: 4 })).toBe(true);
    expect(match("categoria_quantidade", "gt", { taxonomyValue: "Brincos", amount: 4 })).toBe(false);
    expect(match("categoria_valor_gasto", "between", { taxonomyValue: "BRINCOS", min: 300, max: 350 })).toBe(true);
  });

  it("filtra quantidade e valor por coleção", () => {
    const collection = "gid://shopify/Collection/100";
    expect(match("colecao_quantidade", "eq", { taxonomyValue: collection, amount: 2 })).toBe(true);
    expect(match("colecao_valor_gasto", "gte", { taxonomyValue: collection, amount: 180 })).toBe(true);
    expect(match("colecao_valor_gasto", "gt", { taxonomyValue: collection, amount: 180 })).toBe(false);
  });

  it("filtra quantidade de pedidos dentro de uma janela", () => {
    expect(match("pedidos_periodo", "gte", { days: 30, amount: 2 })).toBe(true);
    expect(match("pedidos_periodo", "gte", { days: 7, amount: 2 })).toBe(false);
    expect(match("pedidos_periodo", "between", { days: 40, min: 2, max: 4 })).toBe(true);
  });

  it("filtra gasto dentro de uma janela", () => {
    expect(match("gasto_periodo", "gte", { days: 30, amount: 300 })).toBe(true);
    expect(match("gasto_periodo", "gt", { days: 7, amount: 100 })).toBe(false);
    expect(match("gasto_periodo", "between", { days: 40, min: 450, max: 550 })).toBe(true);
  });

  it("filtra comportamento de campanha WhatsApp por cliente", () => {
    expect(match("campanha_whatsapp", "sent", "camp-1")).toBe(true);
    expect(match("campanha_whatsapp", "delivered", "camp-1")).toBe(true);
    expect(match("campanha_whatsapp", "read", "camp-1")).toBe(true);
    expect(match("campanha_whatsapp", "failed", "camp-2")).toBe(true);
    expect(match("campanha_whatsapp", "not_sent", "camp-3")).toBe(true);
  });

  it("filtra entrada e conclusão de automação WhatsApp", () => {
    expect(match("automacao_whatsapp", "entered", "auto-1")).toBe(true);
    expect(match("automacao_whatsapp", "completed", "auto-1")).toBe(true);
    expect(match("automacao_whatsapp", "entered", "auto-2")).toBe(true);
    expect(match("automacao_whatsapp", "not_completed", "auto-2")).toBe(true);
    expect(match("automacao_whatsapp", "not_entered", "auto-3")).toBe(true);
  });

  it("combina frequência recente, valor e ausência de coleção com E", () => {
    const rules = {
      groups: [{ conditions: [
        { field: "pedidos_periodo", operator: "gte", value: { days: 30, amount: 2 } },
        { field: "gasto_periodo", operator: "gte", value: { days: 30, amount: 300 } },
        { field: "colecao_produto", operator: "not_bought", value: "gid://shopify/Collection/200" },
      ] }],
    };
    expect(matchesAdvancedSegmentRules(context, rules, NOW)).toBe(true);
  });

  it("combina categoria recente e coleção não comprada com E", () => {
    const rules = {
      groups: [{ conditions: [
        { field: "categoria_periodo", operator: "last_days", value: { taxonomyValue: "Brincos", days: 30 } },
        { field: "colecao_produto", operator: "not_bought", value: "gid://shopify/Collection/200" },
      ] }],
    };
    expect(matchesAdvancedSegmentRules(context, rules, NOW)).toBe(true);
  });

  it("combina produto, período e ausência de SKU com E", () => {
    const rules = {
      groups: [{ conditions: [
        { field: "produto", operator: "bought", value: "p-brinco" },
        { field: "produto_periodo", operator: "last_days", value: { productId: "p-brinco", days: 30 } },
        { field: "produto_sku", operator: "not_bought", value: { productId: "p-brinco", sku: "BR-LON-ROS" } },
      ] }],
    };
    expect(matchesAdvancedSegmentRules(context, rules, NOW)).toBe(true);
  });
});
