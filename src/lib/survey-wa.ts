/**
 * Pesquisa por WhatsApp (parte pura): como cada pergunta da árvore vira mensagem (botões, lista, texto), como a resposta da
 * cliente (clique ou texto) é reconhecida e qual é a próxima etapa. Sem rede, sem banco — o envio e a gravação ficam no
 * módulo de servidor.
 */
import { fillPlaceholders, type SurveyVars, type TreeQuestion } from "./survey-tree";

export type WaOutbound =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { kind: "list"; body: string; button: string; rows: { id: string; title: string }[] };

export const BUTTON_TITLE_MAX = 20;
export const LIST_ROW_TITLE_MAX = 24;
export const LIST_MAX_ROWS = 10;
export const BODY_MAX = 1024;

/** Id que vai dentro do botão/linha e volta quando a cliente toca: sv:<run>:<etapa>:<opção>. */
export function replyId(runId: string, nodeId: string, optionIndex: number): string {
  return `sv:${runId}:${nodeId}:${optionIndex}`;
}

export function parseReplyId(id: string | null | undefined): { runId: string; nodeId: string; optionIndex: number } | null {
  const m = /^sv:([0-9a-f-]{36}):(.+):(\d{1,3})$/i.exec(String(id ?? ""));
  return m ? { runId: m[1] as string, nodeId: m[2] as string, optionIndex: Number(m[3]) } : null;
}

/** Minúsculas, sem acento, sem emoji/pontuação: para comparar o que a cliente digitou com o texto da opção. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Índice da opção que a cliente quis dizer (texto igual, número "2", ou começo único), ou -1. */
export function matchOption(options: readonly string[], text: string): number {
  const t = normalizeAnswer(text);
  if (!t) return -1;
  const normalized = options.map(normalizeAnswer);
  const exact = normalized.indexOf(t);
  if (exact >= 0) return exact;
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= options.length) return n - 1;
  }
  const starts = normalized.map((o, i) => (o.startsWith(t) || t.startsWith(o) ? i : -1)).filter((i) => i >= 0);
  return starts.length === 1 ? (starts[0] as number) : -1;
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** Mensagem de uma etapa da árvore (sem o convite da etapa 1, que sai como modelo aprovado). */
export function buildPrompt(q: TreeQuestion, runId: string, vars: SurveyVars): WaOutbound {
  // "Separei novidades de {interesse}…": sem interesse conhecido, a frase some e fica só o agradecimento.
  let label = q.label;
  if (label.includes("{interesse}") && !(vars.interesse ?? "").trim()) {
    const kept = label.split(/(?<=[.!?])\s+/).filter((s) => !s.includes("{interesse}")).join(" ");
    if (kept.trim()) label = kept;
  }
  const body = clip(fillPlaceholders(label, vars), BODY_MAX);
  if (q.type === "mensagem" || q.type === "texto_curto" || q.type === "texto_longo") return { kind: "text", body };

  const options = q.type === "sim_nao" ? ["Sim", "Não"] : q.type === "nota" ? ["1", "2", "3", "4", "5"] : (q.options ?? []);
  const fitsButtons = options.length >= 1 && options.length <= 3 && options.every((o) => o.length <= BUTTON_TITLE_MAX);
  if (fitsButtons) return { kind: "buttons", body, buttons: options.map((o, i) => ({ id: replyId(runId, q.id, i), title: o })) };

  const fitsList = options.length >= 1 && options.length <= LIST_MAX_ROWS && options.every((o) => o.length <= LIST_ROW_TITLE_MAX);
  if (fitsList) return { kind: "list", body, button: "Escolher", rows: options.map((o, i) => ({ id: replyId(runId, q.id, i), title: o })) };

  // Não cabe em botão nem lista: lista numerada em texto (a cliente responde com o número ou o texto).
  return { kind: "text", body: clip(`${body}\n\n${options.map((o, i) => `${i + 1}) ${o}`).join("\n")}\n\nResponda com o número da opção.`, BODY_MAX) };
}

/** Texto espelhado na caixa de entrada para a equipe ver o que o robô mandou. */
export function describeOutbound(out: WaOutbound): string {
  if (out.kind === "text") return out.body;
  const opts = out.kind === "buttons" ? out.buttons : out.rows;
  return `${out.body}\n\n${opts.map((o) => `• ${o.title}`).join("\n")}`;
}

/** Corpo da chamada da Graph API para a mensagem. */
export function toGraphPayload(phone: string, out: WaOutbound): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to: phone };
  if (out.kind === "text") return { ...base, type: "text", text: { body: out.body, preview_url: false } };
  if (out.kind === "buttons") {
    return {
      ...base,
      type: "interactive",
      interactive: { type: "button", body: { text: out.body }, action: { buttons: out.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) } },
    };
  }
  return {
    ...base,
    type: "interactive",
    interactive: { type: "list", body: { text: out.body }, action: { button: out.button, sections: [{ title: "Opções", rows: out.rows.map((r) => ({ id: r.id, title: r.title })) }] } },
  };
}

/** Peça recomendada a partir das etiquetas interesse_* (P3-F usa {interesse}). */
export function interestFromTags(tags: readonly string[]): string | null {
  const map: Record<string, string> = {
    interesse_colar: "colares",
    interesse_brinco: "brincos",
    interesse_anel: "anéis",
    interesse_pulseira: "pulseiras e braceletes",
    interesse_kit: "kits",
    interesse_clutch: "clutches",
  };
  for (const t of tags) if (map[t]) return map[t] as string;
  return null;
}

/** Efeitos reais de algumas etiquetas (o resto só marca a cliente). */
export const TAG_EFFECTS = {
  optOut: "optout_whatsapp",
  humanHandoff: "atendimento_aberto",
  declinedPrefix: "pesquisa_recusou_",
} as const;

export function isDeclinedPath(tags: readonly string[]): boolean {
  return tags.some((t) => t.startsWith(TAG_EFFECTS.declinedPrefix));
}
