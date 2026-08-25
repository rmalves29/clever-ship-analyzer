/** Motor real das automações de WhatsApp: enrollment por segmento, sequência de etapas
 *  (esperar + enviar) e estado por cliente pra nunca reenviar duas vezes. Chamado tanto pelo
 *  endpoint de tick (src/server.ts, disparado pelo pg_cron) quanto por "Executar agora". */

export type SendStep = {
  id: string;
  type: "send";
  waitHours: number;
  templateName: string;
  templateLanguage: string;
  messageType: "marketing" | "utility";
  bodyParams: string[];
  couponCode: string | null;
  /** Próxima etapa depois desse envio — null encerra o fluxo pro cliente. */
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

/** Segredo do endpoint de tick (src/server.ts) — comparado contra o header X-Automation-Secret. */
export async function getAutomationTickSecret(): Promise<string | null> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin.from("store_settings").select("automation_tick_secret").limit(1).maybeSingle();
  return ((data as { automation_tick_secret: string | null } | null)?.automation_tick_secret) ?? null;
}

type RawStep = {
  id?: unknown;
  type?: unknown;
  waitHours?: unknown;
  templateName?: unknown;
  templateLanguage?: unknown;
  messageType?: unknown;
  bodyParams?: unknown;
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
  if (c["kind"] === "tag") {
    return { kind: "tag", value: String(c["value"] ?? "") };
  }
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
      return {
        id,
        type: "send",
        waitHours: Number(s.waitHours ?? 0),
        templateName,
        templateLanguage: String(s.templateLanguage ?? "pt_BR"),
        messageType: (s.messageType === "utility" ? "utility" : "marketing") as "marketing" | "utility",
        bodyParams: Array.isArray(s.bodyParams) ? (s.bodyParams as string[]) : [],
        couponCode: (s.couponCode ?? null) as string | null,
        nextStepId: s.nextStepId ? String(s.nextStepId) : null,
      };
    })
    .filter((s): s is AutomationStep => s !== null);
}

/** Avalia uma condição de decisão pra um cliente específico. Exportada pra reuso no motor de
 *  fluxos conversacionais (conversational-flows.server.ts) — mesmas 6 condições fazem sentido
 *  lá também, o único ponto novo naquele motor é o gatilho (mensagem recebida, não segmento). */
export async function evaluateDecision(condition: DecisionCondition, run: { customer_id: string; enrolled_at: string }): Promise<boolean> {
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

  // Segmentos customizados usam o mesmo motor do CRM que campanhas e prévias.
  const { resolveWhatsappSegmentCustomerIds } = await import("./whatsapp-segment-resolver.server");
  const ids = await resolveWhatsappSegmentCustomerIds(condition.segmentType, condition.segmentId);
  return ids.includes(run.customer_id);
}

/** A partir de um step id, resolve decisões em cadeia (instantâneas, sem espera) até cair num
 *  envio (retorna esse SendStep) ou no fim do fluxo (retorna null). */
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

/** Matricula clientes novos do segmento que ainda não têm run nessa automação. Devolve quantos entraram. */
async function enrollNewCustomers(automation: any, steps: AutomationStep[]): Promise<number> {
  const supabaseAdmin = await admin();
  const [{ resolveSegmentRecipients, createCampaignRow }, { resolveWhatsappSegmentCustomerIds }] = await Promise.all([
    import("./whatsapp-meta.server"),
    import("./whatsapp-segment-resolver.server"),
  ]);

  const ids: string[] = await resolveWhatsappSegmentCustomerIds(
    automation.segment_type,
    automation.segment_id || undefined,
  );
  if (ids.length === 0) return 0;

  const { data: existingRuns } = await supabaseAdmin
    .from("whatsapp_automation_runs")
    .select("customer_id")
    .eq("automation_id", automation.id)
    .in("customer_id", ids);
  const existingIds = new Set(((existingRuns ?? []) as { customer_id: string }[]).map((r) => r.customer_id));

  const newIds = ids.filter((id) => !existingIds.has(id));
  if (newIds.length === 0) return 0;

  const recipients = (await resolveSegmentRecipients(automation.segment_type, newIds)) as {
    id: string;
    phone: string;
  }[];
  if (recipients.length === 0) return 0;

  const firstStep = steps[0];
  if (!firstStep || firstStep.type !== "send") return 0;

  if (automation.requer_aprovacao) {
    const created = await createCampaignRow(
      {
        nome: `${automation.nome} — novo lote`,
        segmentType: automation.segment_type,
        segmentId: automation.segment_id || undefined,
        messageType: firstStep.messageType,
        templateName: firstStep.templateName,
        templateLanguage: firstStep.templateLanguage,
        bodyParams: firstStep.bodyParams,
        couponCode: firstStep.couponCode ?? undefined,
        origem: "automacao",
        automationId: automation.id,
        totalDestinatariosOverride: recipients.length,
      },
      "aguardando_aprovacao",
    );
    if (!created.success) return 0;

    const rows = recipients.map((r) => ({
      automation_id: automation.id,
      customer_id: r.id,
      phone: r.phone,
      status: "pending_approval",
      current_step_id: firstStep.id,
      next_run_at: null,
      campaign_id: created.campaignId,
    }));
    await supabaseAdmin
      .from("whatsapp_automation_runs")
      .upsert(rows as never, { onConflict: "automation_id,customer_id", ignoreDuplicates: true });
    return recipients.length;
  }

  const nextRunAt = new Date(Date.now() + firstStep.waitHours * 3_600_000).toISOString();
  const rows = recipients.map((r) => ({
    automation_id: automation.id,
    customer_id: r.id,
    phone: r.phone,
    status: "active",
    current_step_id: firstStep.id,
    next_run_at: nextRunAt,
  }));
  await supabaseAdmin
    .from("whatsapp_automation_runs")
    .upsert(rows as never, { onConflict: "automation_id,customer_id", ignoreDuplicates: true });
  return recipients.length;
}

