import { describe, expect, it, vi } from "vitest";
import { safeEqual, uazapiWebhookSecret, uazapiWebhookUrl } from "./webhook-security.server";

describe("safeEqual", () => {
  it("só aceita segredos idênticos", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("abc", "abc123")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual(null, "x")).toBe(false);
    expect(safeEqual("x", undefined)).toBe(false);
  });
});

describe("segredo do webhook da UazAPI", () => {
  it("é determinístico, muda com a chave e vai na URL", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-a");
    const a1 = await uazapiWebhookSecret();
    const a2 = await uazapiWebhookSecret();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-b");
    const b = await uazapiWebhookSecret();
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).toMatch(/^[0-9a-f]{40}$/);
    expect(await uazapiWebhookUrl("https://x.test", "/p")).toBe(`https://x.test/p?secret=${b}`);
    vi.unstubAllEnvs();
  });

  it("sem chave de serviço não há segredo (o webhook recusa tudo)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await uazapiWebhookSecret()).toBeNull();
    vi.unstubAllEnvs();
  });
});
