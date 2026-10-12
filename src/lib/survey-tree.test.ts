import { describe, expect, it } from "vitest";
import {
  FIM,
  buildEdges,
  buildTagDictionary,
  buildTreeLayout,
  collectTags,
  isBranching,
  missingRequired,
  nextQuestionId,
  normalizeTag,
  parseTags,
  pruneDanglingRefs,
  resolvePath,
  type TreeQuestion,
} from "./survey-tree";

const q = (id: string, extra: Partial<TreeQuestion> = {}): TreeQuestion => ({ id, type: "texto_curto", label: `Pergunta ${id}`, required: false, ...extra });

// Pós-compra enxuta: 1 (para quem?) -> evento: 1E / presente: 1P / eu: 2 -> fim
const tree: TreeQuestion[] = [
  q("1", {
    type: "escolha_unica",
    options: ["Pra mim", "Festa", "Presente"],
    branches: {
      "Pra mim": { next: "2", tags: ["uso_proprio"] },
      Festa: { next: "1e", tags: ["ocasiao_evento"] },
      Presente: { next: "1p", tags: ["comprou_presente"] },
    },
  }),
  q("1e", { type: "sim_nao", branches: { Sim: { next: "2", tags: ["evento_7d"] } } }),
  q("1p", { type: "escolha_unica", options: ["Mãe", "Amiga"], next: "2", branches: { Mãe: { tags: ["presente_mae"] } } }),
  q("2", { type: "texto_curto", next: FIM, tags: ["respondeu"] }),
  q("orfa"),
];

describe("pesquisa em árvore", () => {
  it("pesquisa antiga (sem destino nem etiqueta) segue a ordem e não é árvore", () => {
    const flat = [q("a"), q("b"), q("c")];
    expect(isBranching(flat)).toBe(false);
    expect(nextQuestionId(flat, flat[0]!, "x")).toBe("b");
    expect(nextQuestionId(flat, flat[2]!, "x")).toBe(FIM);
    expect(resolvePath(flat, { a: "1", b: "2", c: "3" }).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("detecta árvore pelas etiquetas, destinos ou pergunta do tipo mensagem", () => {
    expect(isBranching(tree)).toBe(true);
    expect(isBranching([q("a", { tags: ["x"] })])).toBe(true);
    expect(isBranching([q("a", { type: "mensagem" })])).toBe(true);
  });

  it("cada resposta leva ao seu destino; sem destino próprio usa o padrão da pergunta", () => {
    expect(nextQuestionId(tree, tree[0]!, "Festa")).toBe("1e");
    expect(nextQuestionId(tree, tree[0]!, "Presente")).toBe("1p");
    expect(nextQuestionId(tree, tree[2]!, "Amiga")).toBe("2"); // sem destino próprio -> next padrão
    expect(nextQuestionId(tree, tree[3]!, "qualquer")).toBe(FIM);
    // "Não" na pergunta 1e não tem destino próprio nem next: segue a ordem da lista (1p)
    expect(nextQuestionId(tree, tree[1]!, "Não")).toBe("1p");
  });

  it("destino apagado cai na ordem normal", () => {
    const broken = [q("a", { next: "sumiu" }), q("b")];
    expect(nextQuestionId(broken, broken[0]!, "x")).toBe("b");
  });

  it("percorre só o caminho das respostas e junta as etiquetas dele", () => {
    const answers = { "1": "Festa", "1e": "Sim", "2": "ok" };
    expect(resolvePath(tree, answers).map((p) => p.id)).toEqual(["1", "1e", "2"]);
    expect(collectTags(tree, answers).sort()).toEqual(["evento_7d", "ocasiao_evento", "respondeu"].sort());
    // resposta de pergunta fora do caminho é ignorada
    expect(collectTags(tree, { ...answers, "1p": "Mãe" })).not.toContain("presente_mae");
  });

  it("para na primeira pergunta sem resposta", () => {
    expect(resolvePath(tree, { "1": "Presente" }).map((p) => p.id)).toEqual(["1", "1p"]);
  });

  it("exige só as obrigatórias do caminho", () => {
    const qs = [q("a", { type: "sim_nao", required: true, branches: { Sim: { next: "c" } } }), q("b", { required: true }), q("c")];
    expect(missingRequired(qs, { a: "Sim" })).toEqual([]); // b está fora do caminho
    expect(missingRequired(qs, { a: "Não" }).map((x) => x.id)).toEqual(["b"]);
    expect(missingRequired(qs, {}).map((x) => x.id)).toEqual(["a"]);
  });

  it("não entra em laço infinito", () => {
    const loop = [q("a", { next: "b" }), q("b", { next: "a" })];
    expect(resolvePath(loop, { a: "x", b: "y" }).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("monta as arestas (uma por opção) e as colunas por profundidade", () => {
    const edges = buildEdges(tree);
    expect(edges.filter((e) => e.from === "1")).toHaveLength(3);
    expect(edges.find((e) => e.from === "1" && e.label === "Festa")).toMatchObject({ to: "1e", tags: ["ocasiao_evento"], explicit: true });
    const layout = buildTreeLayout(tree);
    expect(layout.columns[0]).toEqual(["1"]);
    expect(layout.columns[1]).toEqual(expect.arrayContaining(["2", "1e", "1p"]));
    expect(layout.unreachable).toEqual(["orfa"]);
    expect(layout.hasEnd).toBe(true);
  });

  it("dicionário de etiquetas e normalização", () => {
    const dict = buildTagDictionary(tree);
    expect(dict.find((r) => r.tag === "evento_7d")).toMatchObject({ questionId: "1e", position: 2 });
    expect(dict.find((r) => r.tag === "respondeu")?.when).toBe("Pergunta 2");
    expect(normalizeTag("Evento 7d ")).toBe("evento_7d");
    expect(normalizeTag("Sensível à Oferta!")).toBe("sensivel_a_oferta");
    expect(parseTags("uso_proprio, Evento 7d; uso_proprio")).toEqual(["uso_proprio", "evento_7d"]);
  });

  it("apagar uma pergunta limpa os destinos que apontavam para ela", () => {
    const without1e = tree.filter((x) => x.id !== "1e");
    const cleaned = pruneDanglingRefs(without1e);
    expect(cleaned[0]!.branches?.["Festa"]?.next).toBeNull();
    expect(cleaned[0]!.branches?.["Pra mim"]?.next).toBe("2");
  });
});
