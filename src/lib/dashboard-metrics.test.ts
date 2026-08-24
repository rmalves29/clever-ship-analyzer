import { describe, expect, it } from "vitest";
import {
  buildCustomerAggregates,
  buildFirstFulfillmentByOrder,
  computeCohort,
  computeCommercialKpis,
  computeCurvaRecompra,
  computeFaixaTicket,
  computeFrequencyDistribution,
  computeGapsPrimeiraSegunda,
  computePedidosPorLanding,
  computeRegioesRecompra,
  computeRetencaoPorEstagio,
  computeTaxaRecompra,
  computeTempoEntreCompras,
  computeTempoMedioEnvio,
  computeTicketRecorrencia,
  filterValidOrders,
  isValidCommercialOrder,
} from "./dashboard-metrics";

const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();

const order = (over: Partial<Parameters<typeof isValidCommercialOrder>[0]> = {}) => ({
  id: "o1",
  customer_id: "c1",
  total_price: 100,
  processed_at: day(1),
  financial_status: "PAID",
  ...over,
});

describe("regra de pedido válido", () => {
  it("aceita PAID e PARTIALLY_PAID", () => {
    expect(isValidCommercialOrder(order())).toBe(true);
    expect(isValidCommercialOrder(order({ financial_status: "PARTIALLY_PAID" }))).toBe(true);
  });

  it("exclui reembolsado, expirado, cancelado, void e pendente", () => {
    for (const st of ["REFUNDED", "PARTIALLY_REFUNDED", "EXPIRED", "VOIDED", "PENDING", "UNPAID"]) {
      expect(isValidCommercialOrder(order({ financial_status: st }))).toBe(false);
    }
    expect(isValidCommercialOrder(order({ raw_data: { cancelledAt: day(2) } }))).toBe(false);
  });

  it("faturamento ignora pedidos inválidos", () => {
    const rows = [order(), order({ id: "o2", total_price: 900, financial_status: "REFUNDED" })];
    const kpis = computeCommercialKpis(filterValidOrders(rows));
    expect(kpis.faturamento).toBe(100);
    expect(kpis.numPedidos).toBe(1);
    expect(kpis.ticketMedio).toBe(100);
    expect(kpis.receitaPorCliente).toBe(100);
  });
});

describe("agregados por cliente", () => {
  const rows = [
    order({ id: "a1", customer_id: "A", processed_at: day(1), total_price: 100, province: "MG" }),
    order({ id: "a2", customer_id: "A", processed_at: day(20), total_price: 200, province: "MG" }),
    order({ id: "b1", customer_id: "B", processed_at: day(2), total_price: 50, province: "SP" }),
    order({ id: "x1", customer_id: "B", processed_at: day(3), total_price: 5000, financial_status: "EXPIRED", province: "SP" }),
  ];
  const customers = buildCustomerAggregates(rows);

  it("conta só pedidos válidos e ordena datas", () => {
    const a = customers.find((c) => c.customerId === "A")!;
    const b = customers.find((c) => c.customerId === "B")!;
    expect(a.count).toBe(2);
    expect(a.total).toBe(300);
    expect(b.count).toBe(1);
    expect(b.total).toBe(50);
  });

  it("taxa de recompra usa clientes com 2+ pedidos válidos", () => {
    expect(computeTaxaRecompra(customers)).toEqual({ taxaRecompra: 50, recomprasCount: 1, baseClientes: 2 });
  });

  it("frequência soma 100%", () => {
    const dist = computeFrequencyDistribution(customers);
    expect(dist.reduce((a, d) => a + d.value, 0)).toBeCloseTo(100, 1);
  });

  it("ticket por recorrência não gera delta contra faixa vazia", () => {
    const rows = computeTicketRecorrencia(customers);
    expect(rows.find((r) => r.label === "3x compras")!.delta).toBeNull();
  });

  it("retenção por estágio mede avanço, não perda", () => {
    const ret = computeRetencaoPorEstagio(customers);
    expect(ret[0]).toMatchObject({ name: "1ª → 2ª compra", value: 50, base: 2, avancaram: 1 });
  });
});

