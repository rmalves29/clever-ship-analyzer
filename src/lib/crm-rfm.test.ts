import { describe, expect, it } from "vitest";
import {
  computeRFM,
  isRevenueValidOrder,
  makeScorer,
  scoreFrequency,
  scoreRecency,
  type ValidOrder,
} from "./crm-rfm-shared";

const NOW = new Date("2026-08-24T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function order(customerId: string, price: number, days: number, status = "PAID"): ValidOrder {
  return { customerId, totalPrice: price, processedAt: daysAgo(days), financialStatus: status };
}

describe("regra de receita válida", () => {
  it("aceita apenas pedidos pagos e não cancelados", () => {
    expect(isRevenueValidOrder({ financialStatus: "PAID" })).toBe(true);
    expect(isRevenueValidOrder({ financialStatus: "PARTIALLY_PAID" })).toBe(true);
    expect(isRevenueValidOrder({ financialStatus: "REFUNDED" })).toBe(false);
    expect(isRevenueValidOrder({ financialStatus: "EXPIRED" })).toBe(false);
    expect(isRevenueValidOrder({ financialStatus: "VOIDED" })).toBe(false);
    expect(isRevenueValidOrder({ financialStatus: "PAID", cancelledAt: daysAgo(1) })).toBe(false);
  });

  it("pedido reembolsado não entra em frequência nem monetário", () => {
    const { customers } = computeRFM(
      ["c1"],
      [order("c1", 100, 2), order("c1", 24_576.49, 3, "REFUNDED")],
      NOW,
    );
    expect(customers[0]!.frequency).toBe(1);
    expect(customers[0]!.monetary).toBe(100);
  });
});

describe("scores da matriz", () => {
  it("usa as faixas do ciclo real de recompra para recência", () => {
    expect([scoreRecency(0), scoreRecency(3), scoreRecency(4), scoreRecency(8)]).toEqual([5, 5, 4, 4]);
    expect([scoreRecency(9), scoreRecency(15), scoreRecency(16), scoreRecency(30)]).toEqual([3, 3, 2, 2]);
    expect(scoreRecency(31)).toBe(1);
    expect(scoreRecency(null)).toBe(0);
  });

  it("pontua frequência absoluta sem inflar clientes de uma compra", () => {
    expect([0, 1, 2, 3, 4, 5, 8].map(scoreFrequency)).toEqual([0, 1, 2, 3, 4, 5, 5]);
  });

  it("mantém empates monetários com a mesma nota", () => {
    const scorer = makeScorer([100, 100, 200, 500, 500], true);
    expect(scorer(100)).toBe(scorer(100));
    expect(scorer(500)).toBeGreaterThan(scorer(100));
  });
});

describe("matriz completa sem bloqueio por idade da base", () => {
  it("distribui clientes nos dez segmentos e mantém lead sem compra separado", () => {
    const orders: ValidOrder[] = [
      ...[1, 2, 3, 4, 5].map((day) => order("champion", 1_000, day)),
      ...[1, 4, 7].map((day) => order("loyal", 300, day)),
      ...[2, 6].map((day) => order("potential", 200, day)),
      order("new", 150, 2),
      order("attention", 120, 10),
      order("almost", 110, 20),
      ...[20, 24, 28].map((day) => order("risk", 180, day)),
      ...[20, 21, 22, 23, 24].map((day) => order("cant-lose", 900, day)),
      ...[35, 40].map((day) => order("hibernate", 250, day)),
      order("lost", 10, 40),
    ];
    const ids = [
      "champion",
      "loyal",
      "potential",
      "new",
      "attention",
      "almost",
      "risk",
      "cant-lose",
      "hibernate",
      "lost",
      "lead",
    ];
    const { customers, classicMode } = computeRFM(ids, orders, NOW);
    const segment = (id: string) => customers.find((customer) => customer.customerId === id)!.segment;

    expect(segment("champion")).toBe("Campeões");
    expect(segment("loyal")).toBe("Leais");
    expect(segment("potential")).toBe("Potencialmente Leais");
    expect(segment("new")).toBe("Novos");
    expect(segment("attention")).toBe("Precisa de atenção");
    expect(segment("almost")).toBe("Quase hibernando");
    expect(segment("risk")).toBe("Em risco");
    expect(segment("cant-lose")).toBe("Não pode perder");
    expect(segment("hibernate")).toBe("Hibernando");
    expect(segment("lost")).toBe("Perdidos");
    expect(segment("lead")).toBe("Sem compra");

    // O histórico ainda tem menos de 90 dias, mas nenhum segmento fica bloqueado.
    expect(classicMode).toBe(false);
  });
});
