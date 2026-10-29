/**
 * Envio do link do grupo (Black Friday) para quem RESPONDEU positivo à campanha "Convite Black".
 * Parte pura (sem banco): classificação da resposta, horário permitido e texto.
 */

/** Campanha de origem: só conversas de quem recebeu o "Convite Black" entram. */
export const FOLLOWUP_CAMPAIGN_ID = "57a82f43-904a-492d-8d56-7b653d6773be";
/** Só conta resposta recebida depois do disparo da campanha (2026-10-29 13:14 BRT). */
export const FOLLOWUP_REPLIES_SINCE = "2026-10-29T16:14:50+00:00";
/** Para de rodar no dia seguinte à Black Friday (28/11/2026 00:00 BRT). */
export const FOLLOWUP_END = "2026-11-28T03:00:00+00:00";

export const FOLLOWUP_LINK = "https://app.cartzy.com.br/fluxo/app/black-friday-2";
export const TAG_NO_INTEREST = "black-sem-interesse";
export const TAG_LINK_SENT = "black-friday-2-link-enviado";

/** Horário de envio: das 08:00 até antes das 20:00 (Brasília). Depois disso a fila só acumula. */
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 20;

export const FOLLOWUP_TEXT = `Oi! 💛 Que bom que você confirmou!

Aqui está o seu acesso ao *Grupo VIP da Black Friday* da Mania de Mulher:
👉 ${FOLLOWUP_LINK}

É só tocar no link e entrar. Lá você recebe as ofertas primeiro, antes de todo mundo. 🖤

Qualquer dúvida, é só responder aqui.`;

export type ReplyClass = "negativa" | "positiva" | "ok" | "outra";

const L = "[^a-zà-ú]";
const NEGATIVE = new RegExp(
  `(^|${L})(não|nao|cancelar|cancela|sair|parar|pare|remover|remova|sem interesse|n quero)(${L}|$)|tira dessa lista|me tira|descadastr|lista de transmiss|n[uú]mero foi alterado|n[uú]mero novo`,
);
const POSITIVE = new RegExp(
  `(^|${L})(sim|confirmo|confirmado|confirmada|confirma|confirmar|pode|claro|quero|aceito|com certeza|bora|positivo)(${L}|$)|^s+i+m+[!. ]*$|^pode+[!. ]*$|me manda o acesso`,
);
const OK = /^(boa tarde|boa noite|bom dia)?[ ,]*(ok+|okay|blz|beleza)[!. ]*$|estou aguardando a black/;

/** Classifica a ÚLTIMA resposta da pessoa. Negativa ganha de tudo (pedido de sair nunca é ignorado). */
export function classifyReply(body: string | null | undefined): ReplyClass {
  const text = String(body ?? "").trim().toLowerCase();
  if (!text) return "outra";
  if (NEGATIVE.test(text)) return "negativa";
  if (POSITIVE.test(text)) return "positiva";
  if (OK.test(text)) return "ok";
  return "outra";
}

/** Hora cheia (0–23) no fuso de Brasília. */
export function brtHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(h);
}

export function isInsideSendWindow(now: Date): boolean {
  const h = brtHour(now);
  return h >= SEND_FROM_HOUR && h < SEND_UNTIL_HOUR;
}

/** Chave para casar telefones com e sem o 9º dígito: DDD + últimos 8 números. */
export function phoneKey(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "").replace(/^55/, "");
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : d;
}
