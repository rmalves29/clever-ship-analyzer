import { describe, expect, it } from "vitest";
import {
  deriveWhatsappPhoneReadiness,
  isValidWhatsappRegistrationPin,
  normalizeWhatsappRegistrationPin,
} from "./whatsapp-phone-registration";

describe("whatsapp phone registration", () => {
  it("normaliza e valida PIN de 6 dígitos", () => {
    expect(normalizeWhatsappRegistrationPin("12a 34-567")).toBe("123456");
    expect(isValidWhatsappRegistrationPin("123456")).toBe(true);
    expect(isValidWhatsappRegistrationPin("12345")).toBe(false);
    expect(isValidWhatsappRegistrationPin("12345a")).toBe(false);
  });

  it("considera pronto quando verificado, Cloud API e webhook não está ausente", () => {
    expect(
      deriveWhatsappPhoneReadiness({
        codeVerificationStatus: "VERIFIED",
        platformType: "CLOUD_API",
        webhookSubscribed: true,
      }),
    ).toMatchObject({ ready: true, codeVerified: true, cloudApi: true, webhookReady: true, issues: [] });
  });

  it("aponta registro pendente quando o número ainda não está na Cloud API", () => {
    const result = deriveWhatsappPhoneReadiness({
      codeVerificationStatus: "VERIFIED",
      platformType: "NOT_APPLICABLE",
      webhookSubscribed: true,
    });
    expect(result.ready).toBe(false);
    expect(result.cloudApi).toBe(false);
    expect(result.issues.join(" ")).toContain("PIN de 6 dígitos");
  });

  it("aponta webhook ausente sem confundir com verificação do número", () => {
    const result = deriveWhatsappPhoneReadiness({
      codeVerificationStatus: "VERIFIED",
      platformType: "CLOUD_API",
      webhookSubscribed: false,
    });
    expect(result.ready).toBe(false);
    expect(result.codeVerified).toBe(true);
    expect(result.cloudApi).toBe(true);
    expect(result.webhookReady).toBe(false);
  });
});
