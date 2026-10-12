/**
 * Pesquisa por WhatsApp (servidor). A cliente recebe o convite como MODELO aprovado (botões de resposta rápida); quando ela
 * toca num botão, abre uma "run" que anda pela árvore da pesquisa dentro da janela de 24h (botões, listas, texto livre).
 * Ao terminar: grava a resposta em survey_responses (origem "whatsapp") com as etiquetas e marca a cliente.
 * Nada é enviado a quem não tocou no convite.
 */
import { META_GRAPH_API_VERSION } from "./whatsapp-phone-registration";
import { FIM, collectTags, findPendingPlaceholders, nextQuestionId, type TreeQuestion } from "./survey-tree";
import { SURVEY_TAGS_KEY } from "./survey-analysis-shared";
import {
  TAG_EFFECTS,
  buildPrompt,
  describeOutbound,
  interestFromTags,
  isDeclinedPath,
  matchOption,
  parseReplyId,
  toGraphPayload,
  type WaOutbound,
} from "./survey-wa";

const TABLE_RUNS = "survey_wa_runs";
const TABLE_CONFIG = "survey_wa_config";
const MAX_RETRIES = 2;
const MAX_STEPS = 30;

type Db = { from: (t: string) => any; rpc: (fn: string, args?: any) => any };
async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export type IncomingSurveyMessage = {
  id?: string;
  from: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  context?: { id?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
};

type Survey = { id: string; slug: string; title: string; questions: TreeQuestion[] };
type Run = {
  id: string;
  survey_id: string;
  phone: string;
  customer_id: string | null;
  context: { nome?: string | null; pedido?: string | null; handoff?: boolean; actions?: string[] };
  node_id: string;
  awaiting: "choice" | "text" | null;
  status: string;
  answers: Record<string, string>;
  tags: string[];
  retries: number;
  expires_at: string;
};

// ----------------------------------------------------------------------------------------------- envio

async function sendOut(phone: string, out: WaOutbound): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  const { loadSettings } = await import("./whatsapp-meta.server");
  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) return { ok: false, error: "WhatsApp (Meta) não configurado." };
  const res = await fetch(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${settings.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
    body: JSON.stringify(toGraphPayload(phone, out)),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[survey-wa] falha ao enviar", { status: res.status, error: json?.error?.message });
    return { ok: false, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  }
  const waMessageId: string | undefined = json?.messages?.[0]?.id;
  const { recordOutboundQueueMessage } = await import("./whatsapp-inbox.server");
  await recordOutboundQueueMessage({ phone, body: describeOutbound(out), waMessageId: waMessageId ?? null }).catch(() => undefined);
  return { ok: true, ...(waMessageId ? { waMessageId } : {}) };
}

// ----------------------------------------------------------------------------------------------- leitura

async function loadSurvey(surveyId: string): Promise<Survey | null> {
  const db = await admin();
  const { data } = await db.from("surveys").select("id, slug, title, questions").eq("id", surveyId).maybeSingle();
  if (!data) return null;
  return { ...data, questions: Array.isArray(data.questions) ? data.questions : [] } as Survey;
}

async function loadActiveRun(phone: string): Promise<Run | null> {
  const db = await admin();
  const { data } = await db.from(TABLE_RUNS).select("*").eq("phone", phone).eq("status", "active").maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await db.from(TABLE_RUNS).update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", data.id);
    return null;
  }
  return data as Run;
}

