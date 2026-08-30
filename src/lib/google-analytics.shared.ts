export type Ga4DateRange = {
  startDate: string;
  endDate: string;
};

const DAY_MS = 86_400_000;

function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime())) {
    throw new Error(`Data inválida: ${value}`);
  }
  return date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function previousGa4Range(range: Ga4DateRange): Ga4DateRange {
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  if (start.getTime() > end.getTime())
    throw new Error("A data inicial deve ser anterior à data final.");

  const inclusiveDays =
    Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const previousEnd = new Date(start.getTime() - DAY_MS);
  const previousStart = new Date(
    previousEnd.getTime() - (inclusiveDays - 1) * DAY_MS,
  );
  return {
    startDate: toIsoDate(previousStart),
    endDate: toIsoDate(previousEnd),
  };
}

export function ga4PercentageChange(
  current: number,
  previous: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0)
    return null;
  return (current - previous) / Math.abs(previous);
}

export function normalizeGa4PropertyId(value: string): string {
  const normalized = value.trim().replace(/^properties\//i, "");
  if (!/^\d+$/.test(normalized))
    throw new Error("Informe somente o ID numérico da propriedade GA4.");
  return normalized;
}

export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
