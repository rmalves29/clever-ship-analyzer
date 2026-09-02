import { describe, expect, it } from "vitest";
import { computeProductAbcCurve, type ProductAbcInput } from "./product-abc-curve-shared";

const row = (over: Partial<ProductAbcInput> & { key: string }): ProductAbcInput => ({
  productId: null,
  variantId: null,
  sku: null,
  nome: over.key,
  variacao: null,
  valorVendido: 0,
  quantidadeVendida: 0,
  ...over,
});

describe("computeProductAbcCurve", () => {
  it("classifica A/B/C por receita usando 80/95% acumulado", () => {
    const rows = [
      row({ key: "p1", valorVendido: 800, quantidadeVendida: 10 }),
      row({ key: "p2", valorVendido: 150, quantidadeVendida: 10 }),
      row({ key: "p3", valorVendido: 40, quantidadeVendida: 10 }),
      row({ key: "p4", valorVendido: 10, quantidadeVendida: 10 }),
    ];
    const result = computeProductAbcCurve(rows);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r]));
    expect(byKey["p1"]!.curvaReceita).toBe("A");
    expect(byKey["p2"]!.curvaReceita).toBe("B");
    expect(byKey["p3"]!.curvaReceita).toBe("C");
    expect(byKey["p4"]!.curvaReceita).toBe("C");
  });

  it("curva por itens vendidos usa ranking próprio, independente da receita", () => {
    const rows = [
      // Produto mais vendido em ITENS é o de menor receita — testa que as duas curvas divergem.
      row({ key: "caro-pouco-vendido", valorVendido: 900, quantidadeVendida: 5 }),
      row({ key: "barato-muito-vendido", valorVendido: 100, quantidadeVendida: 95 }),
    ];
    const result = computeProductAbcCurve(rows);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r]));
    expect(byKey["caro-pouco-vendido"]!.curvaReceita).toBe("A");
    expect(byKey["barato-muito-vendido"]!.curvaReceita).toBe("B");
    expect(byKey["barato-muito-vendido"]!.curvaItens).toBe("A");
    expect(byKey["caro-pouco-vendido"]!.curvaItens).toBe("C");
  });

  it("item isolado que domina o total ainda é classificado como A (olha o acumulado ANTES dele)", () => {
    const rows = [
      row({ key: "dominante", valorVendido: 999, quantidadeVendida: 1 }),
      row({ key: "resto", valorVendido: 1, quantidadeVendida: 1 }),
    ];
    const result = computeProductAbcCurve(rows);
    expect(result.find((r) => r.key === "dominante")!.curvaReceita).toBe("A");
  });

  it("ordena o resultado final por receita, do maior pro menor, mesmo se a entrada vier fora de ordem", () => {
    const rows = [
      row({ key: "baixo", valorVendido: 10, quantidadeVendida: 1 }),
      row({ key: "alto", valorVendido: 500, quantidadeVendida: 1 }),
      row({ key: "medio", valorVendido: 100, quantidadeVendida: 1 }),
    ];
    const result = computeProductAbcCurve(rows);
    expect(result.map((r) => r.key)).toEqual(["alto", "medio", "baixo"]);
  });

  it("lida com lista vazia sem quebrar", () => {
    expect(computeProductAbcCurve([])).toEqual([]);
  });
});
