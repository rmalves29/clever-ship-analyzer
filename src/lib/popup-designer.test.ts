import { describe, expect, it } from "vitest";
import {
  POPUP_TEMPLATE_PRESETS,
  buildPopupTemplateDraft,
  normalizePopupDesignConfig,
  popupStageCount,
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
});
