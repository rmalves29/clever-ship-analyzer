import { describe, expect, it } from "vitest";
import { alignToSendTime, parseCampaignTag, parseSendTime, parseStepAudience, renderStepPreview } from "./automation-step-options";

describe("horário de envio da etapa", () => {
  it("aceita HH:MM e recusa o resto", () => {
    expect(parseSendTime("9:05")).toBe("09:05");
    expect(parseSendTime("23:59")).toBe("23:59");
    expect(parseSendTime("24:00")).toBeUndefined();
    expect(parseSendTime("10h")).toBeUndefined();
    expect(parseSendTime("")).toBeUndefined();
    expect(parseSendTime(null)).toBeUndefined();
  });

  it("alinha para o próximo horário em Brasília (UTC-3)", () => {
    // 2026-10-12 03:05 UTC = 00:05 em Brasília -> 10:00 de hoje = 13:00 UTC
    expect(alignToSendTime(new Date("2026-10-12T03:05:00Z"), "10:00").toISOString()).toBe("2026-10-12T13:00:00.000Z");
    // 10:30 em Brasília (13:30 UTC) já passou das 10:00 -> amanhã 10:00
    expect(alignToSendTime(new Date("2026-10-12T13:30:00Z"), "10:00").toISOString()).toBe("2026-10-13T13:00:00.000Z");
    // exatamente no horário vale o mesmo instante
    expect(alignToSendTime(new Date("2026-10-12T13:00:00Z"), "10:00").toISOString()).toBe("2026-10-12T13:00:00.000Z");
    // 01:30 UTC = 22:30 BRT do dia 11: o próximo 10:00 é o do dia 12
    expect(alignToSendTime(new Date("2026-10-12T01:30:00Z"), "10:00").toISOString()).toBe("2026-10-12T13:00:00.000Z");
  });

  it("sem horário não mexe", () => {
    const base = new Date("2026-10-12T03:05:00Z");
    expect(alignToSendTime(base, undefined)).toBe(base);
    expect(alignToSendTime(base, "lixo")).toBe(base);
  });
});

describe("filtro de público e tag", () => {
  it("lê o público da etapa", () => {
    expect(parseStepAudience({ segmentType: "custom", segmentId: "abc" })).toEqual({ segmentType: "custom", segmentId: "abc" });
    expect(parseStepAudience({ segmentType: "sem_recompra" })).toEqual({ segmentType: "sem_recompra" });
    expect(parseStepAudience({ segmentType: "" })).toBeUndefined();
    expect(parseStepAudience(null)).toBeUndefined();
  });
  it("tag da campanha limpa e limita", () => {
    expect(parseCampaignTag("  pesquisa-p1 ")).toBe("pesquisa-p1");
    expect(parseCampaignTag("")).toBeUndefined();
    expect(parseCampaignTag("x".repeat(100))?.length).toBe(60);
  });
});

describe("prévia da mensagem", () => {
  const body = "Oi, {{1}}! Seu pedido #{{2}} já está sendo separado.";
  it("preenche as variáveis dinâmicas com exemplos e mostra as vazias", () => {
    expect(renderStepPreview(body, ["1", "2"], ["{{NOME_CLIENTE}}", "{{NUMERO_PEDIDO}}"])).toBe("Oi, Camila! Seu pedido #1042 já está sendo separado.");
    expect(renderStepPreview(body, ["1", "2"], ["Ana", ""])).toBe("Oi, Ana! Seu pedido #«2» já está sendo separado.");
  });
  it("aceita variável nomeada", () => {
    expect(renderStepPreview("Oi {{nome}}!", ["nome"], ["{{NOME_CLIENTE}}"])).toBe("Oi Camila!");
  });
});