describe("faixas exclusivas", () => {
  it("faixa de ticket dos pedidos soma 100%", () => {
    const rows = filterValidOrders([
      order({ id: "1", total_price: 50 }),
      order({ id: "2", total_price: 150 }),
      order({ id: "3", total_price: 350 }),
      order({ id: "4", total_price: 900 }),
    ]);
    const faixas = computeFaixaTicket(rows);
    expect(faixas.reduce((a, f) => a + f.value, 0)).toBeCloseTo(100, 1);
    expect(faixas.every((f) => f.pedidos === 1)).toBe(true);
  });

  it("curva de recompra e tempo entre compras somam 100% e não são cumulativos", () => {
    const gaps = [3, 30, 70, 200];
    const curva = computeCurvaRecompra(gaps);
    expect(curva.reduce((a, c) => a + c.value, 0)).toBeCloseTo(100, 1);
    expect(curva.every((c) => c.clientes === 1)).toBe(true);
    const tempo = computeTempoEntreCompras(gaps);
    expect(tempo.reduce((a, t) => a + t.value, 0)).toBeCloseTo(100, 1);
  });

  it("gaps só consideram clientes com 2ª compra válida", () => {
    const customers = buildCustomerAggregates([
      order({ id: "a1", customer_id: "A", processed_at: day(1) }),
      order({ id: "a2", customer_id: "A", processed_at: day(11) }),
      order({ id: "b1", customer_id: "B", processed_at: day(1) }),
    ]);
    expect(computeGapsPrimeiraSegunda(customers)).toEqual([10]);
  });
});

describe("regiões", () => {
  it("usa denominador estadual e respeita amostra mínima", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) =>
        order({ id: `mg${i}`, customer_id: `MG${i}`, province: "MG", processed_at: day(1) }),
      ),
      order({ id: "mg0b", customer_id: "MG0", province: "MG", processed_at: day(10) }),
      order({ id: "sp0", customer_id: "SP0", province: "SP" }),
    ];
    const regioes = computeRegioesRecompra(buildCustomerAggregates(rows), 5);
    expect(regioes).toEqual([{ name: "MG", value: 20, clientes: 5, recompraram: 1 }]);
  });
});

describe("operação de envio", () => {
  it("usa o primeiro fulfillment e descarta tempos negativos", () => {
    const processed = new Map<string, string | null>([
      ["o1", day(1)],
      ["o2", day(10)],
    ]);
    const first = buildFirstFulfillmentByOrder(
      [
        { order_id: "o1", created_at: day(4) },
        { order_id: "o1", created_at: day(2) },
        { order_id: "o2", created_at: day(5) }, // envio antes do pagamento -> descartado
      ],
      processed,
    );
    expect(first.get("o1")!.at).toBe(new Date(day(2)).getTime());
    const { amostra, tempoMedioEnvioDias } = computeTempoMedioEnvio(first);
    expect(amostra).toBe(1);
    expect(tempoMedioEnvioDias).toBeCloseTo(1, 5);
  });
});

describe("coorte e landing", () => {
  it("mês sem coorte retorna null em vez de 0%", () => {
    const months = [
      { start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 0, 31), label: "jan" },
      { start: Date.UTC(2026, 1, 1), end: Date.UTC(2026, 1, 28), label: "fev" },
    ];
    const customers = buildCustomerAggregates([order({ customer_id: "A", processed_at: day(5) })]);
    const cohort = computeCohort(customers, months);
    expect(cohort[0]).toMatchObject({ month: "jan", size: 1 });
    expect(cohort[0]!.retention).toEqual([100, 0]);
    expect(cohort[1]).toMatchObject({ month: "fev", size: 0 });
    expect(cohort[1]!.retention).toEqual([null, null]);
  });

  it("agrupa pedidos por caminho da página de entrada", () => {
    const rows = filterValidOrders([
      order({ id: "1", landing_site: "https://loja.com/products/x?utm=1" }),
      order({ id: "2", landing_site: "/products/x?utm=1" }),
      order({ id: "3", landing_site: "https://loja.com/" }),
      order({ id: "4", landing_site: null, financial_status: "PAID" }),
    ]);
    expect(computePedidosPorLanding(rows)).toEqual([
      { page: "/products/x?utm=1", count: 2 },
      { page: "/", count: 1 },
    ]);
  });
});
