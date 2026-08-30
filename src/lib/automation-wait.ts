/** Conversão e exibição do tempo de espera das etapas de automação.
 *  `waitMinutes` continua sendo o valor canônico do motor; `waitValue`/`waitUnit`
 *  são metadados opcionais que preservam a unidade escolhida no editor. */

export type WaitUnit = "minutes" | "days";

export const MAX_WAIT_MINUTES = 43_200; // 30 dias
export const MAX_WAIT_DAYS = 30;
export const MINUTES_PER_DAY = 1440;

export function maxWaitForUnit(unit: WaitUnit): number {
  return unit === "days" ? MAX_WAIT_DAYS : MAX_WAIT_MINUTES;
}

function clampInt(value: unknown, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export function normalizeWaitUnit(unit: unknown): WaitUnit {
  return unit === "days" ? "days" : "minutes";
}

/** Converte o par (valor, unidade) para o valor canônico em minutos. */
export function toWaitMinutes(value: unknown, unit: unknown): number {
  const u = normalizeWaitUnit(unit);
  const v = clampInt(value, maxWaitForUnit(u));
  return u === "days" ? Math.min(v * MINUTES_PER_DAY, MAX_WAIT_MINUTES) : v;
}

/** Hidrata (valor, unidade) a partir de uma etapa, com compatibilidade legada:
 *  etapas antigas só têm `waitMinutes` e devem abrir como minutos, sem mudar o prazo. */
export function resolveWaitInput(step: {
  waitMinutes?: unknown;
  waitValue?: unknown;
  waitUnit?: unknown;
}): { waitValue: number; waitUnit: WaitUnit; waitMinutes: number } {
  const minutes = clampInt(step.waitMinutes ?? 0, MAX_WAIT_MINUTES);
  if (step.waitUnit === "days" || step.waitUnit === "minutes") {
    const unit = normalizeWaitUnit(step.waitUnit);
    const rawValue = step.waitValue === undefined || step.waitValue === null
      ? unit === "days"
        ? Math.floor(minutes / MINUTES_PER_DAY)
        : minutes
      : step.waitValue;
    const value = clampInt(rawValue, maxWaitForUnit(unit));
    return { waitValue: value, waitUnit: unit, waitMinutes: toWaitMinutes(value, unit) };
  }
  return { waitValue: minutes, waitUnit: "minutes", waitMinutes: minutes };
}

/** Rótulo curto usado no card do fluxo: "Espera 15 dias antes" / "Espera 30 min antes". */
export function formatWaitLabel(step: { waitMinutes?: unknown; waitValue?: unknown; waitUnit?: unknown }): string {
  const { waitValue, waitUnit } = resolveWaitInput(step);
  if (waitValue === 0) return "Sem espera";
  if (waitUnit === "days") return `${waitValue} ${waitValue === 1 ? "dia" : "dias"}`;
  return `${waitValue} min`;
}
