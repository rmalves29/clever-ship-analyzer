/** Motor de fluxos conversacionais: dispara quando o CLIENTE manda uma mensagem (clique em botão
 *  de um template, ou palavra-chave em texto livre) — diferente das Automações (automations-engine.server.ts),
 *  que matriculam por segmento. Como o gatilho é sempre uma mensagem recebida, estamos sempre dentro
 *  da janela de atendimento de 24h da Meta, então o envio aqui é texto livre, sem precisar de template
 *  aprovado nem fila de aprovação. Reaproveita `DecisionCondition`/`evaluateDecision` do motor de
 *  automações — as mesmas 6 condições fazem sentido nos dois motores. */

import { type DecisionCondition, type DecisionStep, evaluateDecision } from "./automations-engine.server";

export type ConvSendStep = {
  id: string;
  type: "send";
  waitMinutes: number;
  text: string;
  buttonText: string | null;
  buttonUrl: string | null;
  nextStepId: string | null;
};

/** Etapa de menu: manda até 3 botões de resposta rápida nativos do WhatsApp (diferente do botão de
 *  link — `cta_url` — do ConvSendStep). Não avança sozinha: fica esperando o cliente clicar numa
 *  opção, que decide pra qual etapa seguinte o run vai. */
export type ConvMenuOption = { id: string; label: string; nextStepId: string | null };
export type ConvMenuStep = {
  id: string;
  type: "menu";
  waitMinutes: number;
  text: string;
  options: ConvMenuOption[];
};

export type ConvStep = ConvSendStep | ConvMenuStep | DecisionStep;

type RawStep = {
  id?: unknown;
  type?: unknown;
  waitMinutes?: unknown;
  text?: unknown;
  buttonText?: unknown;
  buttonUrl?: unknown;
  nextStepId?: unknown;
  options?: unknown;
  condition?: unknown;
  yesStepId?: unknown;
  noStepId?: unknown;
};

function parseCondition(raw: unknown): DecisionCondition {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (c["kind"] === "pedido_status") {
    return {
      kind: "pedido_status",
      field: c["field"] === "fulfillment_status" ? "fulfillment_status" : "financial_status",
      value: String(c["value"] ?? ""),
    };
  }
  if (c["kind"] === "segmento") {
    const segmentId = c["segmentId"] ? String(c["segmentId"]) : undefined;
    return { kind: "segmento", segmentType: String(c["segmentType"] ?? ""), ...(segmentId ? { segmentId } : {}) };
  }
  if (c["kind"] === "valor_pedido") {
    const op = c["operator"];
    return { kind: "valor_pedido", operator: op === "gte" || op === "lt" || op === "lte" ? op : "gt", value: Number(c["value"] ?? 0) };
  }
  if (c["kind"] === "localizacao") {
    return { kind: "localizacao", field: c["field"] === "province" ? "province" : "city", value: String(c["value"] ?? "") };
  }
  if (c["kind"] === "tag") return { kind: "tag", value: String(c["value"] ?? "") };
  return { kind: "novo_pedido" };
}

export function parseConvSteps(raw: unknown): ConvStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is RawStep => typeof s === "object" && s !== null)
    .map((s): ConvStep | null => {
      const id = String(s.id ?? "");
      if (!id) return null;
      if (s.type === "decision") {
        return {
          id,
          type: "decision",
          condition: parseCondition(s.condition),
          yesStepId: s.yesStepId ? String(s.yesStepId) : null,
          noStepId: s.noStepId ? String(s.noStepId) : null,
        };
      }
      if (s.type === "menu") {
        const text = String(s.text ?? "");
        if (!text) return null;
        const rawOptions = Array.isArray(s.options) ? s.options : [];
        const options: ConvMenuOption[] = rawOptions
          .slice(0, 3)
          .map((o: unknown) => {
            const opt = (o ?? {}) as { id?: unknown; label?: unknown; nextStepId?: unknown };
            return {
              id: String(opt.id ?? ""),
              label: String(opt.label ?? "").slice(0, 20),
              nextStepId: opt.nextStepId ? String(opt.nextStepId) : null,
            };
          })
          .filter((o) => o.id && o.label);
        if (options.length === 0) return null;
        return { id, type: "menu", waitMinutes: Number(s.waitMinutes ?? 0), text, options };
      }
      const text = String(s.text ?? "");
      if (!text) return null;
      return {
        id,
        type: "send",
        waitMinutes: Number(s.waitMinutes ?? 0),
        text,
        buttonText: s.buttonText ? String(s.buttonText) : null,
        buttonUrl: s.buttonUrl ? String(s.buttonUrl) : null,
        nextStepId: s.nextStepId ? String(s.nextStepId) : null,
      };
    })
    .filter((s): s is ConvStep => s !== null);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Anda a partir de `startStepId` resolvendo decisões na hora, até cair num envio ou no fim do fluxo. */
