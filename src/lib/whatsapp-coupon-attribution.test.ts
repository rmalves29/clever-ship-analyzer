import { describe, expect, it } from "vitest";
import { extractOrderDiscountCodes, normalizeCouponCode } from "./whatsapp-meta.server";

describe("atribuição por cupom da campanha", () => {
  it("normaliza o código atual e o histórico", () => {
    expect(normalizeCouponCode(" pop5 ")).toBe("POP5");
    expect(normalizeCouponCode("ganhe5")).toBe("GANHE5");
  });

  it("lê os códigos retornados pela Shopify sem diferença entre maiúsculas e minúsculas", () => {
    expect(extractOrderDiscountCodes({ discountCodes: ["ganhe5", "POP5", "pop5"] })).toEqual([
      "GANHE5",
      "POP5",
    ]);
  });

  it("mantém compatibilidade com snapshots antigos em formato de objeto", () => {
    expect(extractOrderDiscountCodes({ discount_codes: [{ code: "Ganhe5" }] })).toEqual(["GANHE5"]);
  });

  it("não inventa uso de cupom quando o pedido não tem código", () => {
    expect(extractOrderDiscountCodes({})).toEqual([]);
    expect(extractOrderDiscountCodes(null)).toEqual([]);
  });
});
