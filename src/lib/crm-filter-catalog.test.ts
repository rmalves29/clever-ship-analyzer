import { describe, expect, it } from "vitest";
import {
  BRAZIL_STATES,
  CRM_FILTER_CATEGORIES,
  SUPPORTED_SEGMENT_FIELD_IDS,
  getCRMFilterField,
  validateCRMFilterCondition,
  validateSegmentRulesPayload,
} from "./crm-filter-catalog";
import { matchesSegmentCondition, type CRMCustomerContext } from "./crm-segmentation-shared";

const NOW = new Date("2026-08-24T15:00:00-03:00");

const buyer: CRMCustomerContext = {
  customer: {
    id: "c1",
    first_name: "Ana",
    city: "Belo Horizonte",
    province: "MG",
    tags: ["VIP"],
    tags_custom: ["Teste"],
    rfm_segment: "Nova compra",
  },
  metrics: {
    customerId: "c1",
    validOrderCount: 2,
    totalSpent: 300,
    averageTicket: 150,
    firstOrderAt: "2026-08-20T12:00:00-03:00",
    lastOrderAt: "2026-08-24T12:00:00-03:00",
    validOrderIds: new Set(["o1", "o2"]),
    rawFinancialStatuses: new Set(["PAID", "REFUNDED"]),
    validFinancialStatuses: new Set(["PAID"]),
    cancelledOrderCount: 1,
  },
  purchasedProducts: new Map([
    ["p-brinco", {
      productId: "p-brinco",
      title: "Brinco Londres",
      skus: new Set(["BR-LON"]),
      quantity: 1,
      orderIds: new Set(["o1"]),
      lastPurchasedAt: "2026-08-20T12:00:00-03:00",
    }],
  ]),
  abandonedCheckout: true,
  hadAbandonedCheckout: true,
  abandonedCheckoutRecovered: false,
  lastAbandonedCheckoutAt: "2026-08-24T13:00:00-03:00",
  shippedToday: true,
};

const lead: CRMCustomerContext = {
  customer: { id: "c2", city: "São Paulo", province: "SP" },
  metrics: {
    customerId: "c2",
    validOrderCount: 0,
    totalSpent: 0,
    averageTicket: 0,
    firstOrderAt: null,
    lastOrderAt: null,
    validOrderIds: new Set(),
    rawFinancialStatuses: new Set(),
    validFinancialStatuses: new Set(),
    cancelledOrderCount: 0,
  },
  purchasedProducts: new Map(),
  abandonedCheckout: false,
  hadAbandonedCheckout: false,
  abandonedCheckoutRecovered: false,
  lastAbandonedCheckoutAt: null,
  shippedToday: false,
};

const cases: Array<{ field: string; operator: string; value: unknown; context?: CRMCustomerContext }> = [
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
  { field: "customer_tag", operator: "contains", value: "VIP" },
  { field: "tags_custom", operator: "contains", value: "Teste" },
  { field: "rfm_segment", operator: "eq", value: "Nova compra" },
];

