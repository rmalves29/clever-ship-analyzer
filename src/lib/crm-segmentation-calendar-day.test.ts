import { describe, expect, it } from "vitest";
import {
  buildCustomerContexts,
  matchesSegmentRules,
  type CRMCustomerForSegmentation,
  type CRMOrderForSegmentation,
} from "./crm-segmentation-shared";

const NOW = new Date("2026-08-26T15:26:35-03:00");
const customers: CRMCustomerForSegmentation[] = [
  { id: "today", first_name: "Hoje" },
  { id: "yesterday", first_name: "Ontem" },
  { id: "invalid", first_name: "Pendente" },
];

const orders: CRMOrderForSegmentation[] = [
  {
    id: "today-paid",
    customerId: "today",
    totalPrice: 100,
    processedAt: "2026-08-26T00:05:00-03:00",
    financialStatus: "PAID",
  },
  {
    id: "yesterday-paid",
    customerId: "yesterday",
    totalPrice: 100,
    processedAt: "2026-08-25T20:00:00-03:00",
    financialStatus: "PAID",
  },
  {
    id: "today-pending",
    customerId: "invalid",
    totalPrice: 100,
    processedAt: "2026-08-26T14:00:00-03:00",
    financialStatus: "PENDING",
  },
];

const contexts = buildCustomerContexts({ customers, orders });
const ctx = (id: string) => contexts.find((item) => item.customer.id === id)!;
const rule = (field: string, operator: string, value: unknown) => ({
  groups: [{ conditions: [{ field, operator, value }] }],
});

describe("datas relativas dos segmentos usam o calendário de São Paulo", () => {
  it("ultima_compra nos últimos 0 dias significa hoje, não as últimas 24 horas", () => {
    expect(matchesSegmentRules(ctx("today"), rule("ultima_compra", "last_days", 0), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("yesterday"), rule("ultima_compra", "last_days", 0), NOW)).toBe(false);
  });

  it("mantém últimas 24h como filtro móvel separado", () => {
    expect(matchesSegmentRules(ctx("today"), rule("data_pedido_24h", "eq", "sim"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("yesterday"), rule("data_pedido_24h", "eq", "sim"), NOW)).toBe(true);
  });

  it("compra hoje considera somente pedidos de receita válidos", () => {
    expect(matchesSegmentRules(ctx("today"), rule("data_pedido_hoje", "eq", "sim"), NOW)).toBe(true);
    expect(matchesSegmentRules(ctx("invalid"), rule("data_pedido_hoje", "eq", "sim"), NOW)).toBe(false);
  });

  it("há mais de 0 dias passa a significar antes de hoje", () => {
    expect(matchesSegmentRules(ctx("today"), rule("ultima_compra", "older_than_days", 0), NOW)).toBe(false);
    expect(matchesSegmentRules(ctx("yesterday"), rule("ultima_compra", "older_than_days", 0), NOW)).toBe(true);
  });
});
