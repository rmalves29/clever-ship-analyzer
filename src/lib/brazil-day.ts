/** Início (00:00, horário de Brasília — UTC-3, sem horário de verão) do dia "hoje menos daysBack". */
export function startOfBrazilDay(daysBack: number, now: Date = new Date()): Date {
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() - daysBack, 3, 0, 0));
}
