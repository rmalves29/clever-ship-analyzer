/** Motor real das automações de WhatsApp: enrollment por segmento, sequência de etapas
 *  (esperar + enviar) e estado por cliente. */

import { automationDeliveryAction } from "./whatsapp-automation-delivery-state";
import { decideAutomationReentry } from "./whatsapp-automation-reentry";
import { resolveWaitInput } from "./automation-wait";

export type SendStep = {
  id: string;
  type: "send";
  waitMinutes: number;
  waitValue?: number;
  waitUnit?: "minutes" | "days";
  templateName: string;
  templateLanguage: string;
  messageType: "marketing" | "utility";
  bodyParams: string[];
  bodyParamTokens: string[];
  couponCode: string | null;
  nextStepId: string | null;
};

export type DecisionCondition =
  | { kind: "novo_pedido" }
  | { kind: "pedido_status"; field: "financial_status" | "fulfillment_status"; value: string }
  | { kind: "segmento"; segmentType: string; segmentId?: string }
  | { kind: "valor_pedido"; operator: "gt" | "gte" | "lt" | "lte"; value: number }
  | { kind: "localizacao"; field: "city" | "province"; value: string }
  | { kind: "tag"; value: string };

export type DecisionStep = {
  id: string;
  type: "decision";
  condition: DecisionCondition;
  yesStepId: string | null;
  noStepId: string | null;
};

export type AutomationStep = SendStep | DecisionStep;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getAutomationTickSecret(): Promise<string | null> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin.from("store_settings").select("automation_tick_secret").limit(1).maybeSingle();
  return ((data as { automation_tick_secret: string | null } | null)?.automation_tick_secret) ?? null;
}

type RawStep = {
  id?: unknown;
  type?: unknown;
  waitMinutes?: unknown;
  waitValue?: unknown;
  waitUnit?: unknown;
  templateName?: unknown;
  templateLanguage?: unknown;
  messageType?: unknown;
  bodyParams?: unknown;
  bodyParamTokens?: unknown;
  couponCode?: unknown;
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
    return {
      kind: "segmento",
      segmentType: String(c["segmentType"] ?? ""),
      ...(segmentId ? { segmentId } : {}),
    };
  }
  if (c["kind"] === "valor_pedido") {
    const op = c["operator"];
    return {
      kind: "valor_pedido",
      operator: op === "gte" || op === "lt" || op === "lte" ? op : "gt",
      value: Number(c["value"] ?? 0),
    };
  }
  if (c["kind"] === "localizacao") {
    return {
      kind: "localizacao",
      field: c["field"] === "province" ? "province" : "city",
      value: String(c["value"] ?? ""),
    };
  }
  if (c["kind"] === "tag") return { kind: "tag", value: String(c["value"] ?? "") };
  return { kind: "novo_pedido" };
}

export function parseSteps(raw: unknown): AutomationStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is RawStep => typeof s === "object" && s !== null)
    .map((s): AutomationStep | null => {
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
      const templateName = String(s.templateName ?? "");
      if (!templateName) return null;
      const resolved = resolveWaitInput(s);
      return {
        id,
        type: "send",
        waitMinutes: resolved.waitMinutes,
        waitValue: resolved.waitValue,
        waitUnit: resolved.waitUnit,
        templateName,
        templateLanguage: String(s.templateLanguage ?? "pt_BR"),
        messageType: s.messageType === "utility" ? "utility" : "marketing",
        bodyParams: Array.isArray(s.bodyParams) ? (s.bodyParams as string[]) : [],
        bodyParamTokens: Array.isArray(s.bodyParamTokens) ? (s.bodyParamTokens as string[]) : [],
        couponCode: (s.couponCode ?? null) as string | null,
        nextStepId: s.nextStepId ? String(s.nextStepId) : null,
      };
    })
    .filter((s): s is AutomationStep => s !== null);
}

