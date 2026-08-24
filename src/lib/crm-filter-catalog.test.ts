import { describe, expect, it } from "vitest";
import { CRM_FILTER_CATEGORIES, SUPPORTED_SEGMENT_FIELD_IDS, getCRMFilterField } from "./crm-filter-catalog";
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
  },
  abandonedCheckout: true,
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
  },
  abandonedCheckout: false,
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
  { field: "recorrencia", operator: "gte", value: 2 },
  { field: "status_pagamento", operator: "eq", value: "paid" },
  { field: "perfil", operator: "eq", value: "carrinho" },
  { field: "data_pedido_hoje", operator: "eq", value: "sim" },
  { field: "data_pedido_24h", operator: "eq", value: "sim" },
  { field: "data_envio_hoje", operator: "eq", value: "sim" },
  { field: "checkout_abandonado", operator: "eq", value: "sim" },
  { field: "acesso_sem_compra", operator: "eq", value: "sim", context: lead },
  { field: "customer_tag", operator: "contains", value: "VIP" },
  { field: "tags_custom", operator: "contains", value: "Teste" },
  { field: "rfm_segment", operator: "eq", value: "Nova compra" },
];

describe("catálogo confiável de filtros do CRM", () => {
  it("expõe somente os 18 filtros implementados no motor", () => {
    expect(SUPPORTED_SEGMENT_FIELD_IDS).toHaveLength(18);
    expect(new Set(SUPPORTED_SEGMENT_FIELD_IDS)).toEqual(new Set(cases.map((item) => item.field)));
  });

  it.each(cases)("$field possui implementação funcional", ({ field, operator, value, context }) => {
    expect(getCRMFilterField(field)).toBeDefined();
    expect(matchesSegmentCondition(context ?? buyer, { field, operator, value }, NOW)).toBe(true);
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