/** Avança um lote de runs pra próxima etapa (ou marca completed se não houver mais). Reaproveitado
 *  tanto pelo processamento normal (Fase B) quanto pela aprovação manual de um lote pendente.
 *  Cada run resolve seu próprio caminho — decisões dependem do cliente, então dois runs na mesma
 *  etapa atual podem seguir pra etapas diferentes. */
async function advanceRuns(runs: any[], steps: AutomationStep[], campaignId: string | null): Promise<number> {
  const supabaseAdmin = await admin();
  let count = 0;
  for (const r of runs) {
    const current = steps.find((s) => s.id === r.current_step_id);
    const startId = current?.type === "send" ? current.nextStepId : null;
    const next = await resolveNextActiveStep(steps, startId, { customer_id: r.customer_id, enrolled_at: r.enrolled_at });
    const patch = next
      ? {
          current_step_id: next.id,
          next_run_at: new Date(Date.now() + next.waitHours * 3_600_000).toISOString(),
          status: "active",
          campaign_id: campaignId ?? r.campaign_id,
          updated_at: new Date().toISOString(),
        }
      : {
          status: "completed",
          completed_at: new Date().toISOString(),
          campaign_id: campaignId ?? r.campaign_id,
          updated_at: new Date().toISOString(),
        };
    await supabaseAdmin
      .from("whatsapp_automation_runs")
      .update(patch as never)
      .eq("id", r.id);
    count++;
  }
  return count;
}

/** Processa runs cuja espera já venceu: dispara a etapa atual e avança pra próxima. */
async function processDueRuns(automation: any, steps: AutomationStep[]): Promise<number> {
  const supabaseAdmin = await admin();
  const { dispatchCampaign, createCampaignRow } = await import("./whatsapp-meta.server");

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
        .in(
          "id",
          stepRuns.map((r) => r.id),
        );
      continue;
    }

    const customerIds = stepRuns.map((r) => r.customer_id as string);
    const created = await createCampaignRow(
      {
        nome: `${automation.nome} — etapa ${stepId}`,
        segmentType: automation.segment_type,
        segmentId: automation.segment_id || undefined,
        messageType: step.messageType,
        templateName: step.templateName,
        templateLanguage: step.templateLanguage,
        bodyParams: step.bodyParams,
        couponCode: step.couponCode ?? undefined,
        origem: "automacao",
        automationId: automation.id,
        totalDestinatariosOverride: customerIds.length,
      },
      "enviando",
    );
    if (!created.success) continue;

    await dispatchCampaign(created.campaignId, customerIds);
    processed += await advanceRuns(stepRuns, steps, created.campaignId);
  }
  return processed;
}

/** Núcleo do motor: pra cada automação ativa, matricula clientes novos e processa quem já pode
 *  avançar de etapa. `automationId` roda só uma (usado por "Executar agora"); omitido, roda todas. */
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
      .update({
        last_run_at: new Date().toISOString(),
        total_execucoes: (a.total_execucoes ?? 0) + 1,
      } as never)
      .eq("id", a.id);
  }

  return { automationsProcessed, runsProcessed };
}

/** Chamado por `approveCampaign` quando a campanha aprovada é um lote de automação pendente:
 *  avança esses runs pra próxima etapa (ou completed). Não faz nada se não houver runs vinculados. */
export async function advanceRunsForApprovedCampaign(campaignId: string): Promise<number> {
  const supabaseAdmin = await admin();
  const { data: runs } = await supabaseAdmin
    .from("whatsapp_automation_runs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending_approval");
  const runList = (runs ?? []) as any[];
  if (runList.length === 0) return 0;

  const automationId = runList[0].automation_id as string;
  const { data: automation } = await supabaseAdmin
    .from("whatsapp_automations")
    .select("*")
    .eq("id", automationId)
    .maybeSingle();
  if (!automation) return 0;

  const steps = parseSteps((automation as any).steps);
  return advanceRuns(runList, steps, campaignId);
}

/** Chamado por `rejectCampaign`: marca como `failed` os runs pendentes desse lote (não removidos —
 *  a trava UNIQUE(automation_id, customer_id) impede que esses clientes sejam matriculados de novo). */
export async function failRunsForRejectedCampaign(campaignId: string, reason: string): Promise<void> {
  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("whatsapp_automation_runs")
    .update({ status: "failed", last_error: reason, updated_at: new Date().toISOString() } as never)
    .eq("campaign_id", campaignId)
    .eq("status", "pending_approval");
}

/** Contagem de runs por status/etapa — usado nos badges e no "ver funil" da UI. */
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
    if (r.status === "active") byStepActive[r.current_step_id] = (byStepActive[r.current_step_id] ?? 0) + 1;
  }
  return { total: rows.length, byStatus, byStepActive };
}

/** Mesmas métricas, mas de uma vez pra todas as automações — usado na listagem, pra não disparar
 *  uma query por card (evita hook-em-loop e faz uma leitura só). */
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
    if (r.status === "active") entry.byStepActive[r.current_step_id] = (entry.byStepActive[r.current_step_id] ?? 0) + 1;
    result[r.automation_id] = entry;
  }
  return result;
}

/** Chamado pelo endpoint /api/automations/tick (src/server.ts, disparado pelo pg_cron). Roda o
 *  tick de todas as automações e grava uma linha em automation_tick_runs — como o pg_net que
 *  chama esse endpoint é assíncrono, essa tabela é o jeito real de confirmar que o motor rodou. */
export async function runAutomationsTickWithLog() {
  const supabaseAdmin = await admin();
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
