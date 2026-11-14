import { describe, expect, it } from "vitest";
import { isSessionWindowOpen, sessionTextError } from "./whatsapp-session";
import { campaignDraftFormSchema } from "./wa-campaign-drafts-shared";

describe("campanhas de texto na janela de atendimento", () => {
  const now = Date.parse("2026-11-14T22:00:00Z");
  it("fecha exatamente em 24h e rejeita datas ausentes, inválidas e futuras", () => {
    expect(isSessionWindowOpen(new Date(now - 86400000 + 1).toISOString(), now)).toBe(true);
    for (const at of [null, undefined, "", "invalid", new Date(now + 1).toISOString(), new Date(now - 86400000).toISOString()]) {
      expect(isSessionWindowOpen(at, now)).toBe(false);
    }
  });
  it("valida texto e preserva links e quebras de linha nos rascunhos", () => {
    const freeText = "Oi!\nhttps://maniadmulher.com/collections/36-joias";
    expect(sessionTextError(freeText)).toBeNull();
    expect(sessionTextError("  ")).not.toBeNull();
    expect(sessionTextError("a".repeat(4097))).not.toBeNull();
    expect(campaignDraftFormSchema.parse({ deliveryMode: "session", freeText }).freeText).toBe(freeText);
    expect(campaignDraftFormSchema.parse({}).deliveryMode).toBe("template");
  });
});