export async function evaluateDecision(
  condition: DecisionCondition,
  run: { customer_id: string; enrolled_at: string },
): Promise<boolean> {
  const supabaseAdmin = await admin();

  if (condition.kind === "novo_pedido") {
    const { data } = await supabaseAdmin
      .from("shopify_orders")
      .select("id")
      .eq("customer_id", run.customer_id)
      .gt("created_at", run.enrolled_at)
      .limit(1);
    return (data ?? []).length > 0;
  }

  if (condition.kind === "pedido_status") {
    const { data } = await supabaseAdmin
      .from("shopify_orders")
      .select("financial_status, fulfillment_status")
      .eq("customer_id", run.customer_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const order = data as { financial_status: string | null; fulfillment_status: string | null } | null;
    if (!order) return false;
    return (condition.field === "fulfillment_status" ? order.fulfillment_status : order.financial_status) === condition.value;
  }

  if (condition.kind === "valor_pedido") {
    const { data } = await supabaseAdmin
      .from("shopify_orders")
      .select("total_price")
      .eq("customer_id", run.customer_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const total = Number((data as { total_price: number | null } | null)?.total_price ?? 0);
    if (condition.operator === "gt") return total > condition.value;
    if (condition.operator === "gte") return total >= condition.value;
    if (condition.operator === "lt") return total < condition.value;
    return total <= condition.value;
  }

  if (condition.kind === "localizacao") {
    const { data } = await supabaseAdmin
      .from("shopify_customers")
      .select("city, province")
      .eq("id", run.customer_id)
      .maybeSingle();
    const val = String((data as { city: string | null; province: string | null } | null)?.[condition.field] ?? "").toLowerCase();
    return val === condition.value.trim().toLowerCase();
  }

  if (condition.kind === "tag") {
    const { data } = await supabaseAdmin.from("shopify_customers").select("tags").eq("id", run.customer_id).maybeSingle();
    const tags = ((data as { tags: string[] | null } | null)?.tags ?? []).map((t) => t.toLowerCase());
    return tags.includes(condition.value.trim().toLowerCase());
  }

  const { resolveWhatsappSegmentCustomerIds } = await import("./whatsapp-segment-resolver.server");
  const ids = await resolveWhatsappSegmentCustomerIds(condition.segmentType, condition.segmentId);
  return ids.includes(run.customer_id);
}

export async function resolveNextActiveStep(
  steps: AutomationStep[],
  startStepId: string | null,
  run: { customer_id: string; enrolled_at: string },
): Promise<SendStep | null> {
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

async function enrollNewCustomers(automation: any, steps: AutomationStep[]): Promise<number> {
  const supabaseAdmin = await admin();
  const [
    { resolveSegmentRecipients, createCampaignRow, findPendingApprovalCampaignId, syncCampaignMessageConfig },
    { resolveWhatsappSegmentCustomerIds },
    { captureAutomationEventContext },
  ] =
    await Promise.all([
      import("./whatsapp-meta.server"),
      import("./whatsapp-segment-resolver.server"),
      import("./whatsapp-automation-context.server"),
    ]);

  const ids: string[] = await resolveWhatsappSegmentCustomerIds(automation.segment_type, automation.segment_id || undefined);
  if (ids.length === 0) return 0;

  const recipients = (await resolveSegmentRecipients(automation.segment_type, ids)) as Array<{ id: string; phone: string }>;
  if (recipients.length === 0) return 0;

  const firstStep = steps[0];
  if (!firstStep || firstStep.type !== "send") return 0;

  const recipientsWithContext = await Promise.all(
    recipients.map(async (recipient) => ({
      ...recipient,
      ...(await captureAutomationEventContext(recipient.id)),
    })),
  );

  const { data: existingRuns, error: existingRunsError } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
    .select("customer_id, enrollment_key, context_key, enrolled_at, status")
    .eq("automation_id", automation.id)
    .in("customer_id", recipientsWithContext.map((recipient) => recipient.id));
  if (existingRunsError) throw new Error(`Erro ao consultar histórico de reentrada: ${existingRunsError.message}`);

  const runsByCustomer = new Map<string, any[]>();
  for (const run of existingRuns ?? []) {
    const customerId = String(run.customer_id);
    const list = runsByCustomer.get(customerId) ?? [];
    list.push(run);
    runsByCustomer.set(customerId, list);
  }

  const eligibleRecipients = recipientsWithContext.flatMap((recipient) => {
    const decision = decideAutomationReentry({
      mode: automation.reentry_mode ?? "once",
      contextKey: recipient.contextKey,
      previousRuns: runsByCustomer.get(recipient.id) ?? [],
      reentryAfterDays: automation.reentry_after_days ?? null,
    });
    return decision.eligible ? [{ ...recipient, enrollmentKey: decision.enrollmentKey }] : [];
  });
  if (eligibleRecipients.length === 0) return 0;

  if (automation.requer_aprovacao) {
    // Unifica SEMPRE com a mesma campanha dessa etapa, existindo ela em qualquer status — igual
    // ao envio direto, que soma tudo numa campanha só. A visibilidade de "precisa de aprovação"
    // não depende desse status agregado (aprovarCampaign/rejeitarCampaign checam runs
    // "pending_approval" diretamente) — só reescrevemos o status aqui quando a campanha ainda não
    // teve nenhum envio real, pra manter a UI simples no caso comum sem arriscar sobrescrever um
    // status que reflete envio de verdade (refreshCampaignStatus é quem manda a partir daí).
    const existing = await findPendingApprovalCampaignId(automation.id, firstStep.id);
    let campaignId: string;
    if (existing) {
      campaignId = existing.id;
      const updates: Record<string, unknown> = { total_destinatarios: existing.totalDestinatarios + eligibleRecipients.length };
      if (existing.enviadas === 0) updates["status"] = "aguardando_aprovacao";
      const { error: bumpError } = await (supabaseAdmin.from("whatsapp_campaigns") as any)
        .update(updates)
        .eq("id", campaignId);
      if (bumpError) throw new Error(`Erro ao atualizar campanha de aprovação: ${bumpError.message}`);
      await syncCampaignMessageConfig(campaignId, firstStep);
    } else {
      const created = await createCampaignRow(
        {
          nome: automation.nome,
          segmentType: automation.segment_type,
          segmentId: automation.segment_id || undefined,
          messageType: firstStep.messageType,
          templateName: firstStep.templateName,
          templateLanguage: firstStep.templateLanguage,
          bodyParams: firstStep.bodyParams,
          bodyParamTokens: firstStep.bodyParamTokens,
          couponCode: firstStep.couponCode ?? undefined,
          origem: "automacao",
          automationId: automation.id,
          automationStepId: firstStep.id,
          totalDestinatariosOverride: eligibleRecipients.length,
        },
        "aguardando_aprovacao",
      );
      if (!created.success) return 0;
      campaignId = created.campaignId;
    }

    const rows = eligibleRecipients.map((r) => ({
      automation_id: automation.id,
      customer_id: r.id,
      phone: r.phone,
      status: "pending_approval",
      current_step_id: firstStep.id,
      next_run_at: null,
      campaign_id: campaignId,
      event_context: r.context,
      context_key: r.contextKey,
      enrollment_key: r.enrollmentKey,
    }));
    const { error } = await (supabaseAdmin.from("whatsapp_automation_runs") as any).upsert(rows, {
      onConflict: "automation_id,customer_id,enrollment_key",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Erro ao matricular automação: ${error.message}`);
    return eligibleRecipients.length;
  }

  const nextRunAt = new Date(Date.now() + firstStep.waitMinutes * 60_000).toISOString();
  const rows = eligibleRecipients.map((r) => ({
    automation_id: automation.id,
    customer_id: r.id,
    phone: r.phone,
    status: "active",
    current_step_id: firstStep.id,
    next_run_at: nextRunAt,
    event_context: r.context,
    context_key: r.contextKey,
    enrollment_key: r.enrollmentKey,
  }));
  const { error } = await (supabaseAdmin.from("whatsapp_automation_runs") as any).upsert(rows, {
    onConflict: "automation_id,customer_id,enrollment_key",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`Erro ao matricular automação: ${error.message}`);
  return eligibleRecipients.length;
}

async function advanceRuns(runs: any[], steps: AutomationStep[], campaignId: string | null): Promise<number> {
  const supabaseAdmin = await admin();
  let count = 0;
  for (const r of runs) {
    const current = steps.find((s) => s.id === r.current_step_id);
    const startId = current?.type === "send" ? current.nextStepId : null;
    const next = await resolveNextActiveStep(steps, startId, {
      customer_id: r.customer_id,
      enrolled_at: r.enrolled_at,
    });
    const patch = next
      ? {
          current_step_id: next.id,
          next_run_at: new Date(Date.now() + next.waitMinutes * 60_000).toISOString(),
          status: "active",
          campaign_id: campaignId ?? r.campaign_id,
          last_error: null,
          updated_at: new Date().toISOString(),
        }
      : {
          status: "completed",
          completed_at: new Date().toISOString(),
          next_run_at: null,
          campaign_id: campaignId ?? r.campaign_id,
          last_error: null,
          updated_at: new Date().toISOString(),
        };
    await supabaseAdmin.from("whatsapp_automation_runs").update(patch as never).eq("id", r.id);
    count++;
  }
  return count;
}

async function markRunsWaitingSend(runIds: string[], campaignId: string): Promise<void> {
  if (runIds.length === 0) return;
  const supabaseAdmin = await admin();
  const { error } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
    .update({
      campaign_id: campaignId,
      status: "waiting_send",
      next_run_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", runIds);
  if (error) throw new Error(`Erro ao aguardar confirmação de envio: ${error.message}`);
}

async function processDueRuns(automation: any, steps: AutomationStep[]): Promise<number> {
  const supabaseAdmin = await admin();
  const { dispatchCampaign, createCampaignRow, findAutomationStepCampaignId, syncCampaignMessageConfig } = await import("./whatsapp-meta.server");

  const { data: dueRuns } = await supabaseAdmin
    .from("whatsapp_automation_runs")
    .select("*")
    .eq("automation_id", automation.id)
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString());

  const runs = (dueRuns ?? []) as any[];
  if (runs.length === 0) return 0;

  const byStep = new Map<string, any[]>();
  for (const r of runs) {
    const arr = byStep.get(r.current_step_id) ?? [];
    arr.push(r);
    byStep.set(r.current_step_id, arr);
  }

  let processed = 0;
  for (const [stepId, stepRuns] of byStep) {
    const step = steps.find((s) => s.id === stepId);
    if (!step || step.type !== "send") {
      await supabaseAdmin
        .from("whatsapp_automation_runs")
        .update({ status: "failed", last_error: "Etapa não encontrada (automação editada)" } as never)
        .in("id", stepRuns.map((r) => r.id));
      continue;
    }

    const customerIds = stepRuns.map((r) => r.customer_id as string);

    // Reaproveita a campanha já existente pra essa etapa — disparos sucessivos do tick somam
    // no mesmo registro em vez de criar uma campanha nova a cada execução (refreshCampaignStatus
    // recalcula os totais reais a partir da fila, então não precisa somar totalDestinatarios aqui).
    let campaignId = await findAutomationStepCampaignId(automation.id, stepId);
    if (!campaignId) {
      const created = await createCampaignRow(
        {
          nome: automation.nome,
          segmentType: automation.segment_type,
          segmentId: automation.segment_id || undefined,
          messageType: step.messageType,
          templateName: step.templateName,
          templateLanguage: step.templateLanguage,
          bodyParams: step.bodyParams,
          bodyParamTokens: step.bodyParamTokens,
          couponCode: step.couponCode ?? undefined,
          origem: "automacao",
          automationId: automation.id,
          automationStepId: stepId,
          totalDestinatariosOverride: customerIds.length,
        },
        "enviando",
      );
      if (!created.success) continue;
      campaignId = created.campaignId;
    } else {
      await syncCampaignMessageConfig(campaignId, step);
    }

    const runIds = stepRuns.map((r) => String(r.id));
    await markRunsWaitingSend(runIds, campaignId);
    const dispatchResult = await dispatchCampaign(campaignId, customerIds);
    if (!dispatchResult.success) {
      await (supabaseAdmin.from("whatsapp_automation_runs") as any)
        .update({ status: "failed", last_error: dispatchResult.error ?? "Falha ao enfileirar mensagem", updated_at: new Date().toISOString() })
        .in("id", runIds);
      continue;
    }
    processed += stepRuns.length;
  }
  return processed;
}

export async function runAutomationsTick(options?: { automationId?: string; force?: boolean }) {
  const supabaseAdmin = await admin();
  let query = supabaseAdmin.from("whatsapp_automations").select("*");
  if (options?.automationId) query = query.eq("id", options.automationId);
  const { data } = await query;
  const automations = (data ?? []) as any[];

  let automationsProcessed = 0;
  let runsProcessed = 0;
  for (const a of automations) {
    if (!a.ativo && !options?.force) continue;
    const steps = parseSteps(a.steps);
    if (steps.length === 0) continue;
    automationsProcessed++;
    runsProcessed += await enrollNewCustomers(a, steps);
    runsProcessed += await processDueRuns(a, steps);
    await supabaseAdmin
      .from("whatsapp_automations")
      .update({ last_run_at: new Date().toISOString(), total_execucoes: (a.total_execucoes ?? 0) + 1 } as never)
      .eq("id", a.id);
  }
  return { automationsProcessed, runsProcessed };
}

/** Aprovação libera o lote para a fila, mas não avança nenhuma etapa. */
export async function markRunsWaitingForApprovedCampaign(campaignId: string): Promise<number> {
  const supabaseAdmin = await admin();
  const { data: runs, error } = await supabaseAdmin
    .from("whatsapp_automation_runs")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending_approval");
  if (error) throw new Error(`Erro ao preparar lote aprovado: ${error.message}`);
  const ids = ((runs ?? []) as Array<{ id: string }>).map((run) => run.id);
  await markRunsWaitingSend(ids, campaignId);
  return ids.length;
}

/** Chamado exclusivamente pelo worker da fila após o resultado real do provider. */
export async function handleAutomationQueueResult(params: {
  campaignId: string;
  customerId: string;
  outcome: "sent" | "retry" | "failed";
  error?: string | null;
}): Promise<"advanced" | "waiting" | "failed" | "ignored"> {
  const supabaseAdmin = await admin();
  const { data: run } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
    .select("*")
    .eq("campaign_id", params.campaignId)
    .eq("customer_id", params.customerId)
    .eq("status", "waiting_send")
    .maybeSingle();
  if (!run) return "ignored";

  const action = automationDeliveryAction(params.outcome);
  if (action === "wait") {
    if (params.error) {
      await (supabaseAdmin.from("whatsapp_automation_runs") as any)
        .update({ last_error: params.error, updated_at: new Date().toISOString() })
        .eq("id", run.id);
    }
    return "waiting";
  }

  if (action === "fail") {
    await (supabaseAdmin.from("whatsapp_automation_runs") as any)
      .update({
        status: "failed",
        last_error: params.error || "Falha definitiva no envio do WhatsApp",
        next_run_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return "failed";
  }

  const { data: automation } = await supabaseAdmin
    .from("whatsapp_automations")
    .select("steps")
    .eq("id", run.automation_id)
    .maybeSingle();
  if (!automation) {
    await (supabaseAdmin.from("whatsapp_automation_runs") as any)
      .update({ status: "failed", last_error: "Automação não encontrada após envio", updated_at: new Date().toISOString() })
      .eq("id", run.id);
    return "failed";
  }

  const steps = parseSteps((automation as any).steps);
  await advanceRuns([run], steps, params.campaignId);
  return "advanced";
}

export async function failRunsForRejectedCampaign(campaignId: string, reason: string): Promise<void> {
  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("whatsapp_automation_runs")
    .update({ status: "failed", last_error: reason, updated_at: new Date().toISOString() } as never)
    .eq("campaign_id", campaignId)
    .eq("status", "pending_approval");
}

export async function getAutomationRunMetrics(automationId: string) {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("whatsapp_automation_runs")
    .select("status, current_step_id")
    .eq("automation_id", automationId);
  const rows = (data ?? []) as { status: string; current_step_id: string }[];
  const byStatus: Record<string, number> = {};
  const byStepActive: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.status === "active" || r.status === "waiting_send") byStepActive[r.current_step_id] = (byStepActive[r.current_step_id] ?? 0) + 1;
  }
  return { total: rows.length, byStatus, byStepActive };
}

export async function getAllAutomationRunMetrics(): Promise<
  Record<string, { total: number; byStatus: Record<string, number>; byStepActive: Record<string, number> }>
> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin.from("whatsapp_automation_runs").select("automation_id, status, current_step_id");
  const rows = (data ?? []) as { automation_id: string; status: string; current_step_id: string }[];
  const result: Record<string, { total: number; byStatus: Record<string, number>; byStepActive: Record<string, number> }> = {};
  for (const r of rows) {
    const entry = result[r.automation_id] ?? { total: 0, byStatus: {}, byStepActive: {} };
    entry.total++;
    entry.byStatus[r.status] = (entry.byStatus[r.status] ?? 0) + 1;
    if (r.status === "active" || r.status === "waiting_send") entry.byStepActive[r.current_step_id] = (entry.byStepActive[r.current_step_id] ?? 0) + 1;
    result[r.automation_id] = entry;
  }
  return result;
}

const TICK_LOCK_NAME = "automations_tick";
/** Lease de 5 min: se um tick travar/morrer, o próximo assume depois desse prazo. */
const TICK_LOCK_LEASE_MS = 5 * 60_000;

/** Trava atômica (UPDATE condicional) pra impedir dois ticks simultâneos no ciclo de 1 min. */
async function acquireTickLease(): Promise<string | null> {
  const supabaseAdmin = await admin();
  const holder = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("automation_tick_locks" as never)
    .update({ locked_until: new Date(Date.now() + TICK_LOCK_LEASE_MS).toISOString(), holder, updated_at: now } as never)
    .eq("name", TICK_LOCK_NAME)
    .lt("locked_until", now)
    .select("holder");
  const rows = (data ?? []) as { holder: string }[];
  return rows.length > 0 ? holder : null;
}

async function releaseTickLease(holder: string) {
  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("automation_tick_locks" as never)
    .update({ locked_until: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
    .eq("name", TICK_LOCK_NAME)
    .eq("holder", holder);
}

export async function runAutomationsTickWithLog() {
  const supabaseAdmin = await admin();

  const holder = await acquireTickLease();
  if (!holder) {
    return { skipped: true as const, reason: "tick_already_running", automationsProcessed: 0, runsProcessed: 0 };
  }

  const { data: logRow } = await supabaseAdmin
    .from("automation_tick_runs")
    .insert({ started_at: new Date().toISOString() } as never)
    .select("id")
    .single();
  const logId = (logRow as { id: string } | null)?.id;

  try {
    const result = await runAutomationsTick();
    const { processDueConversationRuns } = await import("./conversational-flows.server");
    await processDueConversationRuns();
    if (logId) {
      await supabaseAdmin
        .from("automation_tick_runs")
        .update({
          finished_at: new Date().toISOString(),
          automations_processed: result.automationsProcessed,
          runs_processed: result.runsProcessed,
        } as never)
        .eq("id", logId);
    }
    return result;
  } catch (error) {
    if (logId) {
      await supabaseAdmin
        .from("automation_tick_runs")
        .update({
          finished_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        } as never)
        .eq("id", logId);
    }
    throw error;
  }
}
