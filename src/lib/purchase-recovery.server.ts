/**
 * Recuperação contínua de compras não concluídas — parte com banco/Meta.
 * Reaproveita o tick de automações (descoberta, gate Meta, conferência e enfileiramento),
 * a fila wa_campaigns/wa_campaign_recipients/wa_jobs e o worker (que reconfere antes de enviar).
 */
import {
  OPEN_ATTEMPT_STATUSES,
  PURCHASE_RECOVERY_KIND,
  RECOVERY_TEMPLATES,
  allowedStoreHosts,
  evaluateRecoveryGuards,
  evaluateTemplateGate,
  firstNameForMessage,
  isWithinRecoveryWindow,
  nextRecoverySendTime,
  parseRecoveryConfig,
  phoneKey,
  phoneVariants,
  reconcileAttemptWithQueue,
  recoveryParams,
  recoveryProcessingBlocker,
  selectAttemptsForEnrollment,
  validateRecoveryUrl,
  type AttemptCandidate,
  type ExistingAttempt,
  type GuardOrder,
  type RecoveryConfig,
  type RecoveryGuardFacts,
  type RecoveryStage,
  type TemplateGate,
} from "./purchase-recovery";

const ATTEMPTS = "purchase_recovery_attempts";
const AUTOMATION_BLOCK_TAG = "sem-automacao";
const OPEN_RUN_STATUSES = ["pending_approval", "active", "waiting_send"];
const DISCOVERY_LOOKBACK_DAYS = 7;
const MAX_PER_STAGE_PER_TICK = 100;
/** Gate gravado pelo tick vale por este tempo para o worker; depois disso o worker adia. */
const GATE_MAX_AGE_MS = 15 * 60_000;

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const uniq = <T,>(list: (T | null | undefined)[]): T[] => [...new Set(list.filter((v): v is T => v !== null && v !== undefined && v !== ("" as unknown)))];

export type AttemptDbRow = {
  id: string;
  automation_id: string;
  attempt_key: string;
  source: "checkout" | "order";
  source_id: string;
  cohort: "initial" | "continuous";
  customer_id: string | null;
  email: string | null;
  phone: string | null;
  phone_key: string | null;
  first_name: string | null;
  recovery_url: string | null;
  attempt_at: string;
  eligible_at: string;
  status: string;
  exit_reason: string | null;
  initial_recipient_id: string | null;
  initial_sent_at: string | null;
  reminder_due_at: string | null;
  reminder_recipient_id: string | null;
  reminder_sent_at: string | null;
  last_error: string | null;
  created_at: string;
};

