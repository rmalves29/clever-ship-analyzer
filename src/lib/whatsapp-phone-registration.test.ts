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

  it("considera pronto quando está na Cloud API e o webhook está confirmado", () => {
    const result = deriveWhatsappPhoneReadiness({ codeVerificationStatus: "VERIFIED", platformType: "CLOUD_API", webhookSubscribed: true });
    expect(result).toMatchObject({ ready: true, codeVerified: true, cloudApi: true, webhookReady: true, issues: [] });
  });

  it("mantém pronto quando o desafio de verificação expirou após o registro", () => {
    const result = deriveWhatsappPhoneReadiness({ codeVerificationStatus: "EXPIRED", platformType: "CLOUD_API", webhookSubscribed: true });
    expect(result).toMatchObject({ ready: true, codeVerified: false, cloudApi: true, webhookReady: true, issues: [] });
  });

  it("aponta registro pendente quando o número ainda não está na Cloud API", () => {
    const result = deriveWhatsappPhoneReadiness({ codeVerificationStatus: "VERIFIED", platformType: "NOT_APPLICABLE", webhookSubscribed: true });
    expect(result.ready).toBe(false);
    expect(result.cloudApi).toBe(false);
    expect(result.issues.join(" ")).toContain("PIN de 6 dígitos");
  });

  it("aponta webhook ausente", () => {
    const result = deriveWhatsappPhoneReadiness({ codeVerificationStatus: "EXPIRED", platformType: "CLOUD_API", webhookSubscribed: false });
    expect(result.ready).toBe(false);
    expect(result.cloudApi).toBe(true);
    expect(result.webhookReady).toBe(false);
  });

  it("não assume webhook pronto quando a inscrição não foi confirmada", () => {
    const result = deriveWhatsappPhoneReadiness({ codeVerificationStatus: "EXPIRED", platformType: "CLOUD_API", webhookSubscribed: null });
    expect(result.ready).toBe(false);
    expect(result.webhookReady).toBe(false);
  });
});
