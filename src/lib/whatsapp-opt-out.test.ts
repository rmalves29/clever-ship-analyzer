import { describe, expect, it } from "vitest";
import {
  extractIncomingWhatsappText,
  isWhatsappOptOutMessage,
  normalizeOptOutText,
  normalizeWhatsappSuppressionPhone,
} from "./whatsapp-opt-out";

describe("whatsapp opt-out", () => {
  it("normaliza acentos, pontuação e espaços", () => {
    expect(normalizeOptOutText("  não   quero mais receber!!! ")).toBe("NAO QUERO MAIS RECEBER");
  });

  it("reconhece palavras exatas de descadastro", () => {
    for (const text of ["SAIR", "parar", "Stop!", "cancelar", "descadastrar", "não quero receber"]) {
      expect(isWhatsappOptOutMessage({ text: { body: text } })).toBe(true);
    }
  });

  it("não bloqueia frases comuns que apenas contêm uma palavra parecida", () => {
    expect(isWhatsappOptOutMessage({ text: { body: "Pode parar de cobrar frete?" } })).toBe(false);
    expect(isWhatsappOptOutMessage({ text: { body: "Quero cancelar meu pedido" } })).toBe(false);
  });

  it("aceita resposta de botão/interativo", () => {
    const message = { interactive: { button_reply: { title: "SAIR" } } };
    expect(extractIncomingWhatsappText(message)).toBe("SAIR");
    expect(isWhatsappOptOutMessage(message)).toBe(true);
  });

  it("normaliza o telefone recebido pela Meta para a chave de supressão", () => {
    expect(normalizeWhatsappSuppressionPhone("5531999999999")).toBe("+5531999999999");
    expect(normalizeWhatsappSuppressionPhone("+55 (31) 99999-9999")).toBe("+5531999999999");
    expect(normalizeWhatsappSuppressionPhone("123")).toBeNull();
  });
});
