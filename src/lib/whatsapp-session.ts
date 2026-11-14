/** Reserved storage marker: session text uses existing campaign/queue columns.
 * It must never be sent to Meta as a template name. */
export const SESSION_TEXT_TEMPLATE = "__session_text__";
export const SESSION_TEXT_MAX_LENGTH = 4096;

export function isSessionWindowOpen(lastInbound: string | null | undefined, now = Date.now()): boolean {
  if (!lastInbound) return false;
  const at = new Date(lastInbound).getTime();
  return Number.isFinite(at) && at <= now && now - at < 24 * 60 * 60 * 1000;
}

export function sessionTextError(text: string): string | null {
  if (!text.trim()) return "Escreva a mensagem livre.";
  if (text.trim().length > SESSION_TEXT_MAX_LENGTH) return "A mensagem livre deve ter no máximo 4096 caracteres.";
  return null;
}
