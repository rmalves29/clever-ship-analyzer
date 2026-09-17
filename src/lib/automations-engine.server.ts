/** Motor real das automações de WhatsApp: enrollment por segmento, sequência de etapas
 *  (esperar + enviar) e estado por cliente. */

import { automationDeliveryAction } from "./whatsapp-automation-delivery-state";
import { decideAutomationReentry } from "./whatsapp-automation-reentry";
import { resolveWaitInput } from "./automation-wait";
import {
  parseCashbackSendSchedule,
  pickInitialCashbackStep,
  pickNextCashbackStep,
  type CashbackSendSchedule,
} from "./cashback-automation-schedule";

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
  schedule?: CashbackSendSchedule;
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
  schedule?: unknown;
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
      const schedule = parseCashbackSendSchedule(s.schedule);
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
        ...(schedule ? { schedule } : {}),
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

const OPEN_RUN_STATUSES = ["pending_approval", "active", "waiting_send"] as const;
const SPECIAL_QUERY_PAGE_SIZE = 500;

function getAutomationKind(automation: any): "segment" | "rfm" | "cashback" {
  if (automation?.automation_kind === "rfm" || automation?.automation_kind === "cashback") {
    return automation.automation_kind;
  }
  return "segment";
}

async function exitOtherRFMRuns(customerIds: string[]): Promise<void> {
  if (customerIds.length === 0) return;
  const supabaseAdmin = await admin();
  const { data: automationRows } = await (supabaseAdmin.from("whatsapp_automations") as any)
    .select("id")
    .eq("automation_kind", "rfm");
  const automationIds = (automationRows ?? []).map((row: any) => String(row.id));
  if (automationIds.length === 0) return;

  for (let start = 0; start < customerIds.length; start += 200) {
    const batch = customerIds.slice(start, start + 200);
    const { data: runs } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
      .select("id")
      .in("automation_id", automationIds)
      .in("customer_id", batch)
      .in("status", [...OPEN_RUN_STATUSES]);
    await markRunsExited(
      (runs ?? []).map((run: any) => String(run.id)),
      "Cliente entrou em outro segmento RFM.",
    );
  }
}

