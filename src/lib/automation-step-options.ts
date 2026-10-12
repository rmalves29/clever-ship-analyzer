/**
 * Opções por etapa de envio de uma automação (as mesmas ideias da tela de criar campanha): horário de envio, filtro de
 * público da etapa, tag da campanha e aprovação. Parte pura — o motor e a tela usam estas funções.
 */

export type StepAudience = { segmentType: string; segmentId?: string | undefined };

/** "10:00" -> "10:00"; qualquer coisa fora de HH:MM (00:00 a 23:59) vira undefined. */
export function parseSendTime(raw: unknown): string | undefined {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(raw ?? "").trim());
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : undefined;
}

export function parseStepAudience(raw: unknown): StepAudience | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { segmentType?: unknown; segmentId?: unknown };
  const segmentType = typeof r.segmentType === "string" ? r.segmentType.trim() : "";
  if (!segmentType) return undefined;
  const segmentId = typeof r.segmentId === "string" && r.segmentId.trim() ? r.segmentId.trim() : undefined;
  return { segmentType, ...(segmentId ? { segmentId } : {}) };
}

export function parseCampaignTag(raw: unknown): string | undefined {
  const t = String(raw ?? "").trim().slice(0, 60);
  return t || undefined;
}

const BRT_OFFSET_MS = -3 * 3_600_000; // Brasília (sem horário de verão)

/**
 * Primeiro instante a partir de `base` em que o relógio de Brasília marca `sendTime` (HH:MM).
 * Sem horário definido devolve `base`. Ex.: base 00:05 e "10:00" -> hoje às 10:00; base 10:30 -> amanhã às 10:00.
 */
export function alignToSendTime(base: Date, sendTime: string | undefined): Date {
  const t = parseSendTime(sendTime);
  if (!t) return base;
  const [hh, mm] = t.split(":").map(Number) as [number, number];
  const local = new Date(base.getTime() + BRT_OFFSET_MS); // "relógio de parede" de Brasília guardado como UTC
  const candidateLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm, 0, 0);
  let result = candidateLocal - BRT_OFFSET_MS;
  if (result < base.getTime()) result += 86_400_000;
  return new Date(result);
}

/** Valores de exemplo das variáveis dinâmicas, só para a prévia da mensagem na tela. */
const SAMPLE_VALUES: Record<string, string> = {
  NOME_CLIENTE: "Camila",
  NUMERO_PEDIDO: "1042",
  VALOR_TOTAL: "R$ 189,90",
  ITENS_COMPRADOS: "Colar Dourado",
  CUPOM_DESCONTO: "MANIA10",
  FRETE_ESCOLHIDO: "PAC",
  RASTREIO: "BR123456789BR",
  STATUS_PEDIDO: "Pago",
  LINK_CHECKOUT: "https://maniadmulher.com/checkout",
  LINK_PAGAMENTO: "https://maniadmulher.com/pagamento",
  CUPOM_CASHBACK: "VOLTA10",
  VALOR_CASHBACK: "R$ 18,99",
  COMPRA_MINIMA_CASHBACK: "R$ 99,00",
  VALIDADE_CASHBACK: "30/11",
};

/**
 * Texto do modelo com as variáveis preenchidas: o que o campo da etapa tiver ({{NOME_CLIENTE}} vira um nome de exemplo;
 * texto digitado entra como está). Variável sem valor aparece como «n».
 */
export function renderStepPreview(bodyText: string, tokens: readonly string[], params: readonly string[]): string {
  let text = bodyText;
  tokens.forEach((token, i) => {
    const raw = (params[i] ?? "").trim();
    const filled = raw ? raw.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_m, name: string) => SAMPLE_VALUES[name] ?? `{{${name}}}`) : `«${token}»`;
    text = text.replace(new RegExp(`\\{\\{\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"), filled);
  });
  return text;
}
