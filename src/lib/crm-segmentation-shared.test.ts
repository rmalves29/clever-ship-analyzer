import { describe, expect, it } from "vitest";
import {
  buildCustomerContexts,
  matchesSegmentRules,
  type CRMCustomerForSegmentation,
  type CRMOrderForSegmentation,
} from "./crm-segmentation-shared";

const NOW = new Date("2026-08-24T15:00:00-03:00");
const isoDaysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const customers: CRMCustomerForSegmentation[] = [
  { id: "c1", first_name: "Ana", city: "Belo Horizonte", province: "MG", tags: ["VIP"], created_at: isoDaysAgo(10) },
  { id: "c2", first_name: "Bia", city: "São Paulo", province: "SP", created_at: isoDaysAgo(20) },
  { id: "c3", first_name: "Clara", city: "Curitiba", province: "PR", created_at: isoDaysAgo(40) },
  { id: "c4", first_name: "Dani", city: "Recife", province: "PE", created_at: isoDaysAgo(5) },
];

const orders: CRMOrderForSegmentation[] = [
  { id: "o1", customerId: "c1", totalPrice: 100, processedAt: isoDaysAgo(2), financialStatus: "PAID" },
  { id: "o2", customerId: "c1", totalPrice: 200, processedAt: isoDaysAgo(1), financialStatus: "PAID" },
  { id: "o3", customerId: "c2", totalPrice: 500, processedAt: isoDaysAgo(3), financialStatus: "REFUNDED" },
  { id: "o4", customerId: "c3", totalPrice: 80, processedAt: isoDaysAgo(20), financialStatus: "PAID", cancelledAt: isoDaysAgo(18) },
  { id: "o5", customerId: "c4", totalPrice: 150, processedAt: NOW.toISOString(), financialStatus: "PARTIALLY_PAID" },
];

function contexts() {
  return buildCustomerContexts({
    customers,
    orders,
    abandonedCheckoutAtByCustomer: new Map([
      ["c1", isoDaysAgo(3)],
      ["c2", isoDaysAgo(1)],
    ]),
    shippedTodayValidOrderIds: new Set(["o5"]),
  });
}

const ctx = (id: string) => contexts().find((item) => item.customer.id === id)!;
const rule = (field: string, operator: string, value: unknown) => ({ groups: [{ conditions: [{ field, operator, value }] }] });

describe("métricas de compra válidas no CRM", () => {
  it("conta somente PAID/PARTIALLY_PAID não cancelados", () => {
    expect(ctx("c1").metrics.validOrderCount).toBe(2);
    expect(ctx("c1").metrics.totalSpent).toBe(300);
    expect(ctx("c4").metrics.validOrderCount).toBe(1);
  });

  it("refund não vira compra nem receita", () => {
    expect(ctx("c2").metrics.validOrderCount).toBe(0);
    expect(ctx("c2").metrics.totalSpent).toBe(0);
  });

  it("pedido pago cancelado não vira compra e continua auditável como cancelado", () => {
    expect(ctx("c3").metrics.validOrderCount).toBe(0);
    expect(ctx("c3").metrics.cancelledOrderCount).toBe(1);
    expect(matchesSegmentRules(ctx("c3"), rule("status_pagamento", "eq", "cancelled"), NOW)).toBe(true);
  });
});