describe("catálogo confiável de filtros do CRM", () => {
  it("expõe somente os 19 filtros implementados no motor", () => {
    expect(SUPPORTED_SEGMENT_FIELD_IDS).toHaveLength(19);
    expect(new Set(SUPPORTED_SEGMENT_FIELD_IDS)).toEqual(new Set(cases.map((item) => item.field)));
  });

  it.each(cases)("$field possui implementação funcional", ({ field, operator, value, context }) => {
    expect(getCRMFilterField(field)).toBeDefined();
    expect(validateCRMFilterCondition({ field, operator, value })).toBeNull();
    expect(matchesSegmentCondition(context ?? buyer, { field, operator, value }, NOW)).toBe(true);
  });

  it("lista todas as UFs brasileiras sem duplicidade", () => {
    expect(BRAZIL_STATES).toHaveLength(27);
    expect(new Set(BRAZIL_STATES).size).toBe(27);
    expect(BRAZIL_STATES).toContain("MG");
    expect(BRAZIL_STATES).toContain("DF");
  });

  it("recorrência nova só aceita operador booleano no cadastro", () => {
    expect(validateCRMFilterCondition({ field: "recorrencia", operator: "eq", value: "sim" })).toBeNull();
    expect(validateCRMFilterCondition({ field: "recorrencia", operator: "gte", value: 2 })).toContain("Operador inválido");
  });

  it("produto só aceita Comprou/Não comprou e exige product_id", () => {
    expect(validateCRMFilterCondition({ field: "produto", operator: "bought", value: "p-brinco" })).toBeNull();
    expect(validateCRMFilterCondition({ field: "produto", operator: "not_bought", value: "p-colar" })).toBeNull();
    expect(validateCRMFilterCondition({ field: "produto", operator: "eq", value: "p-brinco" })).toContain("Operador inválido");
    expect(validateCRMFilterCondition({ field: "produto", operator: "bought", value: "" })).toContain("Selecione um produto");
  });

  it("aceita faixas numéricas válidas e rejeita faixas invertidas", () => {
    expect(validateCRMFilterCondition({ field: "total_gasto", operator: "between", value: { min: 100, max: 500 } })).toBeNull();
    expect(validateCRMFilterCondition({ field: "ticket_medio", operator: "between", value: { min: "100", max: "200" } })).toBeNull();
    expect(validateCRMFilterCondition({ field: "total_gasto", operator: "between", value: { min: 500, max: 100 } })).toContain("Faixa inválida");
  });

  it("aceita filtros relativos de data e rejeita intervalos inválidos", () => {
    expect(validateCRMFilterCondition({ field: "ultima_compra", operator: "older_than_days", value: 30 })).toBeNull();
    expect(validateCRMFilterCondition({ field: "ultima_compra", operator: "between_days", value: { min: 8, max: 30 } })).toBeNull();
    expect(validateCRMFilterCondition({ field: "ultima_compra", operator: "between_days", value: { min: 30, max: 8 } })).toContain("Intervalo de dias inválido");
  });

  it("aceita múltiplos segmentos RFM somente com valores conhecidos", () => {
    expect(validateCRMFilterCondition({ field: "rfm_segment", operator: "in", value: ["Nova compra", "VIP/Leal"] })).toBeNull();
    expect(validateCRMFilterCondition({ field: "rfm_segment", operator: "not_in", value: ["Nova compra"] })).toBeNull();
    expect(validateCRMFilterCondition({ field: "rfm_segment", operator: "in", value: [] })).toContain("pelo menos um");
    expect(validateCRMFilterCondition({ field: "rfm_segment", operator: "in", value: ["Segmento inexistente"] })).toContain("RFM inválido");
  });

  it("validação server-side rejeita campo, operador e valor inválidos", () => {
    const result = validateSegmentRulesPayload({
      groups: [{ conditions: [
        { field: "campo_inexistente", operator: "eq", value: "x" },
        { field: "total_pedidos", operator: "contains", value: 2 },
        { field: "status_pagamento", operator: "eq", value: "qualquer_coisa" },
      ] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it("validação server-side rejeita valor numérico vazio", () => {
    expect(validateCRMFilterCondition({ field: "total_pedidos", operator: "eq", value: "" })).toContain("Valor numérico inválido");
    expect(validateCRMFilterCondition({ field: "ultima_compra", operator: "last_days", value: "" })).toContain("Número de dias inválido");
  });

  it("validação server-side aceita regras corretas", () => {
    expect(validateSegmentRulesPayload({
      groups: [{ conditions: [
        { field: "estado", operator: "eq", value: "MG" },
        { field: "recorrencia", operator: "eq", value: "sim" },
        { field: "produto", operator: "bought", value: "p-brinco" },
        { field: "total_gasto", operator: "between", value: { min: 100, max: 500 } },
      ] }],
    })).toEqual({ valid: true, errors: [] });
  });

  it("não expõe filtros que ainda não possuem fonte de dados/implementação", () => {
    const hiddenUntilImplemented = [
      "regiao",
      "bairro",
      "aniversario_mes",
      "aniversario_dia",
      "idade",
      "signo",
      "order_tag",
      "recebeu_campanha",
      "clicou_campanha",
      "nao_recebeu",
      "entrou_fluxo",
      "concluiu_fluxo",
    ];
    hiddenUntilImplemented.forEach((field) => expect(SUPPORTED_SEGMENT_FIELD_IDS).not.toContain(field));
  });

  it("mantém o catálogo sem IDs duplicados", () => {
    const ids = CRM_FILTER_CATEGORIES.flatMap((category) => category.fields.map((field) => field.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
