import { describe, expect, it } from "vitest";
import { renderPopupLoaderJs } from "./popup.server";

describe("script da loja (loader.js)", () => {
  const js = renderPopupLoaderJs();

  it("é JavaScript válido (um erro aqui quebraria o pop-up e a atribuição em todo o site)", () => {
    expect(() => new Function(js)).not.toThrow();
  });

  it("guarda a afiliada vinda de ?ref= e marca o carrinho com o atributo afiliada", () => {
    expect(js).toContain("mm_aff_ref");
    expect(js).toContain("/cart/update.js");
    expect(js).toContain("afiliada");
  });
});
