import { describe, expect, it } from "vitest";
import {
  BRAZIL_STATES,
  CRM_FILTER_CATEGORIES,
  SUPPORTED_SEGMENT_FIELD_IDS,
  getCRMFilterField,
  validateCRMFilterCondition,
  validateSegmentRulesPayload,
} from "./crm-filter-catalog";
import {
  matchesAdvancedSegmentCondition,
  type CRMAdvancedCustomerContext,
} from "./crm-product-segmentation";

const NOW = new Date("2026-08-24T15:00:00-03:00");

const buyer: CRMAdvancedCustomerContext = {
  customer: {
    id: "c1", first_name: "Ana", city: "Belo Horizonte", province: "MG",
    tags: ["VIP"], tags_custom: ["Teste"], rfm_segment: "Nova compra",
  },
  metrics: {
    customerId: "c1", validOrderCount: 2, totalSpent: 300, averageTicket: 150,
    firstOrderAt: "2026-08-20T12:00:00-03:00", lastOrderAt: "2026-08-24T12:00:00-03:00",
    validOrderIds: new Set(["o1", "o2"]), rawFinancialStatuses: new Set(["PAID", "REFUNDED"]),
    validFinancialStatuses: new Set(["PAID"]), cancelledOrderCount: 1,
  },
  purchasedProducts: new Map([["p-brinco", {
    productId: "p-brinco", title: "Brinco Londres", skus: new Set(["BR-LON"]),
    quantity: 1, orderIds: new Set(["o1"]), lastPurchasedAt: "2026-08-20T12:00:00-03:00",
  }]]),
  productSpentById: new Map([["p-brinco", 100]]),
  purchasedProductTypes: new Set(["Brincos"]),
  purchasedCollectionIds: new Set(["gid://shopify/Collection/100"]),
  abandonedCheckout: true,
  hadAbandonedCheckout: true,
  abandonedCheckoutRecovered: false,
  lastAbandonedCheckoutAt: "2026-08-24T13:00:00-03:00",
  shippedToday: true,
};

const lead: CRMAdvancedCustomerContext = {
  customer: { id: "c2", city: "São Paulo", province: "SP" },
  metrics: {
    customerId: "c2", validOrderCount: 0, totalSpent: 0, averageTicket: 0,
    firstOrderAt: null, lastOrderAt: null, validOrderIds: new Set(), rawFinancialStatuses: new Set(),
    validFinancialStatuses: new Set(), cancelledOrderCount: 0,
  },
  purchasedProducts: new Map(),
  productSpentById: new Map(),
  purchasedProductTypes: new Set(),
  purchasedCollectionIds: new Set(),
  abandonedCheckout: false,
  hadAbandonedCheckout: false,
  abandonedCheckoutRecovered: false,
  lastAbandonedCheckoutAt: null,
  shippedToday: false,
};

const cases: Array<{ field: string; operator: string; value: unknown; context?: CRMAdvancedCustomerContext }> = [
  { field: "cidade", operator: "eq", value: "Belo Horizonte" },
  { field: "estado", operator: "eq", value: "MG" },
  { field: "total_gasto", operator: "eq", value: 300 },
  { field: "total_pedidos", operator: "eq", value: 2 },
  { field: "ultima_compra", operator: "on", value: "2026-08-24" },
  { field: "primeira_compra", operator: "on", value: "2026-08-20" },
  { field: "ticket_medio", operator: "eq", value: 150 },
  { field: "recorrencia", operator: "eq", value: "sim" },
  { field: "status_pagamento", operator: "eq", value: "paid" },
  { field: "perfil", operator: "eq", value: "carrinho" },
  { field: "data_pedido_hoje", operator: "eq", value: "sim" },
  { field: "data_pedido_24h", operator: "eq", value: "sim" },
  { field: "data_envio_hoje", operator: "eq", value: "sim" },
  { field: "checkout_abandonado", operator: "eq", value: "sim" },
  { field: "acesso_sem_compra", operator: "eq", value: "sim", context: lead },
  { field: "produto", operator: "bought", value: "p-brinco" },
  { field: "categoria_produto", operator: "bought", value: "Brincos" },
  { field: "colecao_produto", operator: "bought", value: "gid://shopify/Collection/100" },
  { field: "produto_periodo", operator: "last_days", value: { productId: "p-brinco", days: 7 } },
  { field: "produto_quantidade", operator: "gte", value: { productId: "p-brinco", amount: 1 } },
  { field: "produto_valor_gasto", operator: "gte", value: { productId: "p-brinco", amount: 100 } },
  { field: "produto_sku", operator: "bought", value: { productId: "p-brinco", sku: "BR-LON" } },
  { field: "customer_tag", operator: "contains", value: "VIP" },
  { field: "tags_custom", operator: "contains", value: "Teste" },
  { field: "rfm_segment", operator: "eq", value: "Nova compra" },
];

