import { describe, expect, it } from "vitest";
import { campaignDraftFormSchema, saveDraftInputSchema } from "./wa-campaign-drafts-shared";

describe("rascunho de campanha", () => {
  it("completa os campos que faltam com valores padrão", () => {
    const f = campaignDraftFormSchema.parse({ templateName: "evento_2" });
    expect(f).toMatchObject({ audience: "sem_recompra", params: [], requireApproval: false, scheduleOn: false, scheduledAt: "" });
  });

  it("aceita rascunho sem nome de modelo e rejeita id inválido", () => {
    expect(saveDraftInputSchema.safeParse({ name: "niver", form: {} }).success).toBe(true);
    expect(saveDraftInputSchema.safeParse({ id: "x", name: "niver", form: {} }).success).toBe(false);
  });
});
