import { describe, expect, it } from "vitest";
import { computeRFM, isRevenueValidOrder, makeScorer, type ValidOrder } from "./crm-rfm-shared";

const NOW = new Date("2026-08-24T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function order(customerId: string, price: number, days: number, status = "PAID"): ValidOrder {
  return { customerId, totalPrice: price, processedAt: daysAgo(days), financialStatus: status };
}

describe("regra de receita válida", () => {
  it("aceita apenas pedidos pagos", () => {
    expect(isRevenueValidOrder({ financialStatus: "PAID" })).toBe(true);
    expect(isRevenueValidOrder({ financialStatus: "PARTIALLY_PAID" })).toBe(true);
  });

  it("descarta reembolsado, expirado, anulado, cancelado e pendente", () => {
    for (const s of ["REFUNDED", "PARTIALLY_REFUNDED", "EXPIRED", "VOIDED", "CANCELLED", "PENDING", "AUTHORIZED"]) {
      expect(isRevenueValidOrder({ financialStatus: s })).toBe(false);
    }
    expect(isRevenueValidOrder({ financialStatus: "PAID", cancelledAt: daysAgo(1) })).toBe(false);
  });

  it("pedido reembolsado não entra em frequência nem monetário", () => {
    const { customers } = computeRFM(["c1"], [order("c1", 100, 2), order("c1", 24576.49, 3, "REFUNDED")], NOW);
    const c = customers[0]!;
    expect(c.frequency).toBe(1);
    expect(c.monetary).toBe(100);
  });

  it("pedido expirado não entra", () => {
    const { customers } = computeRFM(["c1"], [order("c1", 500, 4, "EXPIRED")], NOW);
    expect(customers[0]!.frequency).toBe(0);
    expect(customers[0]!.segment).toBe("Sem compra");
  });
});

describe("scores", () => {
  it("empates recebem o mesmo score", () => {
    const scorer = makeScorer([1, 1, 1, 2, 5, 5], true);
    expect(scorer(1)).toBe(scorer(1));
    expect(scorer(5)).toBe(scorer(5));
    expect(scorer(5)).toBeGreaterThan(scorer(1));
  });

  it("distribuição sem variância vira score neutro (sem quebrar)", () => {
    const scorer = makeScorer([2, 2, 2, 2], true);
    expect([scorer(2), scorer(2)]).toEqual([3, 3]);
  });

  it("empates em frequência não quebram a segmentação", () => {
    const orders = ["a", "b", "c", "d"].flatMap((id) => [order(id, 100, 3), order(id, 100, 5)]);
    const { customers } = computeRFM(["a", "b", "c", "d"], orders, NOW);
    expect(new Set(customers.map((c) => c.f)).size).toBe(1);
    expect(customers.every((c) => c.segment === "Recorrente")).toBe(true);
  });
});

describe("segmentação em base nova (<90 dias)", () => {
  it("cliente sem pedido válido => Sem compra", () => {
    const { customers } = computeRFM(["lead"], [], NOW);
    expect(customers[0]!.segment).toBe("Sem compra");
  });

  it("cliente com 1 compra recente não vira Hibernando/Perdido", () => {
    const { customers, classicMode } = computeRFM(["c1", "c2"], [order("c1", 200, 5), order("c2", 150, 6)], NOW);
    expect(classicMode).toBe(false);
    for (const c of customers) {
      expect(["Hibernando", "Perdidos", "Em Risco"]).not.toContain(c.segment);
      expect(c.segment).toBe("Nova compra");
    }
  });

  it("1 compra antiga (>30d) vira 2ª compra pendente", () => {
    const { customers } = computeRFM(["c1"], [order("c1", 200, 45)], NOW);
    expect(customers[0]!.segment).toBe("2ª compra pendente");
  });

  it("cliente multi-compra segmenta corretamente", () => {
    const orders: ValidOrder[] = [
      ...[1, 3, 6, 9].map((d) => order("vip", 3000, d)),
      ...[2, 8, 12].map((d) => order("form", 400, d)),
      ...[4, 10].map((d) => order("rec", 120, d)),
      order("novo", 90, 2),
    ];
    const { customers } = computeRFM(["vip", "form", "rec", "novo", "lead"], orders, NOW);
    const seg = (id: string) => customers.find((c) => c.customerId === id)!.segment;
    expect(seg("vip")).toBe("VIP/Leal");
    expect(seg("form")).toBe("VIP em formação");
    expect(seg("rec")).toBe("Recorrente");
    expect(seg("novo")).toBe("Nova compra");
    expect(seg("lead")).toBe("Sem compra");
  });
});

describe("modo clássico", () => {
  it("só habilita com >= 90 dias de histórico útil", () => {
    const { classicMode, customers } = computeRFM(
      ["antigo", "novo"],
      [order("antigo", 100, 400), order("novo", 100, 2)],
      NOW,
    );
    expect(classicMode).toBe(true);
    expect(customers.find((c) => c.customerId === "antigo")!.segment).not.toBe("Nova compra");
    expect(customers.find((c) => c.customerId === "novo")!.segment).toBe("Nova compra");
  });
});
