import { describe, expect, it } from "vitest";
import { BUTTON_TITLE_MAX, buildPrompt, describeOutbound, interestFromTags, isDeclinedPath, matchOption, normalizeAnswer, parseReplyId, replyId, toGraphPayload } from "./survey-wa";
import type { TreeQuestion } from "./survey-tree";

const RUN = "123e4567-e89b-12d3-a456-426614174000";
const q = (extra: Partial<TreeQuestion>): TreeQuestion => ({ id: "P1-1", type: "escolha_unica", label: "O seu pedido é…", required: false, ...extra });

describe("ids de resposta", () => {
  it("vai e volta, inclusive com id de etapa com hífen e letras", () => {
    const id = replyId(RUN, "P1-1E", 2);
    expect(id).toBe(`sv:${RUN}:P1-1E:2`);
    expect(parseReplyId(id)).toEqual({ runId: RUN, nodeId: "P1-1E", optionIndex: 2 });
    expect(parseReplyId("outro-id")).toBeNull();
    expect(parseReplyId(null)).toBeNull();
    expect(id.length).toBeLessThan(200);
  });
});

describe("reconhecer a resposta digitada", () => {
  const options = ["Pra mim", "Festa ou evento", "Presente"];
  it("texto igual (sem acento/emoji), número e começo único", () => {
    expect(normalizeAnswer("  PRA MIM! 😊")).toBe("pra mim");
    expect(matchOption(options, "pra mim")).toBe(0);
    expect(matchOption(options, "2")).toBe(1);
    expect(matchOption(options, "festa")).toBe(1);
    expect(matchOption(options, "pre")).toBe(2);
    expect(matchOption(options, "sei lá")).toBe(-1);
    expect(matchOption(options, "9")).toBe(-1);
    expect(matchOption(options, "")).toBe(-1);
  });
  it("começo ambíguo não adivinha", () => {
    expect(matchOption(["Frete caro", "Frete lento"], "frete")).toBe(-1);
  });
});

describe("mensagens por tipo de etapa", () => {
  it("até 3 opções curtas viram botões; mais que isso, lista; texto e mensagem, texto", () => {
    const b = buildPrompt(q({ options: ["Pra mim", "Festa ou evento", "Presente"] }), RUN, {});
    expect(b.kind).toBe("buttons");
    const l = buildPrompt(q({ id: "P1-2", options: ["Mãe", "Amiga", "Filha", "Namorada ou esposa", "Outra pessoa"] }), RUN, {});
    expect(l.kind).toBe("list");
    if (l.kind === "list") expect(l.rows).toHaveLength(5);
    expect(buildPrompt(q({ type: "texto_curto", label: "Conta pra gente?" }), RUN, {})).toEqual({ kind: "text", body: "Conta pra gente?" });
    expect(buildPrompt(q({ type: "mensagem", label: "Já passei para a equipe." }), RUN, {}).kind).toBe("text");
    expect(buildPrompt(q({ type: "sim_nao" }), RUN, {}).kind).toBe("buttons");
    expect(buildPrompt(q({ type: "nota" }), RUN, {}).kind).toBe("list");
  });

  it("opção longa demais para botão cai para lista; longa demais para lista, para texto numerado", () => {
    const longButton = "Botão com 22 caracter";
    expect(longButton.length).toBeGreaterThan(BUTTON_TITLE_MAX);
    expect(buildPrompt(q({ options: [longButton, "B"] }), RUN, {}).kind).toBe("list");
    const text = buildPrompt(q({ options: ["Uma opção realmente muito longa para uma linha de lista do WhatsApp", "B"] }), RUN, {});
    expect(text.kind).toBe("text");
    if (text.kind === "text") expect(text.body).toContain("1) Uma opção");
    const many = buildPrompt(q({ options: Array.from({ length: 11 }, (_, i) => `Op ${i + 1}`) }), RUN, {});
    expect(many.kind).toBe("text");
  });

  it("preenche {nome} e {pedido} e limpa quando faltam", () => {
    const withVars = buildPrompt(q({ type: "mensagem", label: "Oi, {nome}! Pedido #{pedido}." }), RUN, { nome: "Ana", pedido: "1042" });
    expect(withVars).toEqual({ kind: "text", body: "Oi, Ana! Pedido #1042." });
    expect(buildPrompt(q({ type: "mensagem", label: "Oi, {nome}! Pedido #{pedido}." }), RUN, {})).toEqual({ kind: "text", body: "Oi! Pedido." });
  });

  it("sem interesse conhecido, a frase da recomendação some", () => {
    const m = q({ type: "mensagem", label: "Obrigada, {nome}! Separei novidades de {interesse} para você." });
    expect(buildPrompt(m, RUN, { nome: "Bia" })).toEqual({ kind: "text", body: "Obrigada, Bia!" });
    expect(buildPrompt(m, RUN, { nome: "Bia", interesse: "brincos" })).toEqual({ kind: "text", body: "Obrigada, Bia! Separei novidades de brincos para você." });
  });

  it("monta o corpo da Graph API e o espelho da caixa de entrada", () => {
    const out = buildPrompt(q({ options: ["Sim", "Não"] }), RUN, {});
    const payload = toGraphPayload("+5531999990000", out) as any;
    expect(payload.interactive.type).toBe("button");
    expect(payload.interactive.action.buttons[0].reply.id).toBe(`sv:${RUN}:P1-1:0`);
    expect(describeOutbound(out)).toContain("• Sim");
    const list = toGraphPayload("+55", buildPrompt(q({ id: "n", type: "nota" }), RUN, {})) as any;
    expect(list.interactive.action.sections[0].rows).toHaveLength(5);
    expect(list.interactive.action.button).toBe("Escolher");
  });
});

describe("etiquetas", () => {
  it("interesse vira a peça da recomendação; recusa é reconhecida", () => {
    expect(interestFromTags(["respondeu_p3", "interesse_brinco"])).toBe("brincos");
    expect(interestFromTags(["sem_intencao"])).toBeNull();
    expect(isDeclinedPath(["pesquisa_recusou_p1"])).toBe(true);
    expect(isDeclinedPath(["respondeu_p1"])).toBe(false);
  });
});