async function enrollRFMCustomers(automation: any, steps: AutomationStep[]): Promise<number> {
  const segment = String(automation?.trigger_config?.rfmSegment ?? "").trim();
  const firstStep = steps[0];
  if (!segment || !firstStep || firstStep.type !== "send") return 0;

  const supabaseAdmin = await admin();
  const rows: Array<{ id: string; phone: string; rfm_segment_changed_at: string | null }> = [];
  for (let page = 0; ; page++) {
    const { data, error } = await (supabaseAdmin.from("shopify_customers") as any)
      .select("id, phone, rfm_segment_changed_at")
      .eq("rfm_segment", segment)
      .not("phone", "is", null)
      .order("id", { ascending: true })
      .range(page * SPECIAL_QUERY_PAGE_SIZE, page * SPECIAL_QUERY_PAGE_SIZE + SPECIAL_QUERY_PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao carregar clientes RFM (${segment}): ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < SPECIAL_QUERY_PAGE_SIZE) break;
  }
  if (rows.length === 0) return 0;

  const { toE164 } = await import("./whatsapp-meta.server");
  const valid = rows
    .map((row) => ({ ...row, phone: toE164(row.phone) }))
    .filter((row) => row.phone && row.phone.length >= 12);
  if (valid.length === 0) return 0;

  const { data: existingRows, error: existingError } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
    .select("customer_id, enrollment_key")
    .eq("automation_id", automation.id);
  if (existingError) throw new Error(`Erro ao consultar entradas RFM: ${existingError.message}`);
  const existingKeys = new Set(
    (existingRows ?? []).map((row: any) => `${String(row.customer_id)}|${String(row.enrollment_key)}`),
  );

  const candidates = valid.flatMap((row) => {
    const entryAt = row.rfm_segment_changed_at || "legacy";
    const enrollmentKey = `rfm-entry:${entryAt}`;
    return existingKeys.has(`${row.id}|${enrollmentKey}`) ? [] : [{ ...row, enrollmentKey }];
  });
  if (candidates.length === 0) return 0;

  await exitOtherRFMRuns(candidates.map((row) => row.id));
  const { captureAutomationEventContext } = await import("./whatsapp-automation-context.server");
  const inserts = await Promise.all(
    candidates.map(async (row) => {
      const captured = await captureAutomationEventContext(row.id);
      const entryTime = new Date(row.rfm_segment_changed_at ?? Date.now()).getTime();
      const dueTime = Number.isFinite(entryTime)
        ? Math.max(Date.now(), entryTime + firstStep.waitMinutes * 60_000)
        : Date.now() + firstStep.waitMinutes * 60_000;
      return {
        automation_id: automation.id,
        customer_id: row.id,
        phone: row.phone,
        status: "active",
        current_step_id: firstStep.id,
        next_run_at: new Date(dueTime).toISOString(),
        event_context: { ...captured.context, automationEnrollmentKey: row.enrollmentKey },
        context_key: captured.contextKey,
        enrollment_key: row.enrollmentKey,
      };
    }),
  );
  const { error } = await (supabaseAdmin.from("whatsapp_automation_runs") as any).upsert(inserts, {
    onConflict: "automation_id,customer_id,enrollment_key",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`Erro ao matricular clientes RFM: ${error.message}`);
  return inserts.length;
}

async function enrollCashbackCustomers(automation: any, steps: AutomationStep[]): Promise<number> {
  const sendSteps = steps.filter((step): step is SendStep => step.type === "send");
  const firstStep = sendSteps[0];
  if (!firstStep || !firstStep.schedule) return 0;

  const supabaseAdmin = await admin();
  const now = new Date();
  const coupons: Array<{
    id: number;
    shopify_order_id: string;
    customer_row_id: string;
    starts_at: string;
    ends_at: string;
  }> = [];
  for (let page = 0; ; page++) {
    const { data, error } = await (supabaseAdmin.from("cashback_coupons") as any)
      .select("id, shopify_order_id, customer_row_id, starts_at, ends_at")
      .in("status", ["pending", "active"])
      .not("customer_row_id", "is", null)
      .gt("ends_at", now.toISOString())
      .order("id", { ascending: true })
      .range(page * SPECIAL_QUERY_PAGE_SIZE, page * SPECIAL_QUERY_PAGE_SIZE + SPECIAL_QUERY_PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao carregar cashbacks para lembrete: ${error.message}`);
    if (!data?.length) break;
    coupons.push(...data);
    if (data.length < SPECIAL_QUERY_PAGE_SIZE) break;
  }
  if (coupons.length === 0) return 0;

  const { data: existingRows, error: existingError } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
    .select("customer_id, enrollment_key, status")
    .eq("automation_id", automation.id);
  if (existingError) throw new Error(`Erro ao consultar lembretes de cashback: ${existingError.message}`);
  const existingKeys = new Set((existingRows ?? []).map((row: any) => String(row.enrollment_key)));
  const customersWithOpenRun = new Set(
    (existingRows ?? [])
      .filter((row: any) => OPEN_RUN_STATUSES.includes(row.status))
      .map((row: any) => String(row.customer_id)),
  );
  const reservedCustomers = new Set(customersWithOpenRun);
  const pendingCoupons = coupons
    .sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime())
    .filter((coupon) => {
      if (existingKeys.has(`cashback:${coupon.id}`) || reservedCustomers.has(coupon.customer_row_id)) return false;
      reservedCustomers.add(coupon.customer_row_id);
      return true;
    });
  if (pendingCoupons.length === 0) return 0;

  const customerIds = [...new Set(pendingCoupons.map((coupon) => coupon.customer_row_id))];
  const phones = new Map<string, string>();
  const { toE164 } = await import("./whatsapp-meta.server");
  for (let start = 0; start < customerIds.length; start += 200) {
    const { data } = await (supabaseAdmin.from("shopify_customers") as any)
      .select("id, phone")
      .in("id", customerIds.slice(start, start + 200));
    for (const customer of data ?? []) {
      const phone = toE164(customer.phone);
      if (phone && phone.length >= 12) phones.set(String(customer.id), phone);
    }
  }

  const { captureAutomationEventContext } = await import("./whatsapp-automation-context.server");
  const inserts = (
    await Promise.all(
      pendingCoupons.map(async (coupon) => {
        const phone = phones.get(coupon.customer_row_id);
        if (!phone) return null;
        const captured = await captureAutomationEventContext(coupon.customer_row_id, {
          orderId: coupon.shopify_order_id,
        });
        if (!captured.context.cashback) return null;
        const picked = pickInitialCashbackStep(sendSteps, firstStep.id, captured.context, now);
        if (!picked) return null;
        return {
          automation_id: automation.id,
          customer_id: coupon.customer_row_id,
          phone,
          status: "active",
          current_step_id: picked.step.id,
          next_run_at: picked.dueAt.toISOString(),
          event_context: {
            ...captured.context,
            automationEnrollmentKey: `cashback:${coupon.id}`,
          },
          context_key: captured.contextKey,
          enrollment_key: `cashback:${coupon.id}`,
        };
      }),
    )
  ).filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (inserts.length === 0) return 0;

  const { error } = await (supabaseAdmin.from("whatsapp_automation_runs") as any).upsert(inserts, {
    onConflict: "automation_id,customer_id,enrollment_key",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`Erro ao matricular lembretes de cashback: ${error.message}`);
  return inserts.length;
}

async function markRunsExited(runIds: string[], reason: string): Promise<number> {
  if (runIds.length === 0) return 0;
  const supabaseAdmin = await admin();
  let updated = 0;
  for (let start = 0; start < runIds.length; start += 200) {
    const ids = runIds.slice(start, start + 200);
    const { data: openRuns } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
      .select("id, campaign_id, customer_id, event_context")
      .in("id", ids)
      .in("status", [...OPEN_RUN_STATUSES]);
    const { data, error } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
      .update({
        status: "exited",
        next_run_at: null,
        completed_at: new Date().toISOString(),
        last_error: reason,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids)
      .in("status", [...OPEN_RUN_STATUSES])
      .select("id");
    if (error) throw new Error(`Erro ao encerrar execucao de automacao: ${error.message}`);
    updated += data?.length ?? 0;

    // Se a mensagem ainda não saiu do worker, cancela o job correspondente. Um job já
    // marcado como "sending" pode estar em trânsito e não é alterado para evitar corrida.
    for (const run of openRuns ?? []) {
      if (!run.campaign_id) continue;
      const eventKey = String(
        run.event_context?.automationEnrollmentKey ??
          run.event_context?.order?.id ??
          run.event_context?.checkout?.id ??
          "",
      );
      let recipientQuery = (supabaseAdmin.from("wa_campaign_recipients") as any)
        .select("id")
        .eq("campaign_id", run.campaign_id)
        .eq("customer_id", run.customer_id);
      recipientQuery = eventKey ? recipientQuery.eq("event_key", eventKey) : recipientQuery.eq("event_key", "");
      const { data: recipients } = await recipientQuery;
      const recipientIds = (recipients ?? []).map((recipient: any) => String(recipient.id));
      if (recipientIds.length === 0) continue;
      const { data: cancelledJobs } = await (supabaseAdmin.from("wa_jobs") as any)
        .update({ status: "cancelled", error: reason, locked_by: null, locked_at: null })
        .in("recipient_id", recipientIds)
        .in("status", ["queued", "retry_wait"])
        .select("recipient_id");
      const cancelledRecipientIds = (cancelledJobs ?? []).map((job: any) => String(job.recipient_id));
      if (cancelledRecipientIds.length > 0) {
        await (supabaseAdmin.from("wa_campaign_recipients") as any)
          .update({ status: "cancelled", error_message: reason })
          .in("id", cancelledRecipientIds);
      }
    }
  }
  return updated;
}

async function cleanupRFMRunMembership(automation: any): Promise<number> {
  const segment = String(automation?.trigger_config?.rfmSegment ?? "").trim();
  if (!segment) return 0;
  const supabaseAdmin = await admin();
  const { data: runs, error } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
    .select("id, customer_id")
    .eq("automation_id", automation.id)
    .in("status", [...OPEN_RUN_STATUSES]);
  if (error) throw new Error(`Erro ao conferir saidas RFM: ${error.message}`);
  if (!runs?.length) return 0;

  const customerIds = [...new Set(runs.map((run: any) => String(run.customer_id)))];
  const currentSegment = new Map<string, string | null>();
  for (let start = 0; start < customerIds.length; start += 200) {
    const { data } = await (supabaseAdmin.from("shopify_customers") as any)
      .select("id, rfm_segment")
      .in("id", customerIds.slice(start, start + 200));
    for (const customer of data ?? []) currentSegment.set(String(customer.id), customer.rfm_segment ?? null);
  }
  const staleIds = runs
    .filter((run: any) => currentSegment.get(String(run.customer_id)) !== segment)
    .map((run: any) => String(run.id));
  return markRunsExited(staleIds, `Cliente saiu do segmento RFM ${segment}.`);
}

function cashbackCouponIdFromRun(run: any): number | null {
  const contextId = Number(run?.event_context?.cashback?.id);
  if (Number.isFinite(contextId) && contextId > 0) return contextId;
  const match = /^cashback:(\d+)$/.exec(String(run?.enrollment_key ?? ""));
  return match ? Number(match[1]) : null;
}

async function cleanupCashbackRuns(automation: any): Promise<number> {
  const supabaseAdmin = await admin();
  const { data: runs, error } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
    .select("id, enrollment_key, event_context")
    .eq("automation_id", automation.id)
    .in("status", [...OPEN_RUN_STATUSES]);
  if (error) throw new Error(`Erro ao conferir lembretes de cashback: ${error.message}`);
  if (!runs?.length) return 0;

  const couponIds = [...new Set(runs.map(cashbackCouponIdFromRun).filter((id: number | null): id is number => id !== null))];
  const openIds = new Set<number>();
  if (couponIds.length > 0) {
    for (let start = 0; start < couponIds.length; start += 200) {
      const { data } = await (supabaseAdmin.from("cashback_coupons") as any)
        .select("id, status, ends_at")
        .in("id", couponIds.slice(start, start + 200))
        .in("status", ["pending", "active"])
        .gt("ends_at", new Date().toISOString());
      for (const coupon of data ?? []) openIds.add(Number(coupon.id));
    }
  }
  const staleIds = runs
    .filter((run: any) => {
      const couponId = cashbackCouponIdFromRun(run);
      return couponId === null || !openIds.has(couponId);
    })
    .map((run: any) => String(run.id));
  return markRunsExited(staleIds, "Cashback utilizado, cancelado ou expirado.");
}

async function cleanupLifecycleRuns(automation: any): Promise<number> {
  const kind = getAutomationKind(automation);
  if (kind === "rfm") return cleanupRFMRunMembership(automation);
  if (kind === "cashback") return cleanupCashbackRuns(automation);
  return 0;
}

async function enrollNewCustomers(automation: any, steps: AutomationStep[]): Promise<number> {
  const kind = getAutomationKind(automation);
  if (kind === "rfm") return enrollRFMCustomers(automation, steps);
  if (kind === "cashback") return enrollCashbackCustomers(automation, steps);

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

  // Consulta barata (sem capturar contexto de evento) primeiro: descarta quem já tem qualquer
  // histórico nessa automação antes de pagar o custo pesado de captureAutomationEventContext
  // (pedido + itens + entrega + checkout + cashback, vários round-trips por cliente). Essencial
  // pra segmentos grandes e estáveis (ex. tag de pop-up com >1000 clientes): sem isso, todo tick
  // reprocessa o contexto completo de todo mundo — inclusive quem já está enrollado há meses —
  // e o volume de chamadas em paralelo trava a automação inteira num timeout, não só um "Bad
  // Request" de URL grande demais (o mesmo motivo pelo qual essa consulta é paginada em lotes
  // de 200, como `enrollRFMCustomers`/`enrollCashbackCustomers` já fazem).
  const recipientIds = recipients.map((recipient) => recipient.id);
  const existingRuns: any[] = [];
  for (let start = 0; start < recipientIds.length; start += 200) {
    const batch = recipientIds.slice(start, start + 200);
    const { data, error: existingRunsError } = await (supabaseAdmin.from("whatsapp_automation_runs") as any)
      .select("customer_id, enrollment_key, context_key, enrolled_at, status")
      .eq("automation_id", automation.id)
      .in("customer_id", batch);
    if (existingRunsError) throw new Error(`Erro ao consultar histórico de reentrada: ${existingRunsError.message}`);
    existingRuns.push(...(data ?? []));
  }

  const runsByCustomer = new Map<string, any[]>();
  for (const run of existingRuns) {
    const customerId = String(run.customer_id);
    const list = runsByCustomer.get(customerId) ?? [];
    list.push(run);
    runsByCustomer.set(customerId, list);
  }

  const reentryMode = automation.reentry_mode ?? "once";
  const ACTIVE_RUN_STATUSES = ["pending_approval", "active", "waiting_send"];
  // Pré-filtro sem custo de contexto: vale pra qualquer modo (execução em aberto sempre bloqueia
  // reentrada) e, no modo "once" — o único que não olha pro contextKey pra decidir — qualquer
  // histórico anterior já é suficiente pra excluir, então nem precisa capturar contexto.
  const candidates = recipients.filter((recipient) => {
    const previousRuns = runsByCustomer.get(recipient.id) ?? [];
    if (previousRuns.some((run) => ACTIVE_RUN_STATUSES.includes(String(run.status ?? "")))) return false;
    if (reentryMode === "once" && previousRuns.length > 0) return false;
    return true;
  });
  if (candidates.length === 0) return 0;

  // Concorrência limitada: mesmo pra uma automação nova com um segmento grande (primeira leva
  // real, sem histórico pra filtrar), capturar contexto de centenas/milhares de clientes de uma
  // vez estoura o limite de subrequests simultâneos do Worker e trava em vez de falhar rápido.
  const CONTEXT_CAPTURE_CONCURRENCY = 25;
  const candidatesWithContext: Array<{ id: string; phone: string; context: unknown; contextKey: string }> = [];
  for (let start = 0; start < candidates.length; start += CONTEXT_CAPTURE_CONCURRENCY) {
    const batch = candidates.slice(start, start + CONTEXT_CAPTURE_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (recipient) => ({
        ...recipient,
        ...(await captureAutomationEventContext(recipient.id)),
      })),
    );
    candidatesWithContext.push(...(batchResults as typeof candidatesWithContext));
  }

  const eligibleRecipients = candidatesWithContext.flatMap((recipient) => {
    const decision = decideAutomationReentry({
      mode: reentryMode,
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
    let next: SendStep | null;
    let scheduledAt: Date | null = null;
    if (current?.type === "send" && current.schedule) {
      const scheduled = pickNextCashbackStep(
        steps.filter((step): step is SendStep => step.type === "send"),
        startId,
        r.event_context ?? {},
      );
      next = scheduled?.step ?? null;
      scheduledAt = scheduled?.dueAt ?? null;
    } else {
      next = await resolveNextActiveStep(steps, startId, {
        customer_id: r.customer_id,
        enrolled_at: r.enrolled_at,
      });
    }
    const patch = next
      ? {
          current_step_id: next.id,
          next_run_at: (scheduledAt ?? new Date(Date.now() + next.waitMinutes * 60_000)).toISOString(),
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

    let eligibleRuns = stepRuns;
    if (step.messageType === "marketing") {
      const { getSuppressedWhatsappPhones } = await import("./whatsapp-suppression.server");
      const suppressedPhones = await getSuppressedWhatsappPhones(stepRuns.map((run) => String(run.phone ?? "")));
      const suppressedRuns = stepRuns.filter((run) => suppressedPhones.has(String(run.phone ?? "")));
      if (suppressedRuns.length > 0) {
        await (supabaseAdmin.from("whatsapp_automation_runs") as any)
          .update({
            status: "failed",
            next_run_at: null,
            last_error: "opt-out de marketing",
            updated_at: new Date().toISOString(),
          })
          .in("id", suppressedRuns.map((run) => run.id));
        processed += suppressedRuns.length;
        const suppressedIds = new Set(suppressedRuns.map((run) => String(run.id)));
        eligibleRuns = stepRuns.filter((run) => !suppressedIds.has(String(run.id)));
      }
    }
    if (eligibleRuns.length === 0) continue;

    const customerIds = eligibleRuns.map((r) => r.customer_id as string);

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

    const runIds = eligibleRuns.map((r) => String(r.id));
    await markRunsWaitingSend(runIds, campaignId);
    const dispatchResult = await dispatchCampaign(campaignId, customerIds);
    if (!dispatchResult.success) {
      await (supabaseAdmin.from("whatsapp_automation_runs") as any)
        .update({ status: "failed", last_error: dispatchResult.error ?? "Falha ao enfileirar mensagem", updated_at: new Date().toISOString() })
        .in("id", runIds);
      continue;
    }
    processed += eligibleRuns.length;
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
  const failures: Array<{ automationId: string; nome: string; error: string }> = [];
  for (const a of automations) {
    if (!a.ativo && !options?.force) continue;
    const steps = parseSteps(a.steps);
    if (steps.length === 0) continue;
    // Isolado por automação: uma falha aqui (ex. segmento grande demais pra uma consulta) não
    // pode travar o tick inteiro e impedir as automações seguintes de avançar etapa.
    try {
      automationsProcessed++;
      runsProcessed += await cleanupLifecycleRuns(a);
      runsProcessed += await enrollNewCustomers(a, steps);
      runsProcessed += await processDueRuns(a, steps);
      await supabaseAdmin
        .from("whatsapp_automations")
        .update({ last_run_at: new Date().toISOString(), total_execucoes: (a.total_execucoes ?? 0) + 1, last_error: null } as never)
        .eq("id", a.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ automationId: a.id, nome: a.nome, error: message });
      await supabaseAdmin
        .from("whatsapp_automations")
        .update({ last_run_at: new Date().toISOString(), last_error: message } as never)
        .eq("id", a.id);
    }
  }
  if (failures.length > 0) {
    console.error("[automations-engine] Falhas isoladas por automação neste tick:", failures);
  }
  return { automationsProcessed, runsProcessed, failures };
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
    const { processDueConversationRuns, checkUnansweredThreads } = await import("./conversational-flows.server");
    await processDueConversationRuns();
    await checkUnansweredThreads();
    if (logId) {
      await supabaseAdmin
        .from("automation_tick_runs")
        .update({
          finished_at: new Date().toISOString(),
          automations_processed: result.automationsProcessed,
          runs_processed: result.runsProcessed,
          error: result.failures.length > 0
            ? result.failures.map((f) => `${f.nome} (${f.automationId}): ${f.error}`).join(" | ")
            : null,
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
  } finally {
    await releaseTickLease(holder);
  }
}
