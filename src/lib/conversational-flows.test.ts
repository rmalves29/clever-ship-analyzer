import { describe, expect, it } from "vitest";
import { parseConvSteps } from "./conversational-flows.server";

describe("parseConvSteps — etapa de menu (bot de atendimento por setor)", () => {
  it("reconhece uma etapa de menu válida com até 3 opções", () => {
    const steps = parseConvSteps([
      {
        id: "s1",
        type: "menu",
        waitMinutes: 0,
        text: "Escolha um setor:",
        options: [
          { id: "opt1", label: "SAC", nextStepId: "s2" },
          { id: "opt2", label: "Vendas", nextStepId: "s3" },
          { id: "opt3", label: "Trocas/Devoluções", nextStepId: null },
        ],
      },
    ]);
    expect(steps).toHaveLength(1);
    const menu = steps[0];
    expect(menu?.type).toBe("menu");
    if (menu?.type === "menu") {
      expect(menu.options).toHaveLength(3);
      expect(menu.options[0]).toEqual({ id: "opt1", label: "SAC", nextStepId: "s2" });
      expect(menu.options[2]?.nextStepId).toBeNull();
    }
  });

  it("corta pra no máximo 3 opções mesmo se vierem mais", () => {
    const steps = parseConvSteps([
      {
        id: "s1",
        type: "menu",
        text: "Escolha:",
        options: [
          { id: "o1", label: "A", nextStepId: null },
          { id: "o2", label: "B", nextStepId: null },
          { id: "o3", label: "C", nextStepId: null },
          { id: "o4", label: "D", nextStepId: null },
        ],
      },
    ]);
    const menu = steps[0];
    if (menu?.type === "menu") expect(menu.options).toHaveLength(3);
  });

  it("trunca o rótulo da opção em 20 caracteres (limite do WhatsApp)", () => {
    const steps = parseConvSteps([
      { id: "s1", type: "menu", text: "Oi", options: [{ id: "o1", label: "Um rótulo bem comprido demais pra caber", nextStepId: null }] },
    ]);
    const menu = steps[0];
    if (menu?.type === "menu") expect(menu.options[0]?.label.length).toBeLessThanOrEqual(20);
  });

  it("descarta opções sem id ou sem rótulo", () => {
    const steps = parseConvSteps([
      {
        id: "s1",
        type: "menu",
        text: "Oi",
        options: [
          { id: "", label: "Sem id", nextStepId: null },
          { id: "o2", label: "", nextStepId: null },
          { id: "o3", label: "Válida", nextStepId: null },
        ],
      },
    ]);
    const menu = steps[0];
    if (menu?.type === "menu") {
      expect(menu.options).toHaveLength(1);
      expect(menu.options[0]?.id).toBe("o3");
    }
  });

  it("descarta a etapa de menu se não sobrar nenhuma opção válida", () => {
    const steps = parseConvSteps([{ id: "s1", type: "menu", text: "Oi", options: [] }]);
    expect(steps).toHaveLength(0);
  });

  it("descarta a etapa de menu sem texto", () => {
    const steps = parseConvSteps([{ id: "s1", type: "menu", text: "", options: [{ id: "o1", label: "A", nextStepId: null }] }]);
    expect(steps).toHaveLength(0);
  });

  it("continua reconhecendo etapas send e decision normalmente ao lado de um menu", () => {
    const steps = parseConvSteps([
      { id: "s1", type: "send", text: "Oi!", waitMinutes: 0, buttonText: null, buttonUrl: null, nextStepId: "s2" },
      { id: "s2", type: "menu", text: "Escolha:", options: [{ id: "o1", label: "SAC", nextStepId: null }] },
    ]);
    expect(steps.map((s) => s.type)).toEqual(["send", "menu"]);
  });
});

describe("parseConvSteps — etapa de tag e mídia", () => {
  it("reconhece a etapa de tag, tira espaços e descarta tags vazias", () => {
    const steps = parseConvSteps([{ id: "t1", type: "tag", tags: [" cancelou ", "", "vip"], nextStepId: "s2" }]);
    expect(steps).toEqual([{ id: "t1", type: "tag", tags: ["cancelou", "vip"], nextStepId: "s2" }]);
  });

  it("descarta a etapa de tag sem nenhuma tag", () => {
    expect(parseConvSteps([{ id: "t1", type: "tag", tags: ["  "], nextStepId: null }])).toHaveLength(0);
  });

  it("aceita etapa de envio só com mídia (sem texto) e guarda o tipo", () => {
    const steps = parseConvSteps([{ id: "s1", type: "send", text: "", mediaType: "audio", mediaUrl: "https://x.test/a.mp3", nextStepId: null }]);
    expect(steps).toHaveLength(1);
    const send = steps[0];
    if (send?.type === "send") {
      expect(send.mediaType).toBe("audio");
      expect(send.mediaUrl).toBe("https://x.test/a.mp3");
    }
  });

  it("descarta etapa de envio sem texto e sem mídia, e ignora tipo de mídia inválido", () => {
    expect(parseConvSteps([{ id: "s1", type: "send", text: "", nextStepId: null }])).toHaveLength(0);
    const steps = parseConvSteps([{ id: "s2", type: "send", text: "Oi", mediaType: "gif", mediaUrl: "https://x.test/a.gif", nextStepId: null }]);
    const send = steps[0];
    if (send?.type === "send") expect(send.mediaUrl).toBeNull();
  });
});
