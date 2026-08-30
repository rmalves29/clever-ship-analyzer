import { describe, expect, it } from "vitest";
import {
  MAX_WAIT_MINUTES,
  formatWaitLabel,
  maxWaitForUnit,
  resolveWaitInput,
  toWaitMinutes,
} from "./automation-wait";

describe("conversão minutos/dias", () => {
  it("converte minutos", () => {
    expect(toWaitMinutes(10, "minutes")).toBe(10);
    expect(toWaitMinutes(30, "minutes")).toBe(30);
  });

  it("converte dias", () => {
    expect(toWaitMinutes(15, "days")).toBe(21_600);
    expect(toWaitMinutes(1, "days")).toBe(1440);
  });

  it("respeita limites", () => {
    expect(maxWaitForUnit("days")).toBe(30);
    expect(maxWaitForUnit("minutes")).toBe(MAX_WAIT_MINUTES);
    expect(toWaitMinutes(999, "days")).toBe(MAX_WAIT_MINUTES);
    expect(toWaitMinutes(99_999, "minutes")).toBe(MAX_WAIT_MINUTES);
    expect(toWaitMinutes(-5, "minutes")).toBe(0);
    expect(toWaitMinutes(2.7, "minutes")).toBe(2);
  });
});

describe("compatibilidade legada", () => {
  it("abre etapa antiga em minutos sem mudar prazo", () => {
    expect(resolveWaitInput({ waitMinutes: 4320 })).toEqual({
      waitValue: 4320,
      waitUnit: "minutes",
      waitMinutes: 4320,
    });
  });

  it("preserva unidade quando há metadados", () => {
    expect(resolveWaitInput({ waitMinutes: 21_600, waitValue: 15, waitUnit: "days" })).toEqual({
      waitValue: 15,
      waitUnit: "days",
      waitMinutes: 21_600,
    });
  });

  it("deriva valor quando só a unidade existe", () => {
    expect(resolveWaitInput({ waitMinutes: 2880, waitUnit: "days" }).waitValue).toBe(2);
  });
});

describe("exibição", () => {
  it("formata singular/plural e minutos", () => {
    expect(formatWaitLabel({ waitMinutes: 30 })).toBe("30 min");
    expect(formatWaitLabel({ waitMinutes: 21_600, waitValue: 15, waitUnit: "days" })).toBe("15 dias");
    expect(formatWaitLabel({ waitMinutes: 1440, waitValue: 1, waitUnit: "days" })).toBe("1 dia");
    expect(formatWaitLabel({ waitMinutes: 0 })).toBe("Sem espera");
  });
});
