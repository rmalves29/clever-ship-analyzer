import { describe, expect, it } from "vitest";
import { decideAutomationReentry } from "./whatsapp-automation-reentry";

const now = new Date("2026-08-25T20:00:00.000Z");

describe("whatsapp automation reentry", () => {
  it("permite apenas uma execução no modo once", () => {
    expect(decideAutomationReentry({ mode: "once", contextKey: "order:1", previousRuns: [], now })).toEqual({
      eligible: true,
      enrollmentKey: "once",
    });
    expect(
      decideAutomationReentry({
        mode: "once",
        contextKey: "order:2",
        previousRuns: [{ enrolled_at: "2026-08-01T00:00:00.000Z", enrollment_key: "once" }],
        now,
      }),
    ).toEqual({ eligible: false, reason: "already_enrolled" });
  });

  it("permite uma execução por pedido e bloqueia o mesmo pedido", () => {
    expect(decideAutomationReentry({ mode: "per_order", contextKey: "checkout:1", previousRuns: [], now })).toEqual({
      eligible: false,
      reason: "missing_order",
    });
    expect(
      decideAutomationReentry({
        mode: "per_order",
        contextKey: "order:200",
        previousRuns: [{ enrolled_at: "2026-08-20T00:00:00.000Z", context_key: "order:100" }],
        now,
      }),
    ).toEqual({ eligible: true, enrollmentKey: "order:200" });
    expect(
      decideAutomationReentry({
        mode: "per_order",
        contextKey: "order:100",
        previousRuns: [{ enrolled_at: "2026-08-20T00:00:00.000Z", enrollment_key: "order:100" }],
        now,
      }),
    ).toEqual({ eligible: false, reason: "already_enrolled" });
  });

  it("permite uma execução por checkout e exige contexto de checkout", () => {
    expect(decideAutomationReentry({ mode: "per_checkout", contextKey: "order:1", previousRuns: [], now })).toEqual({
      eligible: false,
      reason: "missing_checkout",
    });
    expect(decideAutomationReentry({ mode: "per_checkout", contextKey: "checkout:abc", previousRuns: [], now })).toEqual({
      eligible: true,
      enrollmentKey: "checkout:abc",
    });
  });

  it("respeita o intervalo mínimo do modo after_days", () => {
    expect(
      decideAutomationReentry({
        mode: "after_days",
        contextKey: "customer:1:x",
        reentryAfterDays: 30,
        previousRuns: [{ enrolled_at: "2026-08-10T20:00:00.000Z" }],
        now,
      }),
    ).toEqual({ eligible: false, reason: "cooldown" });

    expect(
      decideAutomationReentry({
        mode: "after_days",
        contextKey: "customer:1:x",
        reentryAfterDays: 30,
        previousRuns: [{ enrolled_at: "2026-07-20T20:00:00.000Z" }],
        now,
      }),
    ).toEqual({ eligible: true, enrollmentKey: "after_days:2026-08-25" });
  });
});
