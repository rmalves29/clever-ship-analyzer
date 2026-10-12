import { describe, expect, it } from "vitest";
import { convertTree, parseTreesJson, type ImportTree } from "./survey-tree-import";
import { FIM, buildTagDictionary, buildTreeLayout, collectTags, fillPlaceholders, findPendingPlaceholders, isBranching, resolvePath } from "./survey-tree";

const tree: ImportTree = {
  id: "P9",
  nome: "Teste",
  quando: "D+1",
  objetivo: "Saber por que comprou.",
  regras: ["Sem lembrete."],
  nos: [
    {
      id: "P9-0",
      titulo: "Convite",
      tipo: "botoes",
      msg: "Oi, {nome}! Posso te fazer 3 perguntinhas?",
      opcoes: [
        { r: "Pode perguntar", prox: "P9-1", tags: [] },
        { r: "Agora não", prox: "P9-FR", tags: ["pesquisa_recusou_p9"] },
      ],
    },
    {
      id: "P9-1",
      tipo: "lista",
      msg: "Qual o motivo?",
      opcoes: [
        { r: "Me apaixonei pela peça", prox: "P9-T", tags: ["Motivo Peça"], acao: "Avisar a expedição" },
        { r: "Cupom de desconto", prox: "P9-X", tags: ["motivo_cupom"] },
      ],
    },
    { id: "P9-T", tipo: "texto", msg: "Conta mais?", prox: "P9-H", tags: ["respondeu_aberta"] },
    { id: "P9-H", tipo: "acao", msg: "Passei para a equipe. Retorno em [prazo de resposta].", prox: "P9-F", tags: ["atendimento_aberto"], acao: "Abrir atendimento" },
    { id: "P9-F", tipo: "fim", msg: "Obrigada, {nome}!", tags: ["respondeu_p9"] },
    { id: "P9-FR", tipo: "fim", msg: "Tudo bem!" },
  ],
};

describe("importação de árvores", () => {
  const out = convertTree(tree);

  it("nós viram perguntas; respostas ganham destino, etiquetas e ação", () => {
    expect(out.questions.map((q) => `${q.id}:${q.type}`)).toEqual(["P9-0:escolha_unica", "P9-1:escolha_unica", "P9-T:texto_curto", "P9-H:mensagem", "P9-F:mensagem", "P9-FR:mensagem"]);
    const q1 = out.questions[1]!;
    expect(q1.branches!["Me apaixonei pela peça"]).toEqual({ next: "P9-T", tags: ["motivo_peca"], action: "Avisar a expedição" });
    expect(out.questions[4]!.next).toBe(FIM); // fim encerra
    expect(out.questions[3]!.action).toBe("Abrir atendimento");
    expect(out.slug).toBe("pesquisa-teste");
    expect(out.description).toContain("Objetivo: Saber por que comprou.");
    expect(out.thankYou).toBe("Obrigada, {nome}!");
  });

  it("avisa de referência quebrada, texto longo para o WhatsApp e pendência da loja", () => {
    const codes = out.warnings.map((w) => w.code);
    expect(codes).toContain("ref_inexistente"); // P9-X não existe
    expect(codes).toContain("pendente_loja"); // [prazo de resposta]
    const long = convertTree({ ...tree, nos: [{ id: "a", tipo: "botoes", msg: "x", opcoes: [{ r: "Um botão com nome muito comprido", prox: null }] }] });
    expect(long.warnings.map((w) => w.code)).toContain("titulo_longo");
  });

  it("a pesquisa convertida funciona como árvore: caminho, etiquetas e layout", () => {
    expect(isBranching(out.questions)).toBe(true);
    const answers = { "P9-0": "Pode perguntar", "P9-1": "Me apaixonei pela peça", "P9-T": "porque amei" };
    expect(resolvePath(out.questions, answers).map((q) => q.id)).toEqual(["P9-0", "P9-1", "P9-T", "P9-H", "P9-F"]);
    expect(collectTags(out.questions, answers).sort()).toEqual(["atendimento_aberto", "motivo_peca", "respondeu_aberta", "respondeu_p9"]);
    const refuse = { "P9-0": "Agora não" };
    expect(resolvePath(out.questions, refuse).map((q) => q.id)).toEqual(["P9-0", "P9-FR"]);
    expect(buildTreeLayout(out.questions).hasEnd).toBe(true);
    expect(buildTagDictionary(out.questions).some((r) => r.tag === "pesquisa_recusou_p9")).toBe(true);
  });

  it("etapa que a regra manda esperar a equipe vira waitForTeam", () => {
    const t: ImportTree = { ...tree, regras: ["P9-H é enviada só depois que a equipe marca o atendimento como resolvido."] };
    const c = convertTree(t);
    expect(c.questions.find((q) => q.id === "P9-H")!.waitForTeam).toBe(true);
    expect(c.questions.find((q) => q.id === "P9-F")!.waitForTeam).toBeUndefined();
  });

  it("aceita um objeto só ou uma lista e recusa arquivo sem árvore", () => {
    expect(parseTreesJson(JSON.stringify(tree))).toHaveLength(1);
    expect(parseTreesJson(JSON.stringify([tree, tree]))).toHaveLength(2);
    expect(() => parseTreesJson("[]")).toThrow(/nenhuma árvore/);
  });
});

describe("variáveis do texto", () => {
  it("troca as conhecidas e limpa a pontuação das que faltam", () => {
    expect(fillPlaceholders("Oi, {nome}! Seu pedido #{pedido} está a caminho.", { nome: "Ana", pedido: "1042" })).toBe("Oi, Ana! Seu pedido #1042 está a caminho.");
    expect(fillPlaceholders("Oi, {nome}! Seu pedido #{pedido} está a caminho.", {})).toBe("Oi! Seu pedido está a caminho.");
    expect(fillPlaceholders("Obrigada, {nome}! Separei novidades de {interesse} para você.", { nome: "Bia", interesse: "brincos" })).toBe("Obrigada, Bia! Separei novidades de brincos para você.");
  });

  it("acha as decisões da loja ainda em aberto", () => {
    expect(findPendingPlaceholders("Quem responde ganha [mimo aprovado], válido até [data limite].")).toEqual(["mimo aprovado", "data limite"]);
    expect(findPendingPlaceholders("Texto normal")).toEqual([]);
  });
});
