import { describe, expect, it } from "vitest";
import {
  POPUP_TEMPLATE_PRESETS,
  buildPopupTemplateDraft,
  normalizePopupDesignConfig,
  pickWeightedWheelPrize,
  popupStageCount,
  type WheelPrize,
} from "./popup-designer";

describe("popup designer", () => {
  it("expõe os cinco templates principais", () => {
    expect(POPUP_TEMPLATE_PRESETS.map((preset) => preset.key)).toEqual([
      "essential",
      "skincare",
      "drop",
      "whatsapp_steps",
      "wheel",
    ]);
  });

  it("cria o template progressivo com três telas quando coleta nome", () => {
    const draft = buildPopupTemplateDraft("whatsapp_steps");
    expect(draft.design_config.journey).toBe("progressive");
    expect(popupStageCount(draft.design_config, draft.collect_name)).toBe(3);
  });

  it("cria a roleta com interação e prêmios configuráveis", () => {
    const draft = buildPopupTemplateDraft("wheel");
    expect(draft.design_config.interaction).toBe("wheel");
    expect(draft.design_config.wheelPrizes.length).toBeGreaterThanOrEqual(4);
  });

  it("normaliza limites e cores inválidas", () => {
    const design = normalizePopupDesignConfig({
      templateKey: "drop",
      width: 9999,
      borderRadius: -20,
      overlayOpacity: 9,
      backgroundColor: "red",
      wheelPrizes: ["A"],
    });
    expect(design.width).toBe(820);
    expect(design.borderRadius).toBe(0);
    expect(design.overlayOpacity).toBe(0.85);
    expect(design.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(design.wheelPrizes.length).toBeGreaterThanOrEqual(2);
  });

  it("migra prêmios da roleta do formato antigo (string) pro novo (objeto)", () => {
    const design = normalizePopupDesignConfig({
      templateKey: "wheel",
      wheelPrizes: ["10% OFF", "FRETE GRÁTIS"],
    });
    expect(design.wheelPrizes).toEqual([
      expect.objectContaining({ label: "10% OFF", type: "coupon", probability: 25 }),
      expect.objectContaining({ label: "FRETE GRÁTIS", type: "coupon", probability: 25 }),
    ]);
  });

  it("normaliza prêmios no formato novo, com tipo, cupom e probabilidade", () => {
    const design = normalizePopupDesignConfig({
      templateKey: "wheel",
      wheelPrizes: [
        { label: "20% OFF", color: "#ff0000", type: "coupon", couponCode: "rol20", probability: 130 },
        { label: "Não foi dessa vez", type: "no_prize", couponCode: "IGNORADO", probability: -5 },
      ],
    });
    expect(design.wheelPrizes[0]).toEqual({ label: "20% OFF", color: "#ff0000", type: "coupon", couponCode: "ROL20", probability: 100 });
    expect(design.wheelPrizes[1]).toEqual({ label: "Não foi dessa vez", color: expect.any(String), type: "no_prize", couponCode: "", probability: 0 });
  });

  it("sorteia respeitando o peso configurado (probabilidade 100% sempre ganha)", () => {
    const prizes: WheelPrize[] = [
      { label: "Nunca", color: "#000", type: "coupon", couponCode: "A", probability: 0 },
      { label: "Sempre", color: "#000", type: "coupon", couponCode: "B", probability: 100 },
    ];
    for (let i = 0; i < 20; i++) {
      expect(pickWeightedWheelPrize(prizes)?.label).toBe("Sempre");
    }
  });

  it("sorteia uniformemente quando todas as probabilidades são 0", () => {
    const prizes: WheelPrize[] = [
      { label: "A", color: "#000", type: "coupon", couponCode: "", probability: 0 },
      { label: "B", color: "#000", type: "coupon", couponCode: "", probability: 0 },
    ];
    expect(["A", "B"]).toContain(pickWeightedWheelPrize(prizes)?.label);
  });
});
