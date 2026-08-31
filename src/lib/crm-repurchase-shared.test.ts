import { describe, expect, it } from "vitest";
import {
  buildRepurchaseCohorts,
  buildRepurchaseJourney,
  isAuditableAttribution,
  repurchaseWindow,
  summarizeRepurchase,
  type RepurchaseOrder,
} from "./crm-repurchase-shared";

const NOW = new Date("2026-08-24T12:00:00.000Z");

function order(
  id: string,
  customerId: string,
  processedAt: string,
  totalPrice = 100,
  financialStatus = "PAID",
): RepurchaseOrder {
  return { id, customerId, processedAt, totalPrice, financialStatus };
}

describe("repurchaseWindow", () => {
  it("classifica corretamente os limites das janelas", () => {
    expect(repurchaseWindow(0)).toBe("0–7 dias");
    expect(repurchaseWindow(7)).toBe("0–7 dias");
    expect(repurchaseWindow(8)).toBe("8–15 dias");
    expect(repurchaseWindow(15)).toBe("8–15 dias");
    expect(repurchaseWindow(16)).toBe("16–30 dias");
    expect(repurchaseWindow(30)).toBe("16–30 dias");
    expect(repurchaseWindow(31)).toBe("31–60 dias");
    expect(repurchaseWindow(60)).toBe("31–60 dias");
    expect(repurchaseWindow(61)).toBe("61–90 dias");
    expect(repurchaseWindow(90)).toBe("61–90 dias");
    expect(repurchaseWindow(91)).toBe("90+ dias");
  });
});

describe("buildRepurchaseJourney", () => {
  it("cliente com exatamente uma compra válida entra como pendente", () => {
    const rows = buildRepurchaseJourney([order("o1", "c1", "2026-08-20T12:00:00Z")], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customerId: "c1", converted: false, stage: "0–7 dias" });
  });

  it("cliente com segunda compra válida sai da audiência pendente e vira convertido", () => {
    const rows = buildRepurchaseJourney([
      order("o1", "c1", "2026-08-01T12:00:00Z", 100),
      order("o2", "c1", "2026-08-10T12:00:00Z", 80),
    ], NOW);
    expect(rows[0]).toMatchObject({ converted: true, stage: "Convertido", secondOrderId: "o2", secondOrderRevenue: 80, daysToSecondOrder: 9 });
  });

  it("REFUNDED não conta para frequência nem conversão", () => {
    const rows = buildRepurchaseJourney([
      order("o1", "c1", "2026-08-01T12:00:00Z", 100),
      order("o2", "c1", "2026-08-10T12:00:00Z", 80, "REFUNDED"),
    ], NOW);
    expect(rows[0]?.converted).toBe(false);
  });

  it("EXPIRED não conta para frequência nem conversão", () => {
    const rows = buildRepurchaseJourney([
      order("o1", "c1", "2026-08-01T12:00:00Z", 100),
      order("o2", "c1", "2026-08-10T12:00:00Z", 80, "EXPIRED"),
    ], NOW);
    expect(rows[0]?.converted).toBe(false);
  });

  it("CANCELLED não conta para frequência nem conversão", () => {
    const rows = buildRepurchaseJourney([
      order("o1", "c1", "2026-08-01T12:00:00Z", 100),
      order("o2", "c1", "2026-08-10T12:00:00Z", 80, "CANCELLED"),
    ], NOW);
    expect(rows[0]?.converted).toBe(false);
  });

  it("pedido com cancelledAt preenchido não conta mesmo se PAID", () => {
    const cancelled = { ...order("o2", "c1", "2026-08-10T12:00:00Z", 80), cancelledAt: "2026-08-11T00:00:00Z" };
    const rows = buildRepurchaseJourney([order("o1", "c1", "2026-08-01T12:00:00Z"), cancelled], NOW);
    expect(rows[0]?.converted).toBe(false);
  });

  it("não duplica conversão quando o mesmo order id aparece duas vezes", () => {
    const duplicate = order("o1", "c1", "2026-08-01T12:00:00Z", 100);
    const rows = buildRepurchaseJourney([duplicate, { ...duplicate }], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.converted).toBe(false);
  });

  it("simula sync Shopify: ao chegar a segunda compra o cliente muda para convertido", () => {
    const firstSync = [order("o1", "c1", "2026-08-01T12:00:00Z")];
    expect(buildRepurchaseJourney(firstSync, NOW)[0]?.converted).toBe(false);
    const secondSync = [...firstSync, order("o2", "c1", "2026-08-24T11:00:00Z")];
    expect(buildRepurchaseJourney(secondSync, NOW)[0]?.converted).toBe(true);
  });

  it("preserva o canal/origem da primeira e segunda compra", () => {
    const rows = buildRepurchaseJourney([
      { ...order("o1", "c1", "2026-08-01T12:00:00Z"), sourceName: "web" },
      { ...order("o2", "c1", "2026-08-05T12:00:00Z"), sourceName: "pos" },
    ], NOW);
    expect(rows[0]?.firstOrderSourceName).toBe("web");
    expect(rows[0]?.secondOrderSourceName).toBe("pos");
  });
});

