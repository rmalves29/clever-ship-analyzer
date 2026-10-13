import { describe, expect, it } from "vitest";
import {
  computeEquationSeries,
  computeEquationWindow,
  diagnoseEquation,
  groupOrdersByCustomer,
  median,
  type EquationOrder,
} from "./revenue-equation";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-12T12:00:00Z");
const daysAgo = (d: number) => NOW - d * DAY;
const o = (customerId: string, d: number, total: number): EquationOrder => ({ customerId, at: daysAgo(d), total });

describe("janela da equação", () => {
  it("separa base ativa, novos e reativados e fecha a identidade", () => {
    const orders: EquationOrder[] = [
      // a e b: compraram há 100 dias (base ativa) e a recomprou duas vezes na janela de 30 dias
      o("a", 100, 100),
      o("b", 100, 100),
      o("a", 10, 150),
      o("a", 5, 50),
      // c: compra antiga (>12 meses) e voltou -> reativada
      o("c", 500, 80),
      o("c", 3, 70),
      // d: nunca tinha comprado -> novo
      o("d", 2, 120),
      // e: base ativa que não voltou
      o("e", 200, 90),
    ];
    const byCustomer = groupOrdersByCustomer(orders);
    const w = computeEquationWindow(byCustomer, daysAgo(30), NOW + 1);
    expect(w.baseAtiva).toBe(3); // a, b, e
    expect(w.recompradores).toBe(1); // só a
    expect(w.taxa).toBeCloseTo(33.33, 1);
    expect(w.pedidosBase).toBe(2);
    expect(w.receitaBase).toBe(200);
    expect(w.receitaPorRecomprador).toBe(200);
    expect(w.ticketPedido).toBe(100);
    expect(w.clientesReativados).toBe(1);
    expect(w.receitaReativados).toBe(70);
    expect(w.clientesNovos).toBe(1);
    expect(w.receitaNovos).toBe(120);
    expect(w.receitaTotal).toBe(390);
    // base × taxa × receita por recomprador = receita da base
    expect(w.baseAtiva * (w.taxa / 100) * w.receitaPorRecomprador).toBeCloseTo(w.receitaBase, 6);
  });

  it("pedido depois do fim da janela não conta", () => {
    const byCustomer = groupOrdersByCustomer([o("a", 100, 10), { customerId: "a", at: NOW + 5 * DAY, total: 999 }]);
    const w = computeEquationWindow(byCustomer, daysAgo(30), NOW + 1);
    expect(w.receitaBase).toBe(0);
  });

  it("mediana", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

/** Loja sintética: 60 clientes novos por janela de 30 dias; 30% dos ativos recompram, gastando R$ 200. */
function syntheticOrders(windows: number, opts: { lastTaxa?: number; lastValor?: number } = {}): EquationOrder[] {
  const orders: EquationOrder[] = [];
  let id = 0;
  const known: string[] = [];
  for (let k = windows - 1; k >= 0; k--) {
    const centre = k * 30 + 15; // dias atrás
    const last = k === 0;
    for (let i = 0; i < 60; i++) {
      const c = `c${id++}`;
      orders.push(o(c, centre, 200));
      known.push(c);
    }
    // recompras de quem já era cliente antes desta janela
    const baseBefore = known.slice(0, known.length - 60);
    const taxa = last ? (opts.lastTaxa ?? 0.3) : 0.3;
    const valor = last ? (opts.lastValor ?? 200) : 200;
    const n = Math.floor(baseBefore.length * taxa);
    for (let i = 0; i < n; i++) orders.push(o(baseBefore[i]!, centre + (i % 5), valor));
  }
  return orders;
}

describe("leitura do gargalo", () => {
  it("apontar a taxa quando ela cai e o resto fica igual", () => {
    const series = computeEquationSeries(syntheticOrders(9, { lastTaxa: 0.1 }), 30, NOW);
    const d = diagnoseEquation(series, { meta: 300, regular: 200 });
    expect(d.status).toBe("gargalo");
    expect(d.factor).toBe("taxa");
    expect(d.texto).toContain("Se a taxa voltasse ao normal");
    expect(d.acoes.length).toBeGreaterThan(0);
  });

  it("apontar o valor da recompra quando ele cai", () => {
    const series = computeEquationSeries(syntheticOrders(9, { lastValor: 60 }), 30, NOW);
    const d = diagnoseEquation(series);
    expect(d.status).toBe("gargalo");
    expect(d.factor).toBe("valor");
  });

  it("sem queda em nenhum fator não inventa gargalo", () => {
    const series = computeEquationSeries(syntheticOrders(9), 30, NOW);
    const d = diagnoseEquation(series);
    expect(d.status).not.toBe("gargalo");
  });

  it("base pequena devolve sem-dados", () => {
    const series = computeEquationSeries([o("a", 5, 100), o("b", 4, 100)], 30, NOW);
    const d = diagnoseEquation(series);
    expect(d.status).toBe("sem-dados");
  });

  it("sem janelas de referência faz leitura estrutural e não afirma que está perto das melhores", () => {
    const orders: EquationOrder[] = [];
    for (let i = 0; i < 20; i++) orders.push(o(`b${i}`, 60, 100)); // base ativa
    orders.push(o("b0", 5, 100)); // 1 recompra
    for (let i = 0; i < 30; i++) orders.push(o(`n${i}`, 3, 100)); // novos
    const series = computeEquationSeries(orders, 30, NOW);
    const d = diagnoseEquation(series);
    expect(d.basis).toBe("estrutural");
    expect(d.status).toBe("gargalo");
    expect(d.factor).toBe("taxa");
    expect(d.texto).toContain("leitura estrutural");
    expect(d.texto).not.toContain("melhores janelas");
  });

  it("avisa quando o histórico é curto", () => {
    const series = computeEquationSeries(syntheticOrders(3), 30, NOW);
    const d = diagnoseEquation(series);
    expect(d.observacoes.join(" ")).toMatch(/Histórico ainda curto|Ainda não há janelas anteriores/);
  });
});