async function saveRun(run: Run, patch: Partial<Record<string, unknown>>): Promise<void> {
  const db = await admin();
  await db.from(TABLE_RUNS).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", run.id);
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || null;

// ----------------------------------------------------------------------------------------------- andar pela árvore

function varsFor(run: Run) {
  return { nome: run.context.nome ?? null, pedido: run.context.pedido ?? null, interesse: interestFromTags(run.tags) };
}

/** Aplica a resposta da etapa atual (etiquetas, ação) e segue até a próxima pergunta que precisa de resposta, ou termina. */
async function applyAnswerAndAdvance(run: Run, survey: Survey, question: TreeQuestion, answer: string): Promise<void> {
  const answers = { ...run.answers, [question.id]: answer };
  const tags = new Set(run.tags);
  const actions = new Set(run.context.actions ?? []);
  for (const t of question.tags ?? []) tags.add(t);
  const branch = question.branches?.[answer];
  for (const t of branch?.tags ?? []) tags.add(t);
  if (branch?.action) actions.add(branch.action);
  if (question.action) actions.add(question.action);
  const current: Run = { ...run, answers, tags: [...tags], context: { ...run.context, actions: [...actions] } };
  await continueFrom(current, survey, nextQuestionId(survey.questions, question, answer));
}

async function continueFrom(run: Run, survey: Survey, startId: string): Promise<void> {
  const byId = new Map(survey.questions.map((q) => [q.id, q]));
  let id = startId;
  let state = run;

  for (let step = 0; step < MAX_STEPS && id !== FIM; step++) {
    const q = byId.get(id);
    if (!q) break;

    if (q.waitForTeam) {
      // A equipe libera depois (ex.: "conseguimos resolver?" só após o atendimento): a run fica parada nesta etapa.
      await saveRun(state, { node_id: q.id, awaiting: null, status: "waiting_team", answers: state.answers, tags: state.tags, context: state.context });
      return;
    }

    const out = buildPrompt(q, state.id, varsFor(state));
    const sent = await sendOut(state.phone, out);
    if (!sent.ok) {
      await saveRun(state, { status: "error", node_id: q.id, answers: state.answers, tags: state.tags, context: { ...state.context, error: sent.error } });
      return;
    }

    if (q.type === "mensagem") {
      const tags = new Set(state.tags);
      for (const t of q.tags ?? []) tags.add(t);
      const actions = new Set(state.context.actions ?? []);
      if (q.action) actions.add(q.action);
      state = { ...state, tags: [...tags], context: { ...state.context, actions: [...actions] } };
      id = nextQuestionId(survey.questions, q, undefined);
      continue;
    }

    // pergunta: espera a resposta da cliente
    await saveRun(state, {
      node_id: q.id,
      awaiting: q.type === "texto_curto" || q.type === "texto_longo" ? "text" : "choice",
      retries: 0,
      answers: state.answers,
      tags: state.tags,
      context: state.context,
    });
    return;
  }

  await completeRun(state, survey);
}

async function completeRun(run: Run, survey: Survey): Promise<void> {
  const db = await admin();
  // tags de etapas "mensagem" já estão em run.tags; junta as do caminho percorrido por garantia
  const tags = [...new Set([...run.tags, ...collectTags(survey.questions, run.answers)])];
  const answers: Record<string, string | string[]> = { ...run.answers };
  if (tags.length > 0) answers[SURVEY_TAGS_KEY] = tags;

  const { data: inserted, error } = await db.from("survey_responses").insert({ survey_id: survey.id, answers, source: "whatsapp" }).select("id").maybeSingle();
  if (error) console.error("[survey-wa] falha ao gravar a resposta:", error.message);

  await applyTagEffects(run.phone, run.customer_id, tags);
  await saveRun(run, {
    status: isDeclinedPath(tags) ? "declined" : "completed",
    awaiting: null,
    answers: run.answers,
    tags,
    context: run.context,
    ...(inserted?.id ? { response_id: inserted.id } : {}),
  });
}

/** Marca a cliente com as etiquetas da pesquisa e aplica os efeitos reais de algumas (opt-out, atendimento humano). */
async function applyTagEffects(phone: string, customerId: string | null, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  const db = await admin();
  let id = customerId;
  if (!id) {
    const { data } = await db.from("shopify_customers").select("id").eq("phone", phone).maybeSingle();
    id = data?.id ?? null;
  }
  if (id) {
    const { data } = await db.from("shopify_customers").select("tags_custom").eq("id", id).maybeSingle();
    const merged = [...new Set([...((data?.tags_custom as string[] | null) ?? []), ...tags])];
    await db.from("shopify_customers").update({ tags_custom: merged }).eq("id", id);
  }
  if (tags.includes(TAG_EFFECTS.optOut)) {
    const { normalizeWhatsappSuppressionPhone } = await import("./whatsapp-opt-out");
    const normalized = normalizeWhatsappSuppressionPhone(phone);
    if (normalized) {
      const now = new Date().toISOString();
      await db.from("whatsapp_suppressions").upsert({ phone: normalized, marketing_opt_out: true, opted_out_at: now, source: "pesquisa", reason: "Pesquisa: não quer mensagens", updated_at: now }, { onConflict: "phone" });
    }
  }
  if (tags.includes(TAG_EFFECTS.humanHandoff)) {
    // chama a atenção da equipe na aba Conversas
    const { data: thread } = await db.from("whatsapp_inbox_threads").select("id, unread_count").eq("phone", phone).maybeSingle();
    if (thread) await db.from("whatsapp_inbox_threads").update({ unread_count: (thread.unread_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", thread.id);
  }
}

// ----------------------------------------------------------------------------------------------- entrada (webhook)

/** Devolve true quando a mensagem pertence a uma pesquisa (então os outros motores não devem responder). */
export async function handleSurveyInbound(message: IncomingSurveyMessage): Promise<boolean> {
  const { toE164 } = await import("./whatsapp-meta.server");
  const phone = toE164(message.from);
  if (!phone) return false;

  const run = await loadActiveRun(phone);
  if (run) return continueRun(run, message);

  // Toque num botão do convite (modelo aprovado)? A mensagem original vem em context.id.
  const clicked = message.button?.text ?? (message.type === "button" ? message.button?.payload : undefined);
  if (clicked && message.context?.id) return startFromInvite(phone, message.context.id, clicked);
  return false;
}

async function startFromInvite(phone: string, invitedWamid: string, clickedLabel: string): Promise<boolean> {
  const db = await admin();
  const { data: recipient } = await db.from("wa_campaign_recipients").select("campaign_id, customer_id, name, params").eq("wa_message_id", invitedWamid).maybeSingle();
  if (!recipient) return false;
  const { data: campaign } = await db.from("wa_campaigns").select("template_name").eq("id", recipient.campaign_id).maybeSingle();
  if (!campaign) return false;
  const { data: config } = await db.from(TABLE_CONFIG).select("survey_id, enabled, expire_hours").eq("template_name", campaign.template_name).eq("enabled", true).maybeSingle();
  if (!config) return false;
  const survey = await loadSurvey(config.survey_id);
  const first = survey?.questions[0];
  if (!survey || !first) return false;

  const params: string[] = Array.isArray(recipient.params) ? recipient.params : [];
  const { data: customer } = recipient.customer_id ? await db.from("shopify_customers").select("id, first_name").eq("id", recipient.customer_id).maybeSingle() : { data: null };
  const pedido = params[1] && /\d/.test(params[1]) ? params[1].replace(/^#/, "") : null;

  const { data: created, error } = await db
    .from(TABLE_RUNS)
    .insert({
      survey_id: survey.id,
      phone,
      customer_id: customer?.id ?? recipient.customer_id ?? null,
      context: { nome: firstName(recipient.name) ?? firstName(customer?.first_name) ?? firstName(params[0]), pedido },
      node_id: first.id,
      awaiting: "choice",
      expires_at: new Date(Date.now() + Math.max(1, Number(config.expire_hours ?? 24)) * 3_600_000).toISOString(),
    })
    .select("*")
    .single();
  if (error || !created) {
    console.error("[survey-wa] não foi possível abrir a pesquisa:", error?.message);
    return false;
  }

  const options = first.options ?? [];
  const idx = matchOption(options, clickedLabel);
  const answer = idx >= 0 ? (options[idx] as string) : clickedLabel;
  await applyAnswerAndAdvance(created as Run, survey, first, answer);
  return true;
}

async function continueRun(run: Run, message: IncomingSurveyMessage): Promise<boolean> {
  // "sair"/"parar" em qualquer ponto encerra a pesquisa e registra o opt-out
  const { registerWhatsappOptOutFromMessage } = await import("./whatsapp-suppression.server");
  const optOut = await registerWhatsappOptOutFromMessage(message);
  if (optOut.optedOut) {
    await saveRun(run, { status: "opted_out", awaiting: null });
    return true;
  }

  const survey = await loadSurvey(run.survey_id);
  const question = survey?.questions.find((q) => q.id === run.node_id);
  if (!survey || !question) {
    await saveRun(run, { status: "error", context: { ...run.context, error: "etapa não encontrada" } });
    return false;
  }

  const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
  const text = message.text?.body ?? reply?.title ?? message.button?.text ?? "";

  if (run.awaiting === "text") {
    if (!text.trim()) return true; // mídia sem texto: segue esperando
    await applyAnswerAndAdvance(run, survey, question, text.trim().slice(0, 1000));
    return true;
  }

  // escolha: clique (id) ou texto digitado
  const options = question.type === "sim_nao" ? ["Sim", "Não"] : question.type === "nota" ? ["1", "2", "3", "4", "5"] : (question.options ?? []);
  const parsed = parseReplyId(reply?.id);
  let idx = -1;
  if (parsed) {
    if (parsed.runId !== run.id || parsed.nodeId !== run.node_id) return true; // clique numa pergunta antiga: ignora
    idx = parsed.optionIndex < options.length ? parsed.optionIndex : -1;
  } else if (text) {
    idx = matchOption(options, text);
  }
  if (idx >= 0) {
    await applyAnswerAndAdvance(run, survey, question, options[idx] as string);
    return true;
  }

  // não entendeu: repete a pergunta até 2 vezes; depois deixa os outros motores atenderem
  if (run.retries >= MAX_RETRIES) {
    await saveRun(run, { status: "expired", awaiting: null });
    return false;
  }
  await saveRun(run, { retries: run.retries + 1 });
  await sendOut(run.phone, { kind: "text", body: "Não consegui entender 😅 Toque numa das opções para responder." });
  await sendOut(run.phone, buildPrompt(question, run.id, varsFor(run)));
  return true;
}

// ----------------------------------------------------------------------------------------------- equipe libera a etapa parada

/** A equipe marcou o atendimento como resolvido: envia a etapa que estava esperando (ex.: "conseguimos resolver?"). */
export async function resumeRunAfterTeam(runId: string): Promise<{ success: boolean; error?: string }> {
  const db = await admin();
  const { data } = await db.from(TABLE_RUNS).select("*").eq("id", runId).eq("status", "waiting_team").maybeSingle();
  if (!data) return { success: false, error: "Esta pesquisa não está esperando a equipe." };
  const run = data as Run;
  const survey = await loadSurvey(run.survey_id);
  const q = survey?.questions.find((x) => x.id === run.node_id);
  if (!survey || !q) return { success: false, error: "Etapa não encontrada." };
  // reabre a janela de 24h? só funciona se a cliente falou com a loja nas últimas 24h; senão a Meta recusa e a run fica em erro.
  const reopened: Run = { ...run, status: "active" };
  await saveRun(run, { status: "active", expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString() });
  const clone: Survey = { ...survey, questions: survey.questions.map((x) => (x.id === q.id ? { ...x, waitForTeam: false } : x)) };
  await continueFrom(reopened, clone, q.id);
  return { success: true };
}

// ----------------------------------------------------------------------------------------------- configuração (UI)

/**
 * Decisões da loja ainda em aberto ([entre colchetes]) nos TEXTOS que vão para a cliente: impedem ligar o envio por WhatsApp.
 * (Placeholders em "ação interna" só descrevem tarefa da equipe e não bloqueiam.)
 */
export function pendingForWhatsapp(questions: TreeQuestion[]): { node: string; text: string }[] {
  const out: { node: string; text: string }[] = [];
  for (const q of questions) for (const p of findPendingPlaceholders(q.label)) out.push({ node: q.id, text: p });
  return out;
}
