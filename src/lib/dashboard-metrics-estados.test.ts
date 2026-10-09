import { describe, expect, it } from "vitest";
import {
  brazilDayNumber,
  buildCustomerAggregates,
  computeRegioesRecompra,
  computeTaxaRecompra,
  normalizeProvince,
} from "./dashboard-metrics";

const order = (o: Record<string, unknown>) =>
  ({ id: String(Math.random()), customer_id: "A", total_price: 100, financial_status: "PAID", cancelled_at: null, ...o }) as never;

describe("normalizeProvince", () => {
  it("junta sigla, nome completo e variações sem acento no mesmo estado", () => {
    expect(normalizeProvince("SP")).toBe("São Paulo");
    expect(normalizeProvince("São Paulo")).toBe("São Paulo");
    expect(normalizeProvince(" sao paulo ")).toBe("São Paulo");
    expect(normalizeProvince("mg")).toBe("Minas Gerais");
    expect(normalizeProvince("RJ")).toBe("Rio de Janeiro");
    expect(normalizeProvince("Distrito Federal")).toBe("Distrito Federal");
  });
  it("vazio vira null e desconhecido fica como veio", () => {
    expect(normalizeProvince("")).toBeNull();
    expect(normalizeProvince(undefined)).toBeNull();
    expect(normalizeProvince("Outro Lugar")).toBe("Outro Lugar");
  });
  it("clientes de SP e São Paulo caem no mesmo estado no gráfico de regiões", () => {
    const orders: ReturnType<typeof order>[] = [];
    for (let i = 0; i < 6; i++) {
      orders.push(order({ customer_id: `C${i}`, processed_at: "2026-10-01T15:00:00Z", province: i % 2 ? "SP" : "São Paulo" }));
    }
    const regioes = computeRegioesRecompra(buildCustomerAggregates(orders), 5);
    expect(regioes).toHaveLength(1);
    expect(regioes[0]).toMatchObject({ name: "São Paulo", clientes: 6 });
  });
});

describe("recompra por dias distintos", () => {
  it("2 pedidos na mesma live contam como recompra por pedidos, mas não por dias", () => {
    const customers = buildCustomerAggregates([
      order({ customer_id: "LIVE", processed_at: "2026-10-01T23:10:00Z" }),
      order({ customer_id: "LIVE", processed_at: "2026-10-01T23:40:00Z" }),
      order({ customer_id: "VOLTOU", processed_at: "2026-09-01T15:00:00Z" }),
      order({ customer_id: "VOLTOU", processed_at: "2026-10-05T15:00:00Z" }),
      order({ customer_id: "UNICO", processed_at: "2026-10-02T15:00:00Z" }),
    ]);
    const r = computeTaxaRecompra(customers);
    expect(r.baseClientes).toBe(3);
    expect(r.recomprasCount).toBe(2);
    expect(r.recomprasDiasDistintos).toBe(1);
    expect(r.taxaRecompraDiasDistintos).toBeCloseTo(33.33, 1);
  });
  it("o dia usa o horário de Brasília (23h do dia 1 e 01h do dia 2 em UTC são o mesmo dia local)", () => {
    expect(brazilDayNumber(Date.parse("2026-10-02T01:00:00Z"))).toBe(brazilDayNumber(Date.parse("2026-10-01T23:00:00Z")));
    expect(brazilDayNumber(Date.parse("2026-10-02T04:00:00Z"))).toBe(brazilDayNumber(Date.parse("2026-10-01T23:00:00Z")) + 1);
  });
});