async function loadStoreHosts(): Promise<string[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("store_settings")
    .select("storefront_domain, shopify_store_domain")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Erro ao ler domínio da loja: ${error.message}`);
  const hosts = allowedStoreHosts(data?.storefront_domain, data?.shopify_store_domain);
  if (hosts.length === 0) throw new Error("Domínio da loja não configurado — sem como validar links.");
  return hosts;
}

async function patchTriggerConfig(automationId: string, patch: Record<string, unknown>, extra?: Record<string, unknown>) {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin.from("whatsapp_automations").select("trigger_config").eq("id", automationId).maybeSingle();
  if (error) throw new Error(`Erro ao ler configuração do fluxo: ${error.message}`);
  const next = { ...((data?.trigger_config ?? {}) as Record<string, unknown>), ...patch };
  const { error: updateError } = await supabaseAdmin
    .from("whatsapp_automations")
    .update({ trigger_config: next, updated_at: new Date().toISOString(), ...(extra ?? {}) })
    .eq("id", automationId);
  if (updateError) throw new Error(`Erro ao salvar estado do fluxo: ${updateError.message}`);
}

// ---------------------------------------------------------------------------
// Gate dos modelos (status REAL na Meta)
// ---------------------------------------------------------------------------

export async function checkRecoveryTemplateGate(now = new Date()): Promise<TemplateGate> {
  const { listMetaTemplates } = await import("./whatsapp-meta.server");
  try {
    const result = await listMetaTemplates();
    if (!result.success) return evaluateTemplateGate(null, result.error, now);
    return evaluateTemplateGate(result.templates as any, null, now);
  } catch (error) {
    return evaluateTemplateGate(null, error instanceof Error ? error.message : String(error), now);
  }
}

// ---------------------------------------------------------------------------
// Descoberta de tentativas
// ---------------------------------------------------------------------------

type Rec = Record<string, any>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});

function phoneFromRaw(raw: Rec, ...extra: unknown[]): string | null {
  const candidates = [
    ...extra,
    rec(raw["shippingAddress"])["phone"],
    rec(raw["billingAddress"])["phone"],
    raw["phone"],
    rec(raw["customer"])["phone"],
  ];
  for (const c of candidates) if (phoneKey(c)) return String(c);
  return null;
}

async function loadCustomers(ids: string[]): Promise<Map<string, Rec>> {
  const supabaseAdmin = await admin();
  const map = new Map<string, Rec>();
  for (const part of chunk(uniq(ids), 200)) {
    const { data, error } = await supabaseAdmin.from("shopify_customers").select("id, first_name, phone, email").in("id", part);
    if (error) throw new Error(`Erro ao ler clientes: ${error.message}`);
    for (const row of data ?? []) map.set(String(row.id), row);
  }
  return map;
}

function checkoutCandidate(row: Rec, customers: Map<string, Rec>, cohort: "initial" | "continuous"): AttemptCandidate {
  const raw = rec(row["raw_data"]);
  const customer = customers.get(String(row["customer_id"] ?? "")) ?? {};
  return {
    attemptKey: `checkout:${row["id"]}`,
    source: "checkout",
    sourceId: String(row["id"]),
    cohort,
    customerId: row["customer_id"] ? String(row["customer_id"]) : null,
    email: (row["email"] ?? rec(raw["customer"])["email"] ?? customer["email"] ?? null) as string | null,
    rawPhone: phoneFromRaw(raw, row["phone"], customer["phone"]),
    firstName: firstNameForMessage(
      rec(raw["customer"])["firstName"],
      rec(raw["billingAddress"])["firstName"],
      rec(raw["shippingAddress"])["firstName"],
      customer["first_name"],
    ),
    rawUrl: (row["checkout_url"] ?? raw["abandonedCheckoutUrl"] ?? null) as string | null,
    attemptAt: String(row["created_at"]),
    alreadyRecovered: Boolean(raw["completedAt"]),
  };
}

function expiredOrderCandidate(row: Rec, customers: Map<string, Rec>, cohort: "initial" | "continuous"): AttemptCandidate {
  const raw = rec(row["raw_data"]);
  const customer = customers.get(String(row["customer_id"] ?? "")) ?? {};
  return {
    attemptKey: `order:${row["id"]}`,
    source: "order",
    sourceId: String(row["id"]),
    cohort,
    customerId: row["customer_id"] ? String(row["customer_id"]) : null,
    email: (row["email"] ?? customer["email"] ?? null) as string | null,
    rawPhone: phoneFromRaw(raw, row["phone"], customer["phone"]),
    firstName: firstNameForMessage(rec(raw["customer"])["firstName"], rec(raw["shippingAddress"])["firstName"], customer["first_name"]),
    // Pedido expirado não tem link reutilizável seguro (a página de status não retoma a compra).
    rawUrl: null,
    attemptAt: String(row["created_at"]),
  };
}

async function discoverInitialCandidates(config: RecoveryConfig): Promise<AttemptCandidate[]> {
  if (!config.staticListId || !config.initialSince || !config.initialBefore) return [];
  const supabaseAdmin = await admin();
  const { data: members, error } = await supabaseAdmin.from("crm_list_members").select("customer_id").eq("lista_id", config.staticListId);
  if (error) throw new Error(`Erro ao ler a lista inicial: ${error.message}`);
  const memberIds = uniq<string>((members ?? []).map((m: Rec) => (m["customer_id"] ? String(m["customer_id"]) : null)));
  if (memberIds.length === 0) return [];
  const checkouts: Rec[] = [];
  const orders: Rec[] = [];
  for (const part of chunk(memberIds, 200)) {
    const [c, o] = await Promise.all([
      supabaseAdmin
        .from("shopify_abandoned_checkouts")
        .select("id, customer_id, email, phone, checkout_url, created_at, raw_data")
        .in("customer_id", part)
        .gte("created_at", config.initialSince)
        .lt("created_at", config.initialBefore),
      supabaseAdmin
        .from("shopify_orders")
        .select("id, customer_id, email, phone, created_at, raw_data")
        .in("customer_id", part)
        .eq("financial_status", "EXPIRED")
        .gte("created_at", config.initialSince)
        .lt("created_at", config.initialBefore),
    ]);
    if (c.error) throw new Error(`Erro ao ler checkouts do lote inicial: ${c.error.message}`);
    if (o.error) throw new Error(`Erro ao ler pedidos expirados do lote inicial: ${o.error.message}`);
    checkouts.push(...(c.data ?? []));
    orders.push(...(o.data ?? []));
  }
  const customers = await loadCustomers([...checkouts, ...orders].map((r) => String(r["customer_id"] ?? "")));
  return [
    ...checkouts.map((r) => checkoutCandidate(r, customers, "initial")),
    ...orders.map((r) => expiredOrderCandidate(r, customers, "initial")),
  ];
}

async function discoverContinuousCandidates(config: RecoveryConfig, now: Date): Promise<AttemptCandidate[]> {
  if (!config.continuousSince) return [];
  const supabaseAdmin = await admin();
  const lookback = new Date(now.getTime() - DISCOVERY_LOOKBACK_DAYS * 86_400_000).toISOString();
  const since = config.continuousSince > lookback ? config.continuousSince : lookback;
  const [c, o] = await Promise.all([
    supabaseAdmin
      .from("shopify_abandoned_checkouts")
      .select("id, customer_id, email, phone, checkout_url, created_at, raw_data")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1000),
    supabaseAdmin
      .from("shopify_orders")
      .select("id, customer_id, email, phone, created_at, raw_data")
      .eq("financial_status", "EXPIRED")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1000),
  ]);
  if (c.error) throw new Error(`Erro ao ler checkouts abandonados: ${c.error.message}`);
  if (o.error) throw new Error(`Erro ao ler pedidos expirados: ${o.error.message}`);
  const checkouts = (c.data ?? []).filter((r: Rec) => !rec(r["raw_data"])["completedAt"]);
  const orders = o.data ?? [];
  const customers = await loadCustomers([...checkouts, ...orders].map((r: Rec) => String(r["customer_id"] ?? "")));
  return [
    ...checkouts.map((r: Rec) => checkoutCandidate(r, customers, "continuous")),
    ...orders.map((r: Rec) => expiredOrderCandidate(r, customers, "continuous")),
  ];
}

async function loadExistingForCandidates(automationId: string, candidates: AttemptCandidate[], hosts: string[]): Promise<ExistingAttempt[]> {
  const supabaseAdmin = await admin();
  const byKey = new Map<string, ExistingAttempt>();
  const add = (rows: Rec[]) => {
    for (const r of rows) {
      byKey.set(String(r["attempt_key"]), {
        attemptKey: String(r["attempt_key"]),
        phoneKey: (r["phone_key"] ?? null) as string | null,
        status: r["status"],
        createdAt: String(r["created_at"]),
        recoveryUrl: (r["recovery_url"] ?? null) as string | null,
      });
    }
  };
  const cols = "attempt_key, phone_key, status, created_at, recovery_url";
  const keys = uniq<string>(candidates.map((c) => c.attemptKey));
  const phones = uniq<string>(candidates.map((c) => phoneKey(c.rawPhone)));
  const urls = uniq<string>(candidates.map((c) => {
    const check = validateRecoveryUrl(c.rawUrl, hosts);
    return check.ok ? check.url : null;
  }));
  for (const [column, values] of [["attempt_key", keys], ["phone_key", phones], ["recovery_url", urls]] as const) {
    for (const part of chunk(values as string[], 150)) {
      const { data, error } = await supabaseAdmin.from(ATTEMPTS).select(cols).eq("automation_id", automationId).in(column, part);
      if (error) throw new Error(`Erro ao ler tentativas já registradas: ${error.message}`);
      add(data ?? []);
    }
  }
  return [...byKey.values()];
}

async function enrollAttempts(automationId: string, candidates: AttemptCandidate[], hosts: string[], now: Date): Promise<{ entered: number; excluded: number }> {
  if (candidates.length === 0) return { entered: 0, excluded: 0 };
  const existing = await loadExistingForCandidates(automationId, candidates, hosts);
  const rows = selectAttemptsForEnrollment(candidates, existing, hosts, now);
  if (rows.length === 0) return { entered: 0, excluded: 0 };
  const supabaseAdmin = await admin();
  let entered = 0;
  let excluded = 0;
  for (const row of rows) {
    const { error } = await supabaseAdmin.from(ATTEMPTS).insert({ ...row, automation_id: automationId });
    if (!error) {
      if (row.status === "pending") entered++;
      else excluded++;
      continue;
    }
    // Corrida com outra recuperação aberta do mesmo telefone (índice único): registra como excluída.
    if (error.code === "23505" && row.status === "pending") {
      const { error: retryError } = await supabaseAdmin
        .from(ATTEMPTS)
        .insert({ ...row, automation_id: automationId, status: "excluded", exit_reason: "pessoa já está em uma recuperação aberta" });
      if (!retryError || retryError.code === "23505") { excluded++; continue; }
      throw new Error(`Erro ao registrar tentativa: ${retryError.message}`);
    }
    if (error.code === "23505") continue; // mesma tentativa já registrada
    throw new Error(`Erro ao registrar tentativa: ${error.message}`);
  }
  return { entered, excluded };
}

// ---------------------------------------------------------------------------
// Conferência (usada no tick E no worker)
// ---------------------------------------------------------------------------

export async function loadGuardFacts(attempts: AttemptDbRow[], config: RecoveryConfig, hosts: string[], stage: RecoveryStage): Promise<Map<string, RecoveryGuardFacts>> {
  const result = new Map<string, RecoveryGuardFacts>();
  if (attempts.length === 0) return result;
  const supabaseAdmin = await admin();
  const fail = (what: string, error: { message: string }) => {
    throw new Error(`Conferência antes do envio falhou (${what}): ${error.message}`);
  };

  const minAttemptAt = attempts.reduce((min, a) => (a.attempt_at < min ? a.attempt_at : min), attempts[0]!.attempt_at);
  const variantsByAttempt = new Map(attempts.map((a) => [a.id, phoneVariants(a.phone_key ?? a.phone)]));
  const allVariants = uniq<string>([...variantsByAttempt.values()].flat());
  const emails = uniq<string>(attempts.flatMap((a) => (a.email ? [a.email, a.email.toLowerCase()] : [])));

  // Origem da tentativa.
  const checkoutIds = uniq<string>(attempts.filter((a) => a.source === "checkout").map((a) => a.source_id));
  const orderIds = uniq<string>(attempts.filter((a) => a.source === "order").map((a) => a.source_id));
  const checkoutById = new Map<string, Rec>();
  for (const part of chunk(checkoutIds, 150)) {
    const { data, error } = await supabaseAdmin.from("shopify_abandoned_checkouts").select("id, completed_at:raw_data->>completedAt").in("id", part);
    if (error) fail("checkout original", error);
    for (const r of data ?? []) checkoutById.set(String(r.id), r);
  }
  const sourceOrderById = new Map<string, GuardOrder>();
  for (const part of chunk(orderIds, 150)) {
    const { data, error } = await supabaseAdmin.from("shopify_orders").select("id, created_at, financial_status, cancelled_at").in("id", part);
    if (error) fail("pedido original", error);
    for (const r of data ?? []) sourceOrderById.set(String(r.id), { id: String(r.id), createdAt: r.created_at, financialStatus: r.financial_status, cancelledAt: r.cancelled_at });
  }

  // Identidade: clientes ligados por id, telefone ou email.
  const customerIdsByPhone = new Map<string, Set<string>>();
  const customerIdsByEmail = new Map<string, Set<string>>();
  const pushTo = (map: Map<string, Set<string>>, key: string, id: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(id);
    map.set(key, set);
  };
  for (const part of chunk(allVariants, 150)) {
    const { data, error } = await supabaseAdmin.from("shopify_customers").select("id, phone").in("phone", part);
    if (error) fail("clientes por telefone", error);
    for (const r of data ?? []) pushTo(customerIdsByPhone, String(r.phone), String(r.id));
  }
  for (const part of chunk(emails, 150)) {
    const { data, error } = await supabaseAdmin.from("shopify_customers").select("id, email").in("email", part);
    if (error) fail("clientes por email", error);
    for (const r of data ?? []) pushTo(customerIdsByEmail, String(r.email).toLowerCase(), String(r.id));
  }
  const idsByAttempt = new Map<string, Set<string>>();
  for (const a of attempts) {
    const ids = new Set<string>();
    if (a.customer_id) ids.add(a.customer_id);
    for (const v of variantsByAttempt.get(a.id) ?? []) for (const id of customerIdsByPhone.get(v) ?? []) ids.add(id);
    if (a.email) for (const id of customerIdsByEmail.get(a.email.toLowerCase()) ?? []) ids.add(id);
    idsByAttempt.set(a.id, ids);
  }
  const allCustomerIds = uniq<string>([...idsByAttempt.values()].flatMap((s) => [...s]));

  // Pedidos posteriores (corte = tentativa original mais antiga do lote; o filtro fino é por tentativa).
  const orders = new Map<string, Rec>();
  const orderCols = "id, customer_id, email, phone, created_at, financial_status, cancelled_at";
  for (const [column, values] of [["customer_id", allCustomerIds], ["email", emails], ["phone", allVariants]] as const) {
    for (const part of chunk(values as string[], 150)) {
      const { data, error } = await supabaseAdmin.from("shopify_orders").select(orderCols).in(column, part).gte("created_at", minAttemptAt);
      if (error) fail("pedidos posteriores", error);
      for (const r of data ?? []) orders.set(String(r.id), r);
    }
  }

  // Respostas recebidas.
  const lastInboundByPhone = new Map<string, string>();
  const threadPhone = new Map<string, string>();
  for (const part of chunk(allVariants, 150)) {
    const { data, error } = await supabaseAdmin.from("whatsapp_inbox_threads").select("id, phone").in("phone", part);
    if (error) fail("conversas", error);
    for (const r of data ?? []) threadPhone.set(String(r.id), String(r.phone));
  }
  for (const part of chunk([...threadPhone.keys()], 150)) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_inbox_messages")
      .select("thread_id, sent_at")
      .in("thread_id", part)
      .eq("direction", "inbound")
      .gte("sent_at", minAttemptAt);
    if (error) fail("mensagens recebidas", error);
    for (const r of data ?? []) {
      const phone = threadPhone.get(String(r.thread_id));
      if (phone && String(r.sent_at) > (lastInboundByPhone.get(phone) ?? "")) lastInboundByPhone.set(phone, String(r.sent_at));
    }
  }

  // Opt-out (falha fechada: getSuppressedWhatsappPhones lança em erro).
  const { getSuppressedWhatsappPhones } = await import("./whatsapp-suppression.server");
  let suppressed: Set<string>;
  try {
    suppressed = await getSuppressedWhatsappPhones(allVariants);
  } catch (error) {
    fail("opt-out", { message: error instanceof Error ? error.message : String(error) });
    throw error;
  }

  // Tag sem-automacao.
  const blocked = new Set<string>();
  for (const part of chunk(allCustomerIds, 150)) {
    const { data, error } = await supabaseAdmin.from("shopify_customers").select("id").in("id", part).contains("tags_custom", [AUTOMATION_BLOCK_TAG]);
    if (error) fail("tag sem-automacao", error);
    for (const r of data ?? []) blocked.add(String(r.id));
  }

  // Execuções abertas nas automações que não podemos invadir (PIX pendente).
  const blockingCustomers = new Set<string>();
  const blockingPhones = new Set<string>();
  if (config.blockingAutomationIds.length > 0) {
    for (const [column, values] of [["customer_id", allCustomerIds], ["phone", allVariants]] as const) {
      for (const part of chunk(values as string[], 150)) {
        const { data, error } = await supabaseAdmin
          .from("whatsapp_automation_runs")
          .select("customer_id, phone")
          .in("automation_id", config.blockingAutomationIds)
          .in("status", OPEN_RUN_STATUSES)
          .in(column, part);
        if (error) fail("automações em andamento", error);
        for (const r of data ?? []) {
          if (r.customer_id) blockingCustomers.add(String(r.customer_id));
          if (r.phone) for (const v of phoneVariants(r.phone)) blockingPhones.add(v);
        }
      }
    }
  }

  // Lembrete: a 1ª mensagem não pode ter falhado.
  const initialStatusById = new Map<string, string>();
  if (stage === "reminder") {
    const ids = uniq<string>(attempts.map((a) => a.initial_recipient_id));
    for (const part of chunk(ids, 150)) {
      const { data, error } = await supabaseAdmin.from("wa_campaign_recipients").select("id, status").in("id", part);
      if (error) fail("1ª mensagem", error);
      for (const r of data ?? []) initialStatusById.set(String(r.id), String(r.status));
    }
  }

  for (const a of attempts) {
    const variants = variantsByAttempt.get(a.id) ?? [];
    const ids = idsByAttempt.get(a.id) ?? new Set<string>();
    const email = a.email?.toLowerCase() ?? null;
    const related: GuardOrder[] = [];
    for (const o of orders.values()) {
      const matches =
        (o.customer_id && ids.has(String(o.customer_id))) ||
        (email && String(o.email ?? "").toLowerCase() === email) ||
        (o.phone && variants.includes(String(o.phone)));
      if (matches) related.push({ id: String(o.id), createdAt: o.created_at, financialStatus: o.financial_status, cancelledAt: o.cancelled_at });
    }
    const checkout = a.source === "checkout" ? checkoutById.get(a.source_id) : undefined;
    const sourceOrder = a.source === "order" ? sourceOrderById.get(a.source_id) ?? null : null;
    const lastInbound = variants.map((v) => lastInboundByPhone.get(v) ?? "").sort().pop() || null;
    result.set(a.id, {
      source: a.source,
      sourceId: a.source_id,
      attemptAt: a.attempt_at,
      phoneValid: Boolean(phoneKey(a.phone_key ?? a.phone)),
      urlValid: validateRecoveryUrl(a.recovery_url, hosts).ok,
      sourceFound: a.source === "checkout" ? Boolean(checkout) : Boolean(sourceOrder),
      sourceCompletedAt: (checkout?.["completed_at"] as string | null | undefined) ?? null,
      sourceOrder,
      relatedOrders: related,
      lastInboundAt: lastInbound,
      suppressed: variants.some((v) => suppressed.has(v)),
      blockedTag: [...ids].some((id) => blocked.has(id)),
      openBlockingRun: [...ids].some((id) => blockingCustomers.has(id)) || variants.some((v) => blockingPhones.has(v)),
      previousMessageFailed: stage === "reminder" ? initialStatusById.get(String(a.initial_recipient_id)) === "failed" : false,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

async function ensureStageCampaign(automation: Rec, config: RecoveryConfig, stage: RecoveryStage): Promise<string> {
  const existing = stage === "initial" ? config.initialCampaignId : config.reminderCampaignId;
  if (existing) return existing;
  const def = RECOVERY_TEMPLATES[stage];
  const { createCampaignRow } = await import("./whatsapp-meta.server");
  const created = await createCampaignRow(
    {
      nome: `${String(automation["nome"])} · ${stage === "initial" ? "1ª mensagem" : "lembrete"}`,
      segmentType: "custom",
      messageType: "marketing",
      templateName: def.name,
      templateLanguage: def.language,
      bodyParams: ["{{NOME_CLIENTE}}", "{{LINK_CHECKOUT}}"],
      origem: "automacao",
      automationId: String(automation["id"]),
      automationStepId: def.stepId,
      campaignTag: "recuperacao_compra",
      totalDestinatariosOverride: 0,
    },
    "enviando",
  );
  if (!created.success) throw new Error(`Erro ao criar campanha do fluxo: ${created.error}`);
  await patchTriggerConfig(String(automation["id"]), {
    [stage === "initial" ? "recoveryInitialCampaignId" : "recoveryReminderCampaignId"]: created.campaignId,
  });
  return created.campaignId;
}

async function enqueueAttempt(attempt: AttemptDbRow, stage: RecoveryStage, campaignId: string): Promise<void> {
  const supabaseAdmin = await admin();
  const eventKey = `${attempt.attempt_key}:${stage}`;
  const phone = attempt.phone_key as string;
  const params = recoveryParams(attempt.first_name || "cliente", attempt.recovery_url as string);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("wa_campaign_recipients")
    .upsert(
      { campaign_id: campaignId, customer_id: attempt.customer_id, name: attempt.first_name, phone, params, status: "queued", event_key: eventKey },
      { onConflict: "campaign_id,phone,event_key", ignoreDuplicates: true },
    )
    .select("id");
  if (insertError) throw new Error(`Erro ao criar destinatário: ${insertError.message}`);
  let recipientId: string | null = inserted?.[0]?.id ?? null;
  if (!recipientId) {
    const { data: found, error } = await supabaseAdmin
      .from("wa_campaign_recipients")
      .select("id, status")
      .eq("campaign_id", campaignId)
      .eq("phone", phone)
      .eq("event_key", eventKey)
      .maybeSingle();
    if (error || !found) throw new Error(`Erro ao localizar destinatário: ${error?.message ?? "não encontrado"}`);
    if (found.status !== "queued") throw new Error("Esta etapa já foi processada para esta tentativa.");
    recipientId = String(found.id);
  }

  const now = new Date().toISOString();
  const statusFrom = stage === "initial" ? "pending" : "waiting_reminder";
  const patch = stage === "initial"
    ? { status: "queued_initial", initial_recipient_id: recipientId, initial_queued_at: now, last_error: null, last_checked_at: now }
    : { status: "queued_reminder", reminder_recipient_id: recipientId, reminder_queued_at: now, last_error: null, last_checked_at: now };
  // A tentativa é marcada ANTES do job existir: o worker nunca vê um job sem a tentativa na fila.
  const { data: moved, error: moveError } = await supabaseAdmin.from(ATTEMPTS).update(patch).eq("id", attempt.id).eq("status", statusFrom).select("id");
  if (moveError) throw new Error(`Erro ao atualizar tentativa: ${moveError.message}`);
  if (!moved?.length) return; // outra execução já moveu

  const { error: jobError } = await supabaseAdmin
    .from("wa_jobs")
    .upsert(
      { campaign_id: campaignId, recipient_id: recipientId, status: "queued", attempts: 0, max_attempts: 3, priority: 5, scheduled_at: now, next_attempt_at: now },
      { onConflict: "recipient_id", ignoreDuplicates: true },
    );
  if (jobError) {
    await supabaseAdmin.from(ATTEMPTS).update({ status: statusFrom, last_error: `Falha ao enfileirar: ${jobError.message}` }).eq("id", attempt.id);
    throw new Error(`Erro ao enfileirar: ${jobError.message}`);
  }
}

async function exitAttempts(ids: Array<{ id: string; reason: string }>) {
  if (ids.length === 0) return;
  const supabaseAdmin = await admin();
  const now = new Date().toISOString();
  for (const item of ids) {
    const { error } = await supabaseAdmin
      .from(ATTEMPTS)
      .update({ status: "exited", exit_reason: item.reason, last_checked_at: now, last_error: null })
      .eq("id", item.id)
      .in("status", OPEN_ATTEMPT_STATUSES as unknown as string[]);
    if (error) throw new Error(`Erro ao encerrar tentativa: ${error.message}`);
  }
}

async function reconcileQueued(automationId: string): Promise<number> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from(ATTEMPTS)
    .select("id, status, initial_recipient_id, reminder_recipient_id")
    .eq("automation_id", automationId)
    .in("status", ["queued_initial", "queued_reminder"])
    .limit(500);
  if (error) throw new Error(`Erro ao ler tentativas na fila: ${error.message}`);
  const rows = (data ?? []) as Rec[];
  if (rows.length === 0) return 0;
  const recipientIds = uniq<string>(rows.map((r) => (r["status"] === "queued_initial" ? r["initial_recipient_id"] : r["reminder_recipient_id"])));
  const recipients = new Map<string, Rec>();
  for (const part of chunk(recipientIds, 150)) {
    const { data: recs, error: recError } = await supabaseAdmin
      .from("wa_campaign_recipients")
      .select("id, status, sent_at, wa_message_id, error_message")
      .in("id", part);
    if (recError) throw new Error(`Erro ao ler resultado da fila: ${recError.message}`);
    for (const r of recs ?? []) recipients.set(String(r.id), r);
  }
  let changed = 0;
  for (const row of rows) {
    const stage: RecoveryStage = row["status"] === "queued_initial" ? "initial" : "reminder";
    const recipient = recipients.get(String(stage === "initial" ? row["initial_recipient_id"] : row["reminder_recipient_id"]));
    const patch = reconcileAttemptWithQueue(
      stage,
      recipient ? { status: recipient.status, sentAt: recipient.sent_at, waMessageId: recipient.wa_message_id, errorMessage: recipient.error_message } : null,
    );
    if (!patch) continue;
    const { error: updateError } = await supabaseAdmin.from(ATTEMPTS).update(patch).eq("id", row["id"]).eq("status", row["status"]);
    if (updateError) throw new Error(`Erro ao atualizar tentativa: ${updateError.message}`);
    changed++;
  }
  return changed;
}

async function processStage(automation: Rec, config: RecoveryConfig, hosts: string[], stage: RecoveryStage, now: Date): Promise<number> {
  const supabaseAdmin = await admin();
  let query = supabaseAdmin.from(ATTEMPTS).select("*").eq("automation_id", automation["id"]);
  query = stage === "initial"
    ? query.eq("status", "pending").lte("eligible_at", now.toISOString()).order("attempt_at", { ascending: true })
    : query.eq("status", "waiting_reminder").lte("reminder_due_at", now.toISOString()).order("reminder_due_at", { ascending: true });
  const { data, error } = await query.limit(MAX_PER_STAGE_PER_TICK);
  if (error) throw new Error(`Erro ao ler tentativas: ${error.message}`);
  const attempts = (data ?? []) as AttemptDbRow[];
  if (attempts.length === 0) return 0;

  let facts: Map<string, RecoveryGuardFacts>;
  try {
    facts = await loadGuardFacts(attempts, config, hosts, stage);
  } catch (guardError) {
    // Falha de consulta: nada sai; erro visível em cada tentativa, nova conferência no próximo ciclo.
    const message = guardError instanceof Error ? guardError.message : String(guardError);
    for (const part of chunk(attempts.map((a) => a.id), 150)) {
      await supabaseAdmin.from(ATTEMPTS).update({ last_error: message, last_checked_at: now.toISOString() }).in("id", part);
    }
    throw guardError;
  }

  const exits: Array<{ id: string; reason: string }> = [];
  const toSend: AttemptDbRow[] = [];
  for (const a of attempts) {
    const f = facts.get(a.id);
    const decision = f ? evaluateRecoveryGuards(f) : { send: false as const, reason: "sem dados para conferir" };
    if (decision.send) toSend.push(a);
    else exits.push({ id: a.id, reason: decision.reason });
  }
  await exitAttempts(exits);
  if (toSend.length === 0) return exits.length;

  const campaignId = await ensureStageCampaign(automation, config, stage);
  if (stage === "initial") config.initialCampaignId = campaignId;
  else config.reminderCampaignId = campaignId;
  for (const a of toSend) {
    try {
      await enqueueAttempt(a, stage, campaignId);
    } catch (enqueueError) {
      const message = enqueueError instanceof Error ? enqueueError.message : String(enqueueError);
      await supabaseAdmin.from(ATTEMPTS).update({ last_error: message, last_checked_at: now.toISOString() }).eq("id", a.id);
    }
  }
  return exits.length + toSend.length;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export type RecoveryTickResult = { processed: number; state: string; blocker: string | null; gate: TemplateGate | null };

export async function runPurchaseRecoveryTick(automation: Rec, ctx: { requestHost: string | null }, now = new Date()): Promise<RecoveryTickResult> {
  if (automation["automation_kind"] !== PURCHASE_RECOVERY_KIND) return { processed: 0, state: "ignored", blocker: "tipo diferente", gate: null };
  const config = parseRecoveryConfig(automation["trigger_config"]);
  const blocker = automation["inativa"] ? "Fluxo marcado como inativo." : recoveryProcessingBlocker(config, ctx.requestHost);
  if (blocker) {
    // Só o tick agendado grava o motivo (execuções manuais/preview não mexem no estado).
    if (ctx.requestHost && config.armed) {
      await patchTriggerConfig(String(automation["id"]), {
        recoveryState: "bloqueado",
        recoveryLastBlocker: blocker,
        recoveryLastSeenHost: ctx.requestHost,
        recoveryLastTickAt: now.toISOString(),
      });
    }
    return { processed: 0, state: "bloqueado", blocker, gate: null };
  }

  const gate = await checkRecoveryTemplateGate(now);
  const statuses = [gate.initial.status, gate.reminder.status];
  const state = gate.ok
    ? "online"
    : statuses.includes("REJECTED")
      ? "rejeitado_meta"
      : statuses.every((s) => s === "APPROVED" || s === "PENDING" || s === "IN_APPEAL") && gate.initial.bodyMatches !== false
        ? "aguardando_meta"
        : "bloqueado_meta";
  await patchTriggerConfig(
    String(automation["id"]),
    { recoveryGate: gate, recoveryState: state, recoveryLastBlocker: gate.ok ? null : gate.reason, recoveryLastSeenHost: ctx.requestHost, recoveryLastTickAt: now.toISOString() },
    { ativo: gate.ok, ...(gate.ok && !automation["ativo"] ? { last_error: null } : {}) },
  );

  const hosts = await loadStoreHosts();
  let processed = await reconcileQueued(String(automation["id"]));

  // Registro das entradas (sem envio): lote inicial uma vez + contínuo a cada ciclo.
  const raw = (automation["trigger_config"] ?? {}) as Rec;
  if (!raw["recoveryInitialDiscoveredAt"]) {
    const initial = await discoverInitialCandidates(config);
    const r = await enrollAttempts(String(automation["id"]), initial, hosts, now);
    processed += r.entered + r.excluded;
    await patchTriggerConfig(String(automation["id"]), { recoveryInitialDiscoveredAt: now.toISOString(), recoveryInitialCounts: r });
  }
  const continuous = await discoverContinuousCandidates(config, now);
  const r = await enrollAttempts(String(automation["id"]), continuous, hosts, now);
  processed += r.entered + r.excluded;

  if (!gate.ok || !isWithinRecoveryWindow(now)) return { processed, state, blocker: gate.ok ? "fora da janela 09h–19h" : gate.reason, gate };

  processed += await processStage(automation, config, hosts, "initial", now);
  processed += await processStage(automation, config, hosts, "reminder", now);
  return { processed, state, blocker: null, gate };
}

// ---------------------------------------------------------------------------
// Worker: conferência imediatamente antes do envio
// ---------------------------------------------------------------------------

export type WorkerRecoveryDecision =
  | { kind: "send" }
  | { kind: "cancel"; reason: string }
  | { kind: "defer"; until: string; reason: string };

/**
 * Decide, para cada destinatário de campanha de recuperação do lote, se pode sair agora.
 * Lança erro quando não consegue conferir — o worker então NÃO envia (repete mais tarde com o erro visível).
 */
export async function decideRecoveryJobsBeforeSend(
  items: Array<{ recipientId: string; campaign: { id: string; automation_id: string | null; automation_step_id: string | null } }>,
  now = new Date(),
): Promise<Map<string, WorkerRecoveryDecision>> {
  const decisions = new Map<string, WorkerRecoveryDecision>();
  if (items.length === 0) return decisions;
  const supabaseAdmin = await admin();

  const automationIds = uniq<string>(items.map((i) => i.campaign.automation_id));
  const { data: automations, error: automationError } = await supabaseAdmin
    .from("whatsapp_automations")
    .select("id, automation_kind, trigger_config")
    .in("id", automationIds);
  if (automationError) throw new Error(`Conferência antes do envio falhou (fluxo): ${automationError.message}`);
  const automationById = new Map<string, Rec>((automations ?? []).map((a: Rec) => [String(a["id"]), a]));

  const recipientIds = items.map((i) => i.recipientId);
  const attempts = new Map<string, AttemptDbRow>();
  for (const column of ["initial_recipient_id", "reminder_recipient_id"] as const) {
    for (const part of chunk(recipientIds, 150)) {
      const { data, error } = await supabaseAdmin.from(ATTEMPTS).select("*").in(column, part);
      if (error) throw new Error(`Conferência antes do envio falhou (tentativa): ${error.message}`);
      for (const row of (data ?? []) as AttemptDbRow[]) attempts.set(String(row[column]), row);
    }
  }

  const deferUntil = nextRecoverySendTime(now);
  const toCheck: Array<{ recipientId: string; attempt: AttemptDbRow; stage: RecoveryStage; config: RecoveryConfig }> = [];
  for (const item of items) {
    const automation = automationById.get(String(item.campaign.automation_id));
    const stage: RecoveryStage = item.campaign.automation_step_id === RECOVERY_TEMPLATES.reminder.stepId ? "reminder" : "initial";
    const attempt = attempts.get(item.recipientId);
    if (!automation || automation["automation_kind"] !== PURCHASE_RECOVERY_KIND) {
      decisions.set(item.recipientId, { kind: "cancel", reason: "fluxo de recuperação não encontrado" });
      continue;
    }
    const expectedStatus = stage === "initial" ? "queued_initial" : "queued_reminder";
    const expectedRecipient = attempt && (stage === "initial" ? attempt.initial_recipient_id : attempt.reminder_recipient_id);
    if (!attempt || attempt.status !== expectedStatus || expectedRecipient !== item.recipientId) {
      decisions.set(item.recipientId, { kind: "cancel", reason: "fora do fluxo de recuperação (tentativa não está na fila)" });
      continue;
    }
    const config = parseRecoveryConfig(automation["trigger_config"]);
    const gate = (automation["trigger_config"] ?? {})["recoveryGate"] as TemplateGate | undefined;
    const gateFresh = gate?.ok === true && now.getTime() - new Date(gate.checkedAt).getTime() <= GATE_MAX_AGE_MS;
    if (!config.armed || !gateFresh) {
      decisions.set(item.recipientId, {
        kind: "defer",
        until: new Date(now.getTime() + 15 * 60_000).toISOString(),
        reason: "aguardando confirmação recente de aprovação dos modelos na Meta",
      });
      continue;
    }
    if (!isWithinRecoveryWindow(now)) {
      decisions.set(item.recipientId, { kind: "defer", until: deferUntil.toISOString(), reason: "fora da janela 09h–19h (Brasília)" });
      continue;
    }
    toCheck.push({ recipientId: item.recipientId, attempt, stage, config });
  }
  if (toCheck.length === 0) return decisions;

  const hosts = await loadStoreHosts();
  const exits: Array<{ id: string; reason: string }> = [];
  for (const stage of ["initial", "reminder"] as const) {
    const group = toCheck.filter((c) => c.stage === stage);
    if (group.length === 0) continue;
    // Configuração do primeiro (todas as campanhas de recuperação deste lote pertencem ao mesmo fluxo na prática).
    const facts = await loadGuardFacts(group.map((g) => g.attempt), group[0]!.config, hosts, stage);
    for (const g of group) {
      const f = facts.get(g.attempt.id);
      const decision = f ? evaluateRecoveryGuards(f) : { send: false as const, reason: "sem dados para conferir" };
      if (decision.send) decisions.set(g.recipientId, { kind: "send" });
      else {
        decisions.set(g.recipientId, { kind: "cancel", reason: decision.reason });
        exits.push({ id: g.attempt.id, reason: decision.reason });
      }
    }
  }
  await exitAttempts(exits);
  return decisions;
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export async function getPurchaseRecoveryOverview() {
  const supabaseAdmin = await admin();
  const { data: automations, error } = await supabaseAdmin
    .from("whatsapp_automations")
    .select("id, nome, ativo, trigger_config, last_error, last_run_at")
    .eq("automation_kind", PURCHASE_RECOVERY_KIND);
  if (error) throw new Error(error.message);
  const result = [];
  for (const a of (automations ?? []) as Rec[]) {
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from(ATTEMPTS)
      .select("id, cohort, source, status, exit_reason, first_name, phone_key, attempt_at, initial_sent_at, reminder_due_at, reminder_sent_at, last_error, updated_at")
      .eq("automation_id", a["id"])
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (rowsError) throw new Error(rowsError.message);
    const list = (rows ?? []) as Rec[];
    const byStatus: Record<string, number> = {};
    const reasons: Record<string, number> = {};
    for (const r of list) {
      byStatus[r["status"]] = (byStatus[r["status"]] ?? 0) + 1;
      if ((r["status"] === "excluded" || r["status"] === "exited") && r["exit_reason"]) reasons[r["exit_reason"]] = (reasons[r["exit_reason"]] ?? 0) + 1;
    }
    const tc = (a["trigger_config"] ?? {}) as Rec;
    const maskPhone = (p: unknown) => (typeof p === "string" && p.length > 6 ? `${p.slice(0, 5)}•••${p.slice(-2)}` : "—");
    result.push({
      id: String(a["id"]),
      nome: String(a["nome"]),
      ativo: Boolean(a["ativo"]),
      armed: tc["recoveryArmed"] === true,
      state: (tc["recoveryState"] ?? (tc["recoveryArmed"] ? "armado" : "rascunho")) as string,
      lastBlocker: (tc["recoveryLastBlocker"] ?? null) as string | null,
      lastTickAt: (tc["recoveryLastTickAt"] ?? null) as string | null,
      gate: (tc["recoveryGate"] ?? null) as TemplateGate | null,
      lastError: (a["last_error"] ?? null) as string | null,
      byStatus,
      reasons,
      recent: list.slice(0, 30).map((r) => ({
        id: String(r["id"]),
        cohort: r["cohort"],
        source: r["source"],
        status: r["status"],
        reason: r["exit_reason"] ?? null,
        name: r["first_name"] ?? null,
        phone: maskPhone(r["phone_key"]),
        attemptAt: r["attempt_at"],
        initialSentAt: r["initial_sent_at"] ?? null,
        reminderDueAt: r["reminder_due_at"] ?? null,
        reminderSentAt: r["reminder_sent_at"] ?? null,
        lastError: r["last_error"] ?? null,
      })),
    });
  }
  return result;
}
