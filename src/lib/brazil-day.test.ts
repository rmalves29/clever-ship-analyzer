import { describe, expect, it } from "vitest";
import { startOfBrazilDay } from "./brazil-day";

describe("startOfBrazilDay", () => {
  it("hoje = 00:00 de Brasília (03:00 UTC)", () => {
    expect(startOfBrazilDay(0, new Date("2026-10-09T15:30:00Z")).toISOString()).toBe("2026-10-09T03:00:00.000Z");
  });
  it("antes das 03:00 UTC ainda é o dia anterior em Brasília", () => {
    expect(startOfBrazilDay(0, new Date("2026-10-09T02:00:00Z")).toISOString()).toBe("2026-10-08T03:00:00.000Z");
  });
  it("1 = ontem e hoje; 2 = anteontem até hoje", () => {
    const now = new Date("2026-10-09T15:30:00Z");
    expect(startOfBrazilDay(1, now).toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(startOfBrazilDay(2, now).toISOString()).toBe("2026-10-07T03:00:00.000Z");
  });
  it("atravessa virada de mês", () => {
    expect(startOfBrazilDay(2, new Date("2026-11-01T12:00:00Z")).toISOString()).toBe("2026-10-30T03:00:00.000Z");
  });
});
