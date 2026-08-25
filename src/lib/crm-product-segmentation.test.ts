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
  abandonedCheckout: false,
  hadAbandonedCheckout: false,
  abandonedCheckoutRecovered: false,
  lastAbandonedCheckoutAt: null,
  shippedToday: false,
};

const match = (field: string, operator: string, value: unknown) =>
  matchesAdvancedSegmentCondition(context, { field, operator, value }, NOW);

describe("filtros avançados por produto", () => {
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

  it("combina categoria comprada e coleção não comprada com E", () => {
    const rules = {
      groups: [{ conditions: [
        { field: "categoria_produto", operator: "bought", value: "Brincos" },
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
