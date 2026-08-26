import { describe, expect, it } from "vitest";
import { maskWhatsappRecipientPhone, normalizeWhatsappAudienceSelection } from "./whatsapp-audience-selection";

describe("normalizeWhatsappAudienceSelection", () => {
  it("preserva segmento legado", () => {
    expect(normalizeWhatsappAudienceSelection("sem_recompra")).toEqual({ segmentType: "sem_recompra" });
  });

  it("normaliza segmento customizado informado por id", () => {
    const id = "d680c929-6149-4871-bf9e-1fa803925402";
    expect(normalizeWhatsappAudienceSelection("custom", id)).toEqual({ segmentType: "custom", segmentId: id });
  });

  it("recupera UUID recebido no campo de tipo", () => {
    const id = "d680c929-6149-4871-bf9e-1fa803925402";
    expect(normalizeWhatsappAudienceSelection(id)).toEqual({ segmentType: "custom", segmentId: id });
  });

  it("não permite custom sem id silenciosamente", () => {
    expect(() => normalizeWhatsappAudienceSelection("custom")).toThrow(/perdeu o identificador/i);
  });
});

describe("maskWhatsappRecipientPhone", () => {
  it("mostra somente os quatro últimos dígitos", () => {
    expect(maskWhatsappRecipientPhone("+55 31 99999-1234")).toBe("•••• 1234");
  });
});
