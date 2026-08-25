export const WHATSAPP_OPT_OUT_KEYWORDS = new Set([
  "SAIR",
  "PARAR",
  "STOP",
  "CANCELAR",
  "DESCADASTRAR",
  "REMOVER",
  "NAO QUERO RECEBER",
  "NAO QUERO MAIS RECEBER",
]);

export function normalizeOptOutText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractIncomingWhatsappText(message: any): string {
  return String(
    message?.text?.body ??
      message?.button?.text ??
      message?.interactive?.button_reply?.title ??
      message?.interactive?.list_reply?.title ??
      "",
  );
}

export function isWhatsappOptOutMessage(message: any): boolean {
  const normalized = normalizeOptOutText(extractIncomingWhatsappText(message));
  return WHATSAPP_OPT_OUT_KEYWORDS.has(normalized);
}

export function normalizeWhatsappSuppressionPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `+${digits}`;
}
