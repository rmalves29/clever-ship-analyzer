import { describe, expect, it } from "vitest";
import { summarizeWhatsappPresendAudience } from "./whatsapp-presend-audit";

describe("whatsapp presend audit", () => {
  it("separa telefone ausente/inválido, duplicado, opt-out e elegíveis em marketing", () => {
    const result = summarizeWhatsappPresendAudience(
      [
        { customerId: "1", rawPhone: "31999990001", normalizedPhone: "+5531999990001" },
        { customerId: "2", rawPhone: "31999990001", normalizedPhone: "+5531999990001" },
        { customerId: "3", rawPhone: "abc", normalizedPhone: null },
        { customerId: "4", rawPhone: "31999990004", normalizedPhone: "+5531999990004", suppressed: true },
      ],
      { totalSegment: 5, messageType: "marketing" },
    );

    expect(result).toEqual({
      totalSegment: 5,
      withPhone: 4,
      invalidPhone: 2,
      duplicatePhones: 1,
      marketingOptOuts: 1,
      eligibleRecipients: 1,
    });
  });

  it("não trata opt-out de marketing como bloqueio para utilidade", () => {
    const result = summarizeWhatsappPresendAudience(
      [{ customerId: "1", rawPhone: "+5531999990001", normalizedPhone: "+5531999990001", suppressed: true }],
      { totalSegment: 1, messageType: "utility" },
    );

    expect(result.marketingOptOuts).toBe(0);
    expect(result.eligibleRecipients).toBe(1);
  });

  it("conta telefone compartilhado apenas uma vez entre os elegíveis", () => {
    const result = summarizeWhatsappPresendAudience(
      [
        { customerId: "1", rawPhone: "31999990001", normalizedPhone: "+5531999990001" },
        { customerId: "2", rawPhone: "+55 31 99999-0001", normalizedPhone: "+5531999990001" },
      ],
      { totalSegment: 2, messageType: "marketing" },
    );

    expect(result.duplicatePhones).toBe(1);
    expect(result.eligibleRecipients).toBe(1);
  });
});
