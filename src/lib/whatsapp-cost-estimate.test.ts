import { describe, expect, it } from "vitest";
import { estimateSendCost } from "./whatsapp-cost-estimate";

describe("estimateSendCost", () => {
  const costs = { marketing: "0.3217", utility: 0.035 };

  it("usa o custo de marketing por padrão e de utilidade quando o modelo é UTILITY", () => {
    expect(estimateSendCost("MARKETING", 1000, costs)).toEqual({ type: "marketing", perMessage: 0.3217, total: 321.7 });
    expect(estimateSendCost("UTILITY", 46148, costs)).toEqual({ type: "utility", perMessage: 0.035, total: 1615.18 });
    expect(estimateSendCost(undefined, 10, costs)?.type).toBe("marketing");
  });

  it("devolve null sem custo cadastrado e zera com 0 destinatários", () => {
    expect(estimateSendCost("MARKETING", 100, { marketing: null, utility: 0.03 })).toBeNull();
    expect(estimateSendCost("UTILITY", 100, {})).toBeNull();
    expect(estimateSendCost("UTILITY", 0, costs)?.total).toBe(0);
  });
});