describe("catálogo confiável de filtros do CRM", () => {
  it("expõe somente os 25 filtros implementados no motor", () => {
    expect(SUPPORTED_SEGMENT_FIELD_IDS).toHaveLength(25);
    expect(new Set(SUPPORTED_SEGMENT_FIELD_IDS)).toEqual(new Set(cases.map((item) => item.field)));
  });

  it.each(cases)("$field possui implementação funcional", ({ field, operator, value, context }) => {
    expect(getCRMFilterField(field)).toBeDefined();
    expect(validateCRMFilterCondition({ field, operator, value })).toBeNull();
    expect(matchesAdvancedSegmentCondition(context ?? buyer, { field, operator, value }, NOW)).toBe(true);
  });

  it("lista todas as UFs brasileiras sem duplicidade", () => {
    expect(BRAZIL_STATES).toHaveLength(27);
    expect(new Set(BRAZIL_STATES).size).toBe(27);
  });

  it("recorrência só aceita operador booleano", () => {
    expect(validateCRMFilterCondition({ field: "recorrencia", operator: "eq", value: "sim" })).toBeNull();
    expect(validateCRMFilterCondition({ field: "recorrencia", operator: "gte", value: 2 })).toContain("Operador inválido");
  });

  it("produto, categoria e coleção só aceitam Comprou/Não comprou", () => {
    expect(validateCRMFilterCondition({ field: "produto", operator: "bought", value: "p-brinco" })).toBeNull();
    expect(validateCRMFilterCondition({ field: "categoria_produto", operator: "not_bought", value: "Colares" })).toBeNull();
    expect(validateCRMFilterCondition({ field: "colecao_produto", operator: "bought", value: "gid://shopify/Collection/100" })).toBeNull();
    expect(validateCRMFilterCondition({ field: "categoria_produto", operator: "eq", value: "Brincos" })).toContain("Operador inválido");
    expect(validateCRMFilterCondition({ field: "colecao_produto", operator: "bought", value: "" })).toContain("Selecione um valor");
  });

  it("valida período, quantidade, valor e SKU do produto", () => {
    expect(validateCRMFilterCondition({ field: "produto_periodo", operator: "between_days", value: { productId: "p-brinco", min: 1, max: 30 } })).toBeNull();
    expect(validateCRMFilterCondition({ field: "produto_periodo", operator: "between_days", value: { productId: "p-brinco", min: 30, max: 1 } })).toContain("Intervalo de dias inválido");
    expect(validateCRMFilterCondition({ field: "produto_quantidade", operator: "gte", value: { productId: "p-brinco", amount: 2 } })).toBeNull();
    expect(validateCRMFilterCondition({ field: "produto_valor_gasto", operator: "between", value: { productId: "p-brinco", min: 50, max: 200 } })).toBeNull();
    expect(validateCRMFilterCondition({ field: "produto_sku", operator: "bought", value: { productId: "p-brinco", sku: "BR-LON" } })).toBeNull();
  });

  it("aceita faixas numéricas válidas e rejeita invertidas", () => {
    expect(validateCRMFilterCondition({ field: "total_gasto", operator: "between", value: { min: 100, max: 500 } })).toBeNull();
    expect(validateCRMFilterCondition({ field: "total_gasto", operator: "between", value: { min: 500, max: 100 } })).toContain("Faixa inválida");
  });

  it("aceita múltiplos segmentos RFM conhecidos", () => {
    expect(validateCRMFilterCondition({ field: "rfm_segment", operator: "in", value: ["Nova compra", "VIP/Leal"] })).toBeNull();
    expect(validateCRMFilterCondition({ field: "rfm_segment", operator: "in", value: [] })).toContain("pelo menos um");
  });

  it("validação server-side rejeita campo, operador e valor inválidos", () => {
    const result = validateSegmentRulesPayload({ groups: [{ conditions: [
      { field: "campo_inexistente", operator: "eq", value: "x" },
      { field: "total_pedidos", operator: "contains", value: 2 },
      { field: "status_pagamento", operator: "eq", value: "qualquer_coisa" },
    ] }] });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it("validação server-side aceita cross-sell por categoria e coleção", () => {
    expect(validateSegmentRulesPayload({ groups: [{ conditions: [
      { field: "categoria_produto", operator: "bought", value: "Brincos" },
      { field: "colecao_produto", operator: "not_bought", value: "gid://shopify/Collection/200" },
    ] }] })).toEqual({ valid: true, errors: [] });
  });

  it("não expõe filtros ainda sem fonte de dados", () => {
    ["regiao", "bairro", "aniversario_mes", "idade", "signo", "order_tag", "recebeu_campanha", "clicou_campanha", "entrou_fluxo"]
      .forEach((field) => expect(SUPPORTED_SEGMENT_FIELD_IDS).not.toContain(field));
  });

  it("mantém o catálogo sem IDs duplicados", () => {
    const ids = CRM_FILTER_CATEGORIES.flatMap((category) => category.fields.map((field) => field.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
