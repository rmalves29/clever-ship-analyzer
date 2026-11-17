export const brl = (value: number | null | undefined): string =>
  (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dateBr = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

export const dateTimeBr = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

/** "5531999991111" -> "(31) 99999-1111". */
export function formatWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value;
}

export const whatsappLink = (phone: string, text: string): string => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

/** Data (YYYY-MM-DD, Brasília) <-> ISO do início/fim do dia. */
export const dayStartIso = (day: string): string | null => (day ? new Date(`${day}T00:00:00-03:00`).toISOString() : null);
export const dayEndIso = (day: string): string | null => (day ? new Date(`${day}T23:59:59.999-03:00`).toISOString() : null);
export const isoToDay = (iso: string | null | undefined): string => (iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10) : "");

export function downloadCsv(fileName: string, lines: string[]): void {
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export const csvCell = (value: string | number | null | undefined): string => {
  const text = String(value ?? "");
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