describe("filtros de comportamento", () => {
  it("total_pedidos respeita operadores numéricos", () => {
    expect(matchesSegmentRules(ctx("c1"), rule("total_pedidos", "gte", 2), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c4"), rule("total_pedidos", "gte", 2), NOW)).toBe(false);
  });

  it("total_gasto e ticket_medio usam somente receita válida", () => {
    expect(matchesSegmentRules(ctx("c1"), rule("total_gasto", "gt", 250), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c2"), rule("total_gasto", "gt", 1), NOW)).toBe(false);
    expect(matchesSegmentRules(ctx("c1"), rule("ticket_medio", "eq", 150), NOW)).toBe(true);
  });

  it("primeira compra identifica exatamente uma compra válida", () => {
    expect(matchesSegmentRules(ctx("c4"), rule("perfil", "eq", "primeira_compra"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c1"), rule("perfil", "eq", "primeira_compra"), NOW)).toBe(false);
  });

  it("recorrência é booleano e significa duas ou mais compras válidas", () => {
    expect(matchesSegmentRules(ctx("c1"), rule("recorrencia", "eq", "sim"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c4"), rule("recorrencia", "eq", "sim"), NOW)).toBe(false);
    expect(matchesSegmentRules(ctx("c4"), rule("recorrencia", "eq", "nao"), NOW)).toBe(true);
  });

  it("mantém leitura de regra numérica antiga de recorrência", () => {
    expect(matchesSegmentRules(ctx("c1"), rule("recorrencia", "gte", 2), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c4"), rule("recorrencia", "gte", 2), NOW)).toBe(false);
    expect(matchesSegmentRules(ctx("c1"), rule("recorrencia", "eq", "2"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c4"), rule("recorrencia", "eq", "2"), NOW)).toBe(false);
  });

  it("compra nas últimas 24h e pedido enviado hoje ignoram pedidos inválidos", () => {
    expect(matchesSegmentRules(ctx("c4"), rule("data_pedido_24h", "eq", "sim"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c4"), rule("data_envio_hoje", "eq", "sim"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c2"), rule("data_pedido_24h", "eq", "sim"), NOW)).toBe(false);
  });

  it("status pago exige pedido válido, mas refunded continua pesquisável", () => {
    expect(matchesSegmentRules(ctx("c3"), rule("status_pagamento", "eq", "paid"), NOW)).toBe(false);
    expect(matchesSegmentRules(ctx("c2"), rule("status_pagamento", "eq", "refunded"), NOW)).toBe(true);
  });

  it("Sem Compra Válida significa zero compras válidas, inclusive quando há checkout ativo", () => {
    expect(matchesSegmentRules(ctx("c3"), rule("acesso_sem_compra", "eq", "sim"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c2"), rule("acesso_sem_compra", "eq", "sim"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c1"), rule("acesso_sem_compra", "eq", "sim"), NOW)).toBe(false);
  });

  it("checkout abandonado ativo deixa de ser ativo quando existe compra válida posterior", () => {
    expect(ctx("c2").hadAbandonedCheckout).toBe(true);
    expect(ctx("c2").abandonedCheckout).toBe(true);
    expect(ctx("c2").abandonedCheckoutRecovered).toBe(false);

    expect(ctx("c1").hadAbandonedCheckout).toBe(true);
    expect(ctx("c1").abandonedCheckout).toBe(false);
    expect(ctx("c1").abandonedCheckoutRecovered).toBe(true);
    expect(matchesSegmentRules(ctx("c1"), rule("checkout_abandonado", "eq", "sim"), NOW)).toBe(false);
  });
});

describe("lógica dos grupos", () => {
  it("faz AND dentro do grupo", () => {
    const rules = { groups: [{ conditions: [
      { field: "estado", operator: "eq", value: "MG" },
      { field: "total_pedidos", operator: "gte", value: 2 },
    ] }] };
    expect(matchesSegmentRules(ctx("c1"), rules, NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c4"), rules, NOW)).toBe(false);
  });

  it("faz OR entre grupos", () => {
    const rules = { groups: [
      { conditions: [{ field: "estado", operator: "eq", value: "MG" }] },
      { conditions: [{ field: "estado", operator: "eq", value: "PE" }] },
    ] };
    expect(matchesSegmentRules(ctx("c1"), rules, NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c4"), rules, NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("c3"), rules, NOW)).toBe(false);
  });

  it("filtro desconhecido falha fechado em vez de incluir audiência errada", () => {
    expect(matchesSegmentRules(ctx("c1"), rule("campo_inexistente", "eq", "x"), NOW)).toBe(false);
  });
});
