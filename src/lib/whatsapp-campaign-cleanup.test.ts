import { describe, expect, it } from "vitest";
import { selectOtherManualWhatsappCampaignIds } from "./whatsapp-campaign-cleanup";

describe("selectOtherManualWhatsappCampaignIds", () => {
  it("preserva a campanha escolhida e remove as outras campanhas manuais", () => {
    const rows = [
      { id: "keep", origem: "crm", automationId: null },
      { id: "old-1", origem: "crm", automationId: null },
      { id: "old-2", origem: "crm", automationId: null },
    ];

    expect(selectOtherManualWhatsappCampaignIds(rows, "keep")).toEqual(["old-1", "old-2"]);
  });

  it("nunca inclui campanhas de automação", () => {
    const rows = [
      { id: "keep", origem: "crm", automationId: null },
      { id: "automation-origin", origem: "automacao", automationId: "auto-1" },
      { id: "automation-linked", origem: "crm", automationId: "auto-2" },
      { id: "manual", origem: "crm", automationId: null },
    ];

    expect(selectOtherManualWhatsappCampaignIds(rows, "keep")).toEqual(["manual"]);
  });

  it("remove ids duplicados do lote", () => {
    const rows = [
      { id: "keep", origem: "crm", automationId: null },
      { id: "old", origem: "crm", automationId: null },
      { id: "old", origem: "crm", automationId: null },
    ];

    expect(selectOtherManualWhatsappCampaignIds(rows, "keep")).toEqual(["old"]);
  });
});
