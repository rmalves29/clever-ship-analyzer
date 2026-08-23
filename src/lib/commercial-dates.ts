/** Datas comemorativas relevantes pro varejo/e-commerce brasileiro. Datas fixas ficam como
 *  {month, day}; as que variam por ano (ex: Dia das Mães) são calculadas em getCommercialDateName. */
const FIXED_DATES: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "Ano Novo" },
  { month: 3, day: 8, name: "Dia da Mulher" },
  { month: 3, day: 15, name: "Dia do Consumidor" },
  { month: 6, day: 12, name: "Dia dos Namorados" },
  { month: 9, day: 7, name: "Independência" },
  { month: 9, day: 15, name: "Dia do Cliente" },
  { month: 10, day: 12, name: "Dia das Crianças / N. Sra. Aparecida" },
  { month: 10, day: 31, name: "Halloween" },
  { month: 12, day: 25, name: "Natal" },
  { month: 12, day: 31, name: "Véspera de Ano Novo" },
];

/** N-ésima ocorrência de um dia da semana num mês (weekday: 0=domingo...6=sábado). */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return new Date(year, month - 1, day);
}

/** Última ocorrência de um dia da semana num mês. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month, 0).getDate();
  const last = new Date(year, month - 1, lastDay);
  const lastWeekday = last.getDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  return new Date(year, month - 1, lastDay - offset);
}

function computedDatesForYear(year: number): { date: Date; name: string }[] {
  const maes = nthWeekdayOfMonth(year, 5, 0, 2); // 2º domingo de maio
  const pais = nthWeekdayOfMonth(year, 8, 0, 2); // 2º domingo de agosto
  const blackFriday = lastWeekdayOfMonth(year, 11, 5); // última sexta de novembro
  const cyberMonday = new Date(blackFriday);
  cyberMonday.setDate(blackFriday.getDate() + 3);
  return [
    { date: maes, name: "Dia das Mães" },
    { date: pais, name: "Dia dos Pais" },
    { date: blackFriday, name: "Black Friday" },
    { date: cyberMonday, name: "Cyber Monday" },
  ];
}

/** Nome da data comemorativa nesse dia (yyyy-MM-dd), ou null se não houver nenhuma cadastrada. */
export function getCommercialDateName(dateISO: string): string | null {
  const [yearStr, monthStr, dayStr] = dateISO.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const fixed = FIXED_DATES.find((d) => d.month === month && d.day === day);
  if (fixed) return fixed.name;

  const computed = computedDatesForYear(year).find((d) => d.date.getMonth() + 1 === month && d.date.getDate() === day);
  return computed?.name ?? null;
}