describe("summarizeRepurchase", () => {
  it("calcula receita, ticket e taxa de conversão sem incluir pedidos inválidos", () => {
    const journey = buildRepurchaseJourney([
      order("a1", "a", "2026-08-01T12:00:00Z", 100),
      order("a2", "a", "2026-08-05T12:00:00Z", 50),
      order("b1", "b", "2026-08-20T12:00:00Z", 200),
      order("b2", "b", "2026-08-22T12:00:00Z", 999, "REFUNDED"),
    ], NOW);
    const summary = summarizeRepurchase(journey, 0.75);
    expect(summary.buyers).toBe(2);
    expect(summary.converted).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.conversionRate).toBe(0.5);
    expect(summary.firstRevenue).toBe(300);
    expect(summary.firstAverageTicket).toBe(150);
    expect(summary.secondRevenue).toBe(50);
    expect(summary.secondAverageTicket).toBe(50);
    expect(summary.gapToTarget).toBeCloseTo(0.25);
  });

  it("calcula a taxa madura apenas com clientes que completaram a janela", () => {
    const journey = buildRepurchaseJourney([
      order("a1", "a", "2026-07-01T12:00:00Z"),
      order("a2", "a", "2026-07-20T12:00:00Z"),
      order("b1", "b", "2026-07-05T12:00:00Z"),
      order("b2", "b", "2026-08-10T12:00:00Z"),
      order("c1", "c", "2026-08-20T12:00:00Z"),
    ], NOW);
    const summary = summarizeRepurchase(journey, 0.75, 30, NOW);

    expect(summary.buyers).toBe(3);
    expect(summary.converted).toBe(2);
    expect(summary.matureEligible).toBe(2);
    expect(summary.matureConverted).toBe(1);
    expect(summary.matureConversionRate).toBe(0.5);
    expect(summary.customersMissingToTarget).toBe(1);
  });
});

describe("buildRepurchaseCohorts", () => {
  it("agrupa pela data da primeira compra", () => {
    const journey = buildRepurchaseJourney([
      order("a1", "a", "2026-07-01T12:00:00Z"),
      order("a2", "a", "2026-08-01T12:00:00Z"),
      order("b1", "b", "2026-08-03T12:00:00Z"),
    ], NOW);
    const cohorts = buildRepurchaseCohorts(journey);
    expect(cohorts.map((c) => c.month)).toEqual(["2026-08", "2026-07"]);
    expect(cohorts.find((c) => c.month === "2026-07")?.converted).toBe(1);
  });

  it("marca coortes recentes como aguardando e não exibe taxa prematura", () => {
    const journey = buildRepurchaseJourney([
      order("a1", "a", "2026-07-01T12:00:00Z"),
      order("a2", "a", "2026-07-10T12:00:00Z"),
      order("b1", "b", "2026-08-20T12:00:00Z"),
    ], NOW);
    const cohorts = buildRepurchaseCohorts(journey, 30, NOW);

    expect(cohorts.find((cohort) => cohort.month === "2026-07")).toMatchObject({
      maturityStatus: "completa",
      matureCustomers: 1,
      matureConverted: 1,
      matureConversionRate: 1,
    });
    expect(cohorts.find((cohort) => cohort.month === "2026-08")).toMatchObject({
      maturityStatus: "aguardando",
      matureCustomers: 0,
      matureConverted: 0,
      matureConversionRate: null,
    });
  });
});

describe("atribuição auditável", () => {
  it("aceita atribuição com evidência rastreável e ordem temporal válida", () => {
    expect(isAuditableAttribution({
      campaignId: "camp-1",
      customerId: "c1",
      stage: "16–30 dias",
      sentAt: "2026-08-20T10:00:00Z",
      convertedAt: "2026-08-21T10:00:00Z",
      orderId: "o2",
      revenue: 129.9,
      conversionWindowDays: 7,
      attributionEvidence: "tracked_link",
      attributionReference: "click-123",
    })).toBe(true);
  });

  it("rejeita atribuição sem referência de evidência", () => {
    expect(isAuditableAttribution({
      campaignId: "camp-1",
      customerId: "c1",
      stage: "16–30 dias",
      sentAt: "2026-08-20T10:00:00Z",
      convertedAt: "2026-08-21T10:00:00Z",
      orderId: "o2",
      revenue: 129.9,
      conversionWindowDays: 7,
      attributionEvidence: "tracked_link",
      attributionReference: "",
    })).toBe(false);
  });
});
