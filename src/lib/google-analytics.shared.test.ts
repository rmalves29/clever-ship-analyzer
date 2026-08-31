import { describe, expect, it } from "vitest";
import {
  ga4PercentageChange,
  normalizeGa4PropertyId,
  previousGa4Range,
} from "./google-analytics.shared";

describe("google analytics helpers", () => {
  it("calcula um período anterior inclusivo equivalente", () => {
    expect(
      previousGa4Range({ startDate: "2026-08-01", endDate: "2026-08-07" }),
    ).toEqual({
      startDate: "2026-07-25",
      endDate: "2026-07-31",
    });
  });

  it("aceita property id puro ou prefixado", () => {
    expect(normalizeGa4PropertyId("123456789")).toBe("123456789");
    expect(normalizeGa4PropertyId("properties/123456789")).toBe("123456789");
    expect(() => normalizeGa4PropertyId("G-ABC123")).toThrow(/ID numérico/);
  });

  it("evita variação enganosa quando o período anterior é zero", () => {
    expect(ga4PercentageChange(20, 10)).toBe(1);
    expect(ga4PercentageChange(0, 10)).toBe(-1);
    expect(ga4PercentageChange(20, 0)).toBeNull();
  });
});
