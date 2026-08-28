import { describe, expect, it } from "vitest";
import {
  SOCIAL_PROOF_DELAY_AFTER_CAPTURE_MS,
  SOCIAL_PROOF_INTERVAL_MS,
  getPreviousDayRangeSaoPaulo,
  publicFirstName,
  sanitizeSocialProofOrder,
} from "./popup-social-proof";
import { renderSocialProofLoaderScript } from "./popup-social-proof.server";

describe("popup social proof", () => {
  it("calcula o dia anterior no fuso de Sao Paulo", () => {
    const range = getPreviousDayRangeSaoPaulo(new Date("2026-08-28T01:24:25.000Z"));
    expect(range).toEqual({
      date: "2026-08-26",
      startIso: "2026-08-26T03:00:00.000Z",
      endIso: "2026-08-27T03:00:00.000Z",
    });
  });

  it("publica somente o primeiro nome", () => {
    expect(publicFirstName("MARIA CAROLINA DA SILVA")).toBe("Maria");
    expect(publicFirstName("  Bárbara  Cristina ")).toBe("Bárbara");
  });

  it("aceita somente venda paga e remove dados privados do payload", () => {
    const sale = sanitizeSocialProofOrder({
      createdAt: "2026-08-26T17:35:05Z",
      displayFinancialStatus: "PAID",
      test: false,
      customer: { firstName: "MARIA CAROLINA" },
      shippingAddress: { firstName: "MARIA CAROLINA", city: "Diamantina", provinceCode: "MG" },
      lineItems: {
        nodes: [
          {
            title: "Kit Ayla Azul Turquesa",
            quantity: 1,
            image: null,
            product: { featuredMedia: { preview: { image: { url: "https://cdn.shopify.com/product.jpg" } } } },
          },
          { title: "Clutch Pink", quantity: 1 },
        ],
      },
    });

    expect(sale).toEqual({
      firstName: "Maria",
      city: "Diamantina",
      state: "MG",
      productTitle: "Kit Ayla Azul Turquesa",
      productImageUrl: "https://cdn.shopify.com/product.jpg",
      itemCount: 2,
      purchasedAt: "2026-08-26T17:35:05Z",
      timeLabel: "ontem",
    });
    expect(Object.keys(sale ?? {})).not.toContain("email");
    expect(Object.keys(sale ?? {})).not.toContain("phone");
    expect(Object.keys(sale ?? {})).not.toContain("orderId");
  });

  it("rejeita pedidos expirados, cancelados e testes", () => {
    const base = {
      createdAt: "2026-08-26T17:35:05Z",
      customer: { firstName: "Ana" },
      lineItems: { nodes: [{ title: "Colar", quantity: 1 }] },
    };
    expect(sanitizeSocialProofOrder({ ...base, displayFinancialStatus: "EXPIRED" })).toBeNull();
    expect(sanitizeSocialProofOrder({ ...base, displayFinancialStatus: "PAID", cancelledAt: "2026-08-26T18:00:00Z" })).toBeNull();
    expect(sanitizeSocialProofOrder({ ...base, displayFinancialStatus: "PAID", test: true })).toBeNull();
  });

  it("usa 10 segundos apos captacao e reveza a cada 30 segundos", () => {
    expect(SOCIAL_PROOF_DELAY_AFTER_CAPTURE_MS).toBe(10_000);
    expect(SOCIAL_PROOF_INTERVAL_MS).toBe(30_000);
    const script = renderSocialProofLoaderScript();
    expect(script).toContain('window.addEventListener("mm:capture-popup-shown"');
    expect(script).toContain("AFTER_CAPTURE_MS = 10000");
    expect(script).toContain("INTERVAL_MS = 30000");
    expect(script).toContain('class="mmsp-buyer"');
    expect(script).toContain("ontem");
    expect(script).not.toContain(">agora<");
  });
});
