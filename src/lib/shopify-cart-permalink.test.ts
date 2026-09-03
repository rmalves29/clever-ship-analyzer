import { describe, expect, it } from "vitest";
import { buildDirectCheckoutUrl } from "./shopify-cart-permalink";

describe("buildDirectCheckoutUrl", () => {
  it("monta o link com 1 item usando só o id numérico do variant", () => {
    const url = buildDirectCheckoutUrl("maniadmulher.com", [
      { variantId: "gid://shopify/ProductVariant/47961153372338", quantity: 1 },
    ]);
    expect(url).toBe("https://maniadmulher.com/cart/47961153372338:1");
  });

  it("monta o link com vários itens separados por vírgula", () => {
    const url = buildDirectCheckoutUrl("maniadmulher.com", [
      { variantId: "gid://shopify/ProductVariant/111", quantity: 2 },
      { variantId: "gid://shopify/ProductVariant/222", quantity: 1 },
    ]);
    expect(url).toBe("https://maniadmulher.com/cart/111:2,222:1");
  });

  it("ignora itens sem variant_id (dado legado) sem quebrar os demais", () => {
    const url = buildDirectCheckoutUrl("maniadmulher.com", [
      { variantId: null, quantity: 1 },
      { variantId: "gid://shopify/ProductVariant/333", quantity: 1 },
    ]);
    expect(url).toBe("https://maniadmulher.com/cart/333:1");
  });

  it("devolve null sem domínio configurado ou sem nenhum item com variant_id", () => {
    expect(buildDirectCheckoutUrl(null, [{ variantId: "gid://shopify/ProductVariant/1", quantity: 1 }])).toBeNull();
    expect(buildDirectCheckoutUrl("maniadmulher.com", [{ variantId: null, quantity: 1 }])).toBeNull();
    expect(buildDirectCheckoutUrl("maniadmulher.com", [])).toBeNull();
  });

  it("nunca manda quantidade zero ou negativa", () => {
    const url = buildDirectCheckoutUrl("maniadmulher.com", [
      { variantId: "gid://shopify/ProductVariant/1", quantity: 0 },
    ]);
    expect(url).toBe("https://maniadmulher.com/cart/1:1");
  });
});
