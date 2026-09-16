import { describe, expect, it } from "vitest";
import { buildCashbackAutomationSteps } from "./lifecycle-automation-blueprints";
import {
  cashbackScheduleDueAt,
  parseCashbackSendSchedule,
  pickInitialCashbackStep,
  pickNextCashbackStep,
} from "./cashback-automation-schedule";
import type { AutomationEventContext } from "./whatsapp-automation-context";

const context: AutomationEventContext = {
  capturedAt: "2026-09-04T12:00:00.000Z",
  cashback: {
    id: 10,
    code: "CASHBACK10",
    amount: 20,
    minimumPurchase: 60,
    startsAt: "2026-09-04T12:00:00.000Z",
    endsAt: "2026-10-01T12:00:00.000Z",
  },
};

describe("agenda da automação de cashback", () => {
  const steps = buildCashbackAutomationSteps();

  it("agenda os lembretes pelas datas reais do cupom", () => {
    expect(cashbackScheduleDueAt(steps[0]!.schedule, context)?.toISOString()).toBe(
      "2026-09-04T12:00:00.000Z",
    );
    expect(cashbackScheduleDueAt(steps[1]!.schedule, context)?.toISOString()).toBe(
      "2026-09-24T12:00:00.000Z",
    );
    expect(cashbackScheduleDueAt(steps[4]!.schedule, context)?.toISOString()).toBe(
      "2026-10-01T09:00:00.000Z",
    );
  });

  it("aceita o aviso de liberação dentro da tolerância do tick", () => {
    const selected = pickInitialCashbackStep(
      steps,
      steps[0]!.id,
      context,
      new Date("2026-09-04T12:05:00.000Z"),
    );
    expect(selected?.step.id).toBe("cashback-liberado");
  });

  it("ao instalar no meio da validade pula avisos antigos", () => {
    const selected = pickInitialCashbackStep(
      steps,
      steps[0]!.id,
      context,
      new Date("2026-09-25T12:00:00.000Z"),
    );
    expect(selected?.step.id).toBe("cashback-3d");
    expect(selected?.dueAt.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("depois de um envio pula etapas que já venceram", () => {
    const selected = pickNextCashbackStep(
      steps,
      "cashback-7d",
      context,
      new Date("2026-09-29T12:00:00.000Z"),
    );
    expect(selected?.step.id).toBe("cashback-1d");
  });

  it("não agenda nada depois da expiração", () => {
    expect(
      pickInitialCashbackStep(steps, steps[0]!.id, context, new Date("2026-10-02T12:00:00.000Z")),
    ).toBeNull();
  });

  it("recusa agendas fora dos limites", () => {
    expect(
      parseCashbackSendSchedule({ anchor: "cashback_ends_at", offsetMinutes: 1 }),
    ).toBeUndefined();
    expect(parseCashbackSendSchedule({ anchor: "outra_data", offsetMinutes: -10 })).toBeUndefined();
  });
});
