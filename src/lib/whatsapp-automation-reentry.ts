export const AUTOMATION_REENTRY_MODES = ["once", "per_order", "per_checkout", "after_days"] as const;
export type AutomationReentryMode = (typeof AUTOMATION_REENTRY_MODES)[number];

export type PreviousAutomationRun = {
  enrollment_key?: string | null;
  context_key?: string | null;
  enrolled_at: string;
  status?: string | null;
};

export type ReentryDecision =
  | { eligible: true; enrollmentKey: string }
  | {
      eligible: false;
      reason: "already_enrolled" | "missing_order" | "missing_checkout" | "cooldown" | "active_run";
    };

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function decideAutomationReentry(params: {
  mode?: AutomationReentryMode | null;
  contextKey: string;
  previousRuns: PreviousAutomationRun[];
  reentryAfterDays?: number | null;
  now?: Date;
}): ReentryDecision {
  const mode = params.mode ?? "once";
  const previousRuns = params.previousRuns ?? [];
  const now = params.now ?? new Date();

  if (previousRuns.some((run) => ["pending_approval", "active", "waiting_send"].includes(String(run.status ?? "")))) {
    return { eligible: false, reason: "active_run" };
  }

  if (mode === "once") {
    if (previousRuns.length > 0) return { eligible: false, reason: "already_enrolled" };
    return { eligible: true, enrollmentKey: "once" };
  }

  if (mode === "per_order") {
    if (!params.contextKey.startsWith("order:")) return { eligible: false, reason: "missing_order" };
    const alreadyUsed = previousRuns.some(
      (run) => run.enrollment_key === params.contextKey || run.context_key === params.contextKey,
    );
    return alreadyUsed
      ? { eligible: false, reason: "already_enrolled" }
      : { eligible: true, enrollmentKey: params.contextKey };
  }

  if (mode === "per_checkout") {
    if (!params.contextKey.startsWith("checkout:")) return { eligible: false, reason: "missing_checkout" };
    const alreadyUsed = previousRuns.some(
      (run) => run.enrollment_key === params.contextKey || run.context_key === params.contextKey,
    );
    return alreadyUsed
      ? { eligible: false, reason: "already_enrolled" }
      : { eligible: true, enrollmentKey: params.contextKey };
  }

  const days = Math.max(1, Number(params.reentryAfterDays ?? 30));
  const latest = previousRuns
    .map((run) => new Date(run.enrolled_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (latest !== undefined && now.getTime() - latest < days * 86_400_000) {
    return { eligible: false, reason: "cooldown" };
  }
  return { eligible: true, enrollmentKey: `after_days:${utcDay(now)}` };
}
