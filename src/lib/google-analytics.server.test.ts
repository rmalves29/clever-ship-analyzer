import { describe, expect, it } from "vitest";
import { extractShopifyProductHandle } from "./google-analytics.server";

describe("extractShopifyProductHandle", () => {
  it("extracts a handle from a Shopify product path", () => {
    expect(extractShopifyProductHandle("/products/colar-gota?variant=123")).toBe("colar-gota");
  });

  it("extracts and decodes a handle from an absolute URL", () => {
    expect(extractShopifyProductHandle("https://loja.com.br/products/Brinco%20Azul#detalhes")).toBe("brinco azul");
  });

  it("ignores non-product pages", () => {
    expect(extractShopifyProductHandle("/collections/lancamentos")).toBeNull();
  });
});
