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

export type ConvStep = ConvSendStep | DecisionStep;

type RawStep = {
  id?: unknown;
  type?: unknown;
  waitMinutes?: unknown;
  text?: unknown;
  buttonText?: unknown;
  buttonUrl?: unknown;
  nextStepId?: unknown;
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
): Promise<ConvSendStep | null> {
  let currentId = startStepId;
  let guard = 0;
  while (currentId && guard < 50) {
    guard++;
    const step = steps.find((s) => s.id === currentId);
    if (!step) return null;
    if (step.type === "send") return step;
    const isYes = await evaluateDecision(step.condition, run);
    currentId = isYes ? step.yesStepId : step.noStepId;
  }
  return null;
}

/** Envia a etapa (texto livre + botão CTA opcional) via Graph API — sem template, sem aprovação:
 *  só é chamado depois que o próprio cliente mandou mensagem, então estamos na janela de 24h. */
async function sendConversationMessage(step: ConvSendStep, phone: string): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  const { loadSettings } = await import("./whatsapp-meta.server");
  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { ok: false, error: "Configure o token de acesso e o Phone Number ID em Configurações." };
  }

  const body =
    step.buttonText && step.buttonUrl
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
async function dispatchRunStep(run: { id: string; customer_id: string | null; phone: string; started_at: string }, step: ConvSendStep, steps: ConvStep[]) {
  const supabaseAdmin = await admin();
  const result = await sendConversationMessage(step, run.phone);
  if (!result.ok) {
    await supabaseAdmin
      .from("whatsapp_conversation_runs")
      .update({ status: "failed", last_error: result.error, updated_at: new Date().toISOString() } as never)
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
    if (!steps || !step || step.type !== "send") {
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
  const { toE164 } = await import("./whatsapp-meta.server");
  const phone = toE164(message.from);
  if (!phone) return;

  const supabaseAdmin = await admin();
  const { data: customer } = await supabaseAdmin.from("shopify_customers").select("id").eq("phone", phone).maybeSingle();
  const customerId = (customer as { id: string } | null)?.id ?? null;

  const buttonText = message.button?.text ?? message.interactive?.button_reply?.title;
  const bodyText = message.text?.body;

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
  if (!firstStep || firstStep.type !== "send") return;

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