async function resolveNextConvStep(
  steps: ConvStep[],
  startStepId: string | null,
  run: { customer_id: string; enrolled_at: string },
): Promise<ConvSendStep | ConvMenuStep | null> {
  let currentId = startStepId;
  let guard = 0;
  while (currentId && guard < 50) {
    guard++;
    const step = steps.find((s) => s.id === currentId);
    if (!step) return null;
    if (step.type === "send" || step.type === "menu") return step;
    const isYes = await evaluateDecision(step.condition, run);
    currentId = isYes ? step.yesStepId : step.noStepId;
  }
  return null;
}

/** Envia a etapa via Graph API — sem template, sem aprovação: só é chamado depois que o próprio
 *  cliente mandou mensagem, então estamos na janela de 24h. Três formatos possíveis: menu (até 3
 *  botões de resposta rápida), texto + botão de link (cta_url), ou texto livre. */
async function sendConversationMessage(step: ConvSendStep | ConvMenuStep, phone: string): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  const { loadSettings } = await import("./whatsapp-meta.server");
  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { ok: false, error: "Configure o token de acesso e o Phone Number ID em Configurações." };
  }

  const body =
    step.type === "menu"
      ? {
          messaging_product: "whatsapp",
          to: phone,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: step.text },
            action: { buttons: step.options.slice(0, 3).map((o) => ({ type: "reply", reply: { id: o.id, title: o.label } })) },
          },
        }
      : step.buttonText && step.buttonUrl
        ? {
            messaging_product: "whatsapp",
            to: phone,
            type: "interactive",
            interactive: {
              type: "cta_url",
              body: { text: step.text },
              action: { name: "cta_url", parameters: { display_text: step.buttonText, url: step.buttonUrl } },
            },
          }
        : { messaging_product: "whatsapp", to: phone, type: "text", text: { body: step.text, preview_url: false } };

  const res = await fetch(`https://graph.facebook.com/v20.0/${settings.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[sendConversationMessage] Error", { status: res.status, body: json });
    return { ok: false, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  }
  return { ok: true, waMessageId: json?.messages?.[0]?.id };
}

/** Dispara a etapa atual do run e avança pra próxima (ou completa o fluxo). Reaproveitado tanto
 *  pelo tick agendado quanto pelo disparo imediato da 1ª etapa (`matchIncomingMessage`). */
async function dispatchRunStep(run: { id: string; customer_id: string | null; phone: string; started_at: string }, step: ConvSendStep | ConvMenuStep, steps: ConvStep[]) {
  const supabaseAdmin = await admin();
  const result = await sendConversationMessage(step, run.phone);
  if (!result.ok) {
    await supabaseAdmin
      .from("whatsapp_conversation_runs")
      .update({ status: "failed", last_error: result.error, updated_at: new Date().toISOString() } as never)
      .eq("id", run.id);
    return;
  }

  // Espelha na caixa de entrada (aba Conversas) — sem isso a mensagem do bot fica invisível ali,
  // e a resposta do cliente aparece "do nada", sem a mensagem original que ela está respondendo.
  const { recordOutboundQueueMessage } = await import("./whatsapp-inbox.server");
  const mirroredBody = step.type === "menu" ? `${step.text}\n\n${step.options.map((o) => `• ${o.label}`).join("\n")}` : step.text;
  await recordOutboundQueueMessage({ phone: run.phone, body: mirroredBody, waMessageId: result.waMessageId ?? null }).catch((error) =>
    console.error("Falha ao espelhar mensagem do fluxo conversacional na caixa de entrada:", error),
  );

  if (step.type === "menu") {
    // Não avança sozinho: espera o cliente clicar numa opção (ver matchIncomingMessage).
    await supabaseAdmin
      .from("whatsapp_conversation_runs")
      .update({ current_step_id: step.id, status: "active", next_run_at: null, updated_at: new Date().toISOString() } as never)
      .eq("id", run.id);
    return;
  }

  const next = await resolveNextConvStep(steps, step.nextStepId, {
    customer_id: run.customer_id ?? "",
    enrolled_at: run.started_at,
  });

  const patch = next
    ? {
        current_step_id: next.id,
        next_run_at: new Date(Date.now() + next.waitMinutes * 60_000).toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      }
    : { status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() };

  await supabaseAdmin
    .from("whatsapp_conversation_runs")
    .update(patch as never)
    .eq("id", run.id);
}

/** Chamado pelo tick de 15 em 15 min (mesmo cron das Automações): processa runs cuja espera venceu. */
export async function processDueConversationRuns(): Promise<number> {
  const supabaseAdmin = await admin();
  const { data: dueRuns } = await supabaseAdmin
    .from("whatsapp_conversation_runs")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString());

  const runs = (dueRuns ?? []) as { id: string; flow_id: string; customer_id: string | null; phone: string; current_step_id: string; started_at: string }[];
  if (runs.length === 0) return 0;

  const flowIds = Array.from(new Set(runs.map((r) => r.flow_id)));
  const { data: flows } = await supabaseAdmin.from("whatsapp_conversational_flows").select("id, steps").in("id", flowIds);
  const stepsByFlow = new Map<string, ConvStep[]>();
  for (const f of (flows ?? []) as { id: string; steps: unknown }[]) stepsByFlow.set(f.id, parseConvSteps(f.steps));

  let processed = 0;
  for (const run of runs) {
    const steps = stepsByFlow.get(run.flow_id);
    const step = steps?.find((s) => s.id === run.current_step_id);
    if (!steps || !step || (step.type !== "send" && step.type !== "menu")) {
      await supabaseAdmin
        .from("whatsapp_conversation_runs")
        .update({ status: "failed", last_error: "Etapa não encontrada (fluxo editado)" } as never)
        .eq("id", run.id);
      continue;
    }
    await dispatchRunStep(run, step, steps);
    processed++;
  }
  return processed;
}

type IncomingMessage = {
  from: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { id?: string; title?: string } };
  context?: { id?: string };
};

/** Casa uma mensagem recebida com um fluxo ativo e, se bater, cria o run e dispara a 1ª etapa
 *  (imediatamente se ela não tiver espera configurada — não faz sentido o cliente esperar até
 *  15min pela resposta de um fluxo conversacional). Ignorado se já existe um run ativo pra esse
 *  telefone nesse fluxo (evita disparo duplo por reentrega do webhook da Meta). */
export async function matchIncomingMessage(message: IncomingMessage): Promise<void> {
  // Opt-out tem precedência sobre qualquer palavra-chave/botão de fluxo. Ao receber SAIR/PARAR/etc.,
  // registra a supressão central e não dispara resposta promocional naquela mesma mensagem.
  const { registerWhatsappOptOutFromMessage } = await import("./whatsapp-suppression.server");
  const optOut = await registerWhatsappOptOutFromMessage(message);
  if (optOut.optedOut) return;

  const { toE164 } = await import("./whatsapp-meta.server");
  const phone = toE164(message.from);
  if (!phone) return;

  const supabaseAdmin = await admin();
  const { data: customer } = await supabaseAdmin.from("shopify_customers").select("id").eq("phone", phone).maybeSingle();
  const customerId = (customer as { id: string } | null)?.id ?? null;

  const buttonText = message.button?.text ?? message.interactive?.button_reply?.title;
  const bodyText = message.text?.body;
  const menuReplyId = message.interactive?.button_reply?.id;

  // Se já existe um run ativo esperando o cliente clicar num menu, resolve ali e não abre um run
  // novo procurando gatilho — o clique é resposta a uma pergunta já em andamento, não um gatilho.
  if (menuReplyId) {
    const { data: activeRuns } = await supabaseAdmin
      .from("whatsapp_conversation_runs")
      .select("id, flow_id, customer_id, phone, current_step_id, started_at")
      .eq("phone", phone)
      .eq("status", "active");
    const runsForPhone = (activeRuns ?? []) as { id: string; flow_id: string; customer_id: string | null; phone: string; current_step_id: string; started_at: string }[];
    if (runsForPhone.length > 0) {
      const flowIds = Array.from(new Set(runsForPhone.map((r) => r.flow_id)));
      const { data: runFlows } = await supabaseAdmin.from("whatsapp_conversational_flows").select("id, steps").in("id", flowIds);
      const stepsByRunFlow = new Map<string, ConvStep[]>();
      for (const f of (runFlows ?? []) as { id: string; steps: unknown }[]) stepsByRunFlow.set(f.id, parseConvSteps(f.steps));

      for (const run of runsForPhone) {
        const steps = stepsByRunFlow.get(run.flow_id);
        const currentStep = steps?.find((s) => s.id === run.current_step_id);
        if (!steps || !currentStep || currentStep.type !== "menu") continue;
        const option = currentStep.options.find((o) => o.id === menuReplyId);
        if (!option) continue;

        const nextStep = await resolveNextConvStep(steps, option.nextStepId, { customer_id: run.customer_id ?? "", enrolled_at: run.started_at });
        if (nextStep) await dispatchRunStep(run, nextStep, steps);
        else {
          await supabaseAdmin
            .from("whatsapp_conversation_runs")
            .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
            .eq("id", run.id);
        }
        return;
      }
    }
  }

  const { data: activeFlows } = await supabaseAdmin
    .from("whatsapp_conversational_flows")
    .select("*")
    .eq("ativo", true)
    .order("created_at", { ascending: true });
  const flows = (activeFlows ?? []) as any[];
  if (flows.length === 0) return;

  let matched: any = null;

  if (buttonText && message.context?.id) {
    const { data: recipient } = await supabaseAdmin
      .from("whatsapp_campaign_recipients")
      .select("campaign_id")
      .eq("wa_message_id", message.context.id)
      .maybeSingle();
    const campaignId = (recipient as { campaign_id: string } | null)?.campaign_id;
    let templateName: string | null = null;
    if (campaignId) {
      const { data: campaign } = await supabaseAdmin.from("whatsapp_campaigns").select("template_name").eq("id", campaignId).maybeSingle();
      templateName = (campaign as { template_name: string } | null)?.template_name ?? null;
    }
    matched = flows.find(
      (f) => f.trigger_type === "button_click" && f.trigger_template_name === templateName && (f.trigger_values as string[]).includes(buttonText),
    );
  }

  if (!matched && bodyText) {
    const lower = bodyText.toLowerCase();
    matched = flows.find(
      (f) => f.trigger_type === "keyword" && (f.trigger_values as string[]).some((kw) => lower.includes(kw.toLowerCase())),
    );
  }

  if (!matched) return;

  const steps = parseConvSteps(matched.steps);
  const firstStep = steps[0];
  if (!firstStep || (firstStep.type !== "send" && firstStep.type !== "menu")) return;

  const { data: existingActive } = await supabaseAdmin
    .from("whatsapp_conversation_runs")
    .select("id")
    .eq("flow_id", matched.id)
    .eq("phone", phone)
    .eq("status", "active")
    .maybeSingle();
  if (existingActive) return;

  const startedAt = new Date().toISOString();
  const { data: newRun } = await supabaseAdmin
    .from("whatsapp_conversation_runs")
    .insert({
      flow_id: matched.id,
      customer_id: customerId,
      phone,
      status: "active",
      current_step_id: firstStep.id,
      next_run_at: new Date(Date.now() + firstStep.waitMinutes * 60_000).toISOString(),
      started_at: startedAt,
    } as never)
    .select("id, flow_id, customer_id, phone, current_step_id, started_at")
    .single();
  if (!newRun) return;

  await supabaseAdmin
    .from("whatsapp_conversational_flows")
    .update({ last_run_at: startedAt, total_execucoes: (matched.total_execucoes ?? 0) + 1 } as never)
    .eq("id", matched.id);

  if (firstStep.waitMinutes === 0) {
    await dispatchRunStep(newRun as any, firstStep, steps);
  }
}

const UNANSWERED_CHECK_LIMIT = 20;

/** Última mensagem RECEBIDA de verdade numa thread — ignora clique de botão (message_type
 *  "button"), porque isso é o cliente respondendo ao próprio bot (menu, ou botão de campanha),
 *  não uma pergunta nova pedindo atendimento humano. Se a mais recente for um clique, procura a
 *  próxima mensagem real antes dela; se não achar nenhuma, devolve null. */
async function resolveLastRealInboundAt(supabaseAdmin: any, threadId: string): Promise<string | null> {
  const { data: latest } = await supabaseAdmin
    .from("whatsapp_inbox_messages")
    .select("sent_at, message_type")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return null;
  if (latest.message_type !== "button") return latest.sent_at;

  const { data: real } = await supabaseAdmin
    .from("whatsapp_inbox_messages")
    .select("sent_at")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .neq("message_type", "button")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return real?.sent_at ?? null;
}

/** Chamado no mesmo tick de 15 min de processDueConversationRuns: dispara fluxos com
 *  trigger_type "unanswered_timeout" pras conversas que ficaram X minutos sem resposta HUMANA
 *  (uma resposta do próprio motor conversacional não conta — só quem responde pela aba Conversas,
 *  via sendInboxReply, grava linha "outbound" em whatsapp_inbox_messages). Não duplica disparo pra
 *  quem já foi roteado na mesma janela de silêncio (checa se já existe run desse flow começado
 *  depois da última mensagem recebida), e tem um teto por tick pra não disparar em massa pra
 *  conversas antigas já paradas na primeira vez que o gatilho for ativado. */
export async function checkUnansweredThreads(): Promise<number> {
  const supabaseAdmin = await admin();
  const { data: activeFlows } = await supabaseAdmin
    .from("whatsapp_conversational_flows")
    .select("*")
    .eq("ativo", true)
    .eq("trigger_type", "unanswered_timeout");
  const flows = (activeFlows ?? []) as any[];
  if (flows.length === 0) return 0;

  let dispatched = 0;
  for (const flow of flows) {
    if (dispatched >= UNANSWERED_CHECK_LIMIT) break;
    const timeoutMinutes = Number(flow.trigger_timeout_minutes ?? 0);
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) continue;

    const steps = parseConvSteps(flow.steps);
    const firstStep = steps[0];
    if (!firstStep || (firstStep.type !== "send" && firstStep.type !== "menu")) continue;

    const cutoff = new Date(Date.now() - timeoutMinutes * 60_000).toISOString();
    // Não dá pra filtrar direto por whatsapp_inbox_threads.last_inbound_at <= cutoff: esse campo
    // sobe a cada mensagem recebida, INCLUSIVE clique de botão do próprio bot — sem esse cuidado,
    // toda vez que o cliente clica numa opção do menu o relógio reiniciaria e o bot reenviaria o
    // mesmo menu de novo, num loop. Por isso busca todas as threads com alguma mensagem recebida e
    // resolve, pra cada uma, a última mensagem de verdade (não-botão) antes de decidir.
    const { data: candidateThreads } = await supabaseAdmin
      .from("whatsapp_inbox_threads")
      .select("id, phone, customer_id, last_inbound_at")
      .not("last_inbound_at", "is", null)
      .order("last_inbound_at", { ascending: true })
      .limit(300);
    const threads = (candidateThreads ?? []) as { id: string; phone: string; customer_id: string | null; last_inbound_at: string }[];

    for (const thread of threads) {
      if (dispatched >= UNANSWERED_CHECK_LIMIT) break;

      const lastRealInboundAt = await resolveLastRealInboundAt(supabaseAdmin, thread.id);
      if (!lastRealInboundAt || lastRealInboundAt > cutoff) continue; // sem mensagem de verdade, ou ainda dentro da janela

      const { data: repliedAfter } = await supabaseAdmin
        .from("whatsapp_inbox_messages")
        .select("id")
        .eq("thread_id", thread.id)
        .eq("direction", "outbound")
        .gt("created_at", lastRealInboundAt)
        .limit(1)
        .maybeSingle();
      if (repliedAfter) continue; // humano já respondeu

      const { data: existingRun } = await supabaseAdmin
        .from("whatsapp_conversation_runs")
        .select("id")
        .eq("flow_id", flow.id)
        .eq("phone", thread.phone)
        .gte("started_at", lastRealInboundAt)
        .limit(1)
        .maybeSingle();
      if (existingRun) continue; // já roteado nessa mesma janela de silêncio (cliques em botão não abrem uma nova)

      const startedAt = new Date().toISOString();
      const { data: newRun } = await supabaseAdmin
        .from("whatsapp_conversation_runs")
        .insert({
          flow_id: flow.id,
          customer_id: thread.customer_id ?? null,
          phone: thread.phone,
          status: "active",
          current_step_id: firstStep.id,
          next_run_at: new Date(Date.now() + firstStep.waitMinutes * 60_000).toISOString(),
          started_at: startedAt,
        } as never)
        .select("id, flow_id, customer_id, phone, current_step_id, started_at")
        .single();
      if (!newRun) continue;

      await supabaseAdmin
        .from("whatsapp_conversational_flows")
        .update({ last_run_at: startedAt, total_execucoes: (flow.total_execucoes ?? 0) + 1 } as never)
        .eq("id", flow.id);

      if (firstStep.waitMinutes === 0) {
        await dispatchRunStep(newRun as any, firstStep, steps);
      }
      dispatched++;
    }
  }
  return dispatched;
}
