import { describe, expect, it } from "vitest";
import {
  parseWhatsappCampaignAudienceValue,
  uniqueWhatsappCampaignCustomerIds,
  whatsappCampaignAudienceValue,
} from "./whatsapp-campaign-audience";

const ID = "525ef363-55df-4c2f-8b36-ae3c642d3e5b";

describe("WhatsApp campaign audiences", () => {
  it("codifica e decodifica o público de uma campanha", () => {
    expect(whatsappCampaignAudienceValue(ID)).toBe(`campaign:${ID}`);
    expect(parseWhatsappCampaignAudienceValue(`campaign:${ID}`)).toBe(ID);
    expect(parseWhatsappCampaignAudienceValue("campaign:invalido")).toBeNull();
  });

  it("inclui apenas clientes que efetivamente receberam e remove duplicados", () => {
    expect(
      uniqueWhatsappCampaignCustomerIds([
        { customer_id: "a", status: "sent" },
        { customer_id: "a", status: "read" },
        { customer_id: "b", status: "failed" },
        { customer_id: "c", status: "queued", sent_at: "2026-08-26T10:00:00Z" },
      ]),
    ).toEqual(["a", "c"]);
  });
});
