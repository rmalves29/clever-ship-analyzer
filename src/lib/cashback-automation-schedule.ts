import type { AutomationEventContext } from "./whatsapp-automation-context";

export const CASHBACK_AUTOMATION_SEGMENT_TYPE = "cashback_expiring";

export type CashbackScheduleAnchor = "cashback_starts_at" | "cashback_ends_at";

export type CashbackSendSchedule = {
  anchor: CashbackScheduleAnchor;
  /** Deslocamento relativo ao marco. Valores negativos significam "antes". */
  offsetMinutes: number;
};

export type ScheduledCashbackStep = {
  id: string;
  type: "send";
  nextStepId: string | null;
  schedule?: CashbackSendSchedule;
};

export function parseCashbackSendSchedule(value: unknown): CashbackSendSchedule | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as { anchor?: unknown; offsetMinutes?: unknown };
  if (raw.anchor !== "cashback_starts_at" && raw.anchor !== "cashback_ends_at") return undefined;
  const offsetMinutes = Math.trunc(Number(raw.offsetMinutes));
  if (!Number.isFinite(offsetMinutes) || offsetMinutes < -525_600 || offsetMinutes > 0)
    return undefined;
  return { anchor: raw.anchor, offsetMinutes };
}

export function cashbackScheduleDueAt(
  schedule: CashbackSendSchedule | undefined,
  context: AutomationEventContext,
): Date | null {
  if (!schedule || !context.cashback) return null;
  const anchorValue =
    schedule.anchor === "cashback_starts_at" ? context.cashback.startsAt : context.cashback.endsAt;
  const anchor = new Date(anchorValue);
  if (!Number.isFinite(anchor.getTime())) return null;
  return new Date(anchor.getTime() + schedule.offsetMinutes * 60_000);
}

function orderedFrom(
  steps: ScheduledCashbackStep[],
  startStepId: string | null,
): ScheduledCashbackStep[] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const ordered: ScheduledCashbackStep[] = [];
  const visited = new Set<string>();
  let currentId = startStepId;
  while (currentId && !visited.has(currentId) && ordered.length < 50) {
    visited.add(currentId);
    const step = byId.get(currentId);
    if (!step) break;
    ordered.push(step);
    currentId = step.nextStepId;
  }
  return ordered;
}

/**
 * Escolhe o primeiro lembrete de um cupom. Uma pequena tolerancia permite que o tick
 * envie o lembrete que acabou de vencer, sem despejar lembretes antigos quando uma
 * automacao e instalada no meio da validade.
 */
export function pickInitialCashbackStep<T extends ScheduledCashbackStep>(
  steps: T[],
  startStepId: string | null,
  context: AutomationEventContext,
  now: Date = new Date(),
  graceMinutes = 360,
): { step: T; dueAt: Date } | null {
  const ordered = orderedFrom(steps, startStepId) as T[];
  const valid = ordered
    .map((step) => ({ step, dueAt: cashbackScheduleDueAt(step.schedule, context) }))
    .filter((entry): entry is { step: T; dueAt: Date } => Boolean(entry.dueAt));

  const endsAt = context.cashback?.endsAt
    ? new Date(context.cashback.endsAt).getTime()
    : Number.NaN;
  const startsAt = context.cashback?.startsAt
    ? new Date(context.cashback.startsAt).getTime()
    : Number.NaN;
  const bounded = valid.filter(({ step, dueAt }) => {
    const time = dueAt.getTime();
    if (Number.isFinite(endsAt) && time >= endsAt) return false;
    // Lembretes relativos ao vencimento que cairiam antes da liberacao nao fazem sentido.
    if (
      step.schedule?.anchor === "cashback_ends_at" &&
      Number.isFinite(startsAt) &&
      time <= startsAt
    )
      return false;
    return true;
  });

  const recentDue = bounded
    .filter(
      ({ dueAt }) =>
        dueAt.getTime() <= now.getTime() &&
        now.getTime() - dueAt.getTime() <= graceMinutes * 60_000,
    )
    .at(-1);
  if (recentDue) return recentDue;
  return bounded.find(({ dueAt }) => dueAt.getTime() > now.getTime()) ?? null;
}

/** Depois de um envio confirmado, pula lembretes ja vencidos e agenda apenas o proximo futuro. */
export function pickNextCashbackStep<T extends ScheduledCashbackStep>(
  steps: T[],
  startStepId: string | null,
  context: AutomationEventContext,
  now: Date = new Date(),
): { step: T; dueAt: Date } | null {
  const endsAt = context.cashback?.endsAt
    ? new Date(context.cashback.endsAt).getTime()
    : Number.NaN;
  const startsAt = context.cashback?.startsAt
    ? new Date(context.cashback.startsAt).getTime()
    : Number.NaN;
  for (const step of orderedFrom(steps, startStepId) as T[]) {
    const dueAt = cashbackScheduleDueAt(step.schedule, context);
    if (!dueAt || dueAt.getTime() <= now.getTime()) continue;
    if (Number.isFinite(endsAt) && dueAt.getTime() >= endsAt) continue;
    if (
      step.schedule?.anchor === "cashback_ends_at" &&
      Number.isFinite(startsAt) &&
      dueAt.getTime() <= startsAt
    )
      continue;
    return { step, dueAt };
  }
  return null;
}

export function formatCashbackScheduleLabel(schedule: CashbackSendSchedule | undefined): string {
  if (!schedule) return "Momento do lembrete nao configurado";
  if (schedule.anchor === "cashback_starts_at") return "Quando o cashback for liberado";
  const minutes = Math.abs(schedule.offsetMinutes);
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "1 dia antes de expirar" : `${days} dias antes de expirar`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora antes de expirar" : `${hours} horas antes de expirar`;
  }
  return `${minutes} minutos antes de expirar`;
}
