import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Banco em memória (subconjunto do cliente usado pelo fluxo)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, failOn: new Set<string>(), seq: 0 }));

/** Simula o limite padrão do Data API: no máximo 1000 linhas por requisição. */
const MAX_ROWS = 1000;

function compare(a: any, b: any): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return String(a) < String(b) ? -1 : 1;
}

function makeBuilder(table: string, source?: () => Row[] | { error: { message: string } }) {
  const filters: Array<(r: Row) => boolean> = [];
  const orders: Array<[string, boolean]> = [];
  let op: "select" | "update" | "insert" | "upsert" = "select";
  let payload: any = null;
  let onConflict: string | null = null;
  let ignoreDuplicates = false;
  let limitN: number | null = null;
  let range: [number, number] | null = null;
  let single: "maybe" | "one" | null = null;
  let returning = false;
  const rows = () => (db.tables[table] ??= []);
  const run = () => {
    if (db.failOn.has(table)) return { data: null, error: { message: `falha simulada em ${table}` } };
    if (op === "insert" || op === "upsert") {
      const items = Array.isArray(payload) ? payload : [payload];
      const out: Row[] = [];
      for (const item of items) {
        const keys = onConflict?.split(",") ?? [];
        const dup = keys.length && rows().find((r) => keys.every((k) => r[k] === item[k]));
        if (dup) {
          if (op === "upsert" && ignoreDuplicates) continue;
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        // índices únicos da tabela de tentativas
        if (table === "purchase_recovery_attempts") {
          if (rows().some((r) => r.automation_id === item.automation_id && r.attempt_key === item.attempt_key)) return { data: null, error: { code: "23505", message: "dup key" } };
          const open = ["pending", "queued_initial", "waiting_reminder", "queued_reminder"];
          if (open.includes(item.status ?? "pending") && item.phone_key && rows().some((r) => r.automation_id === item.automation_id && r.phone_key === item.phone_key && open.includes(r.status))) {
            return { data: null, error: { code: "23505", message: "dup open phone" } };
          }
        }
        const row = { id: item.id ?? `id-${++db.seq}`, created_at: new Date().toISOString(), status: "pending", ...item };
        rows().push(row);
        out.push(row);
      }
      return { data: returning ? out : null, error: null };
    }
    let base: Row[];
    if (source) {
      const r = source();
      if (!Array.isArray(r)) return { data: null, error: r.error };
      base = r;
    } else base = rows();
    const matched = base.filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      for (const r of matched) Object.assign(r, payload);
      return { data: returning ? matched : null, error: null };
    }
    let data = matched.map((r) => ({ ...r }));
    if (orders.length) data.sort((x, y) => { for (const [c, asc] of orders) { const d = compare(x[c], y[c]); if (d) return asc ? d : -d; } return 0; });
    if (range) data = data.slice(range[0], range[1] + 1);
    if (limitN !== null) data = data.slice(0, limitN);
    if (!single) data = data.slice(0, MAX_ROWS);
    if (single) return { data: data[0] ?? null, error: single === "one" && !data[0] ? { message: "not found" } : null };
    return { data, error: null };
  };
  const b: any = {
    select: () => { if (op !== "select") returning = true; return b; },
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), b),
    in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), b),
    gte: (c: string, v: any) => (filters.push((r) => r[c] != null && new Date(r[c]) >= new Date(v)), b),
    lte: (c: string, v: any) => (filters.push((r) => r[c] != null && new Date(r[c]) <= new Date(v)), b),
    lt: (c: string, v: any) => (filters.push((r) => r[c] != null && new Date(r[c]) < new Date(v)), b),
    not: () => b,
    contains: (c: string, vs: any[]) => (filters.push((r) => Array.isArray(r[c]) && vs.every((v) => r[c].includes(v))), b),
    order: (c: string, o?: { ascending?: boolean }) => (orders.push([c, o?.ascending !== false]), b),
    range: (from: number, to: number) => ((range = [from, to]), b),
    limit: (n: number) => ((limitN = n), b),
    maybeSingle: () => ((single = "maybe"), Promise.resolve(run())),
    single: () => ((single = "one"), Promise.resolve(run())),
    update: (p: any) => ((op = "update"), (payload = p), b),
    insert: (p: any) => ((op = "insert"), (payload = p), b),
    upsert: (p: any, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => ((op = "upsert"), (payload = p), (onConflict = o?.onConflict ?? null), (ignoreDuplicates = Boolean(o?.ignoreDuplicates)), b),
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}
const builder = (table: string) => makeBuilder(table);

function rpc(name: string, args: any) {
  const lower = () => (args.p_emails as string[]).map((e) => e.toLowerCase());
  if (name === "purchase_recovery_orders_by_emails") {
    return makeBuilder("__rpc_orders", () => {
      if (db.failOn.has("shopify_orders")) return { error: { message: "falha simulada em shopify_orders" } };
      const emails = lower();
      return (db.tables["shopify_orders"] ?? []).filter((o) => o.email && emails.includes(String(o.email).toLowerCase()) && new Date(o.created_at) >= new Date(args.p_since));
    });
  }
  if (name === "purchase_recovery_customers_by_emails") {
    return makeBuilder("__rpc_customers", () => {
      const emails = lower();
      return (db.tables["shopify_customers"] ?? []).filter((c) => c.email && emails.includes(String(c.email).toLowerCase()));
    });
  }
  // --- fila (worker) ---
  if (name === "requeue_stale_wa_jobs") return Promise.resolve({ data: 0, error: null });
  if (name === "claim_wa_jobs") {
    const now = Date.now();
    const picked = (db.tables["wa_jobs"] ?? [])
      .filter((j) => ["queued", "retry_wait"].includes(j.status) && new Date(j.scheduled_at).getTime() <= now && (!j.next_attempt_at || new Date(j.next_attempt_at).getTime() <= now))
      .sort((a, b) => a.priority - b.priority || compare(a.created_at, b.created_at))
      .slice(0, args.p_limit);
    for (const j of picked) Object.assign(j, { status: "sending", attempts: j.attempts + 1, locked_by: args.p_worker, locked_at: new Date().toISOString() });
    return Promise.resolve({ data: picked.map((j) => ({ ...j })), error: null });
  }
  if (name === "wa_queue_apply_results") {
    for (const o of args.p_results as any[]) {
      const job = (db.tables["wa_jobs"] ?? []).find((j) => j.id === o.job_id);
      const status = o.kind === "sent" ? "done" : o.kind === "retry" ? "retry_wait" : o.kind;
      if (job) Object.assign(job, { status, error: o.kind === "sent" ? null : o.error ?? null, next_attempt_at: o.kind === "retry" ? o.next_attempt_at : null, locked_by: null, locked_at: null });
      const recipient = (db.tables["wa_campaign_recipients"] ?? []).find((r) => r.id === o.recipient_id);
      if (!recipient) continue;
      if (o.kind === "sent") Object.assign(recipient, { status: "sent", wa_message_id: o.wa_message_id, sent_at: new Date().toISOString() });
      if (o.kind === "failed") Object.assign(recipient, { status: "failed", error_message: o.error });
      if (o.kind === "cancelled") Object.assign(recipient, { status: "cancelled", error_message: o.error });
    }
    return Promise.resolve({ data: null, error: null });
  }
  if (name === "release_wa_jobs") {
    for (const j of db.tables["wa_jobs"] ?? []) if ((args.p_ids as string[]).includes(j.id)) Object.assign(j, { status: "queued", locked_by: null, locked_at: null });
    return Promise.resolve({ data: null, error: null });
  }
  return Promise.resolve({ data: null, error: { message: `rpc desconhecida ${name}` } });
}

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => builder(t), rpc } }));

const meta = vi.hoisted(() => ({ templates: [] as any[], apiError: null as string | null, campaigns: 0, sends: [] as Array<{ to: string; templateName: string }> }));
vi.mock("./whatsapp-meta.server", async () => {
  const { normalizeShopifyPhone } = await import("./shopify-order-phone");
  return {
    listMetaTemplates: async () => (meta.apiError ? { success: false, error: meta.apiError, templates: [] } : { success: true, templates: meta.templates }),
    createCampaignRow: async () => {
      meta.campaigns++;
      const id = `camp-${meta.campaigns}`;
      (db.tables["wa_campaigns"] ??= []).push({ id });
      return { success: true, campaignId: id };
    },
    loadSettings: async () => ({ accessToken: "test-token", phoneNumberId: "test-phone", templateLanguage: "pt_BR" }),
    toE164: (raw: string) => normalizeShopifyPhone(raw),
    // Provedor simulado: registra cada chamada (a Meta real nunca é chamada nos testes).
    sendTemplateMessage: async (params: { to: string; templateName: string }) => {
      meta.sends.push({ to: params.to, templateName: params.templateName });
      return { ok: true, waMessageId: `wamid.${meta.sends.length}` };
    },
  };
});

// Ritmo do worker: 1 item por vez, e a "espera do gate" roda um gancho do teste (compra/resposta/relógio…).
const gateHook = vi.hoisted(() => ({ fn: null as null | ((call: number) => void | Promise<void>), calls: 0 }));
vi.mock("./wa-queue-throughput", async (importOriginal) => {
  const original = await importOriginal<typeof import("./wa-queue-throughput")>();
  return {
    ...original,
    readThroughputConfig: () => ({ ratePerSec: 80, concurrency: 1, batchSize: 50, waveSize: 1 }),
    createRateGate: () => async () => {
      gateHook.calls++;
      if (gateHook.fn) await gateHook.fn(gateHook.calls);
    },
  };
});

import { PURCHASE_RECOVERY_IMPLEMENTATION, RECOVERY_TEMPLATES } from "./purchase-recovery";
import { decideRecoveryJobsBeforeSend, runPurchaseRecoveryTick } from "./purchase-recovery.server";
import { processWhatsappQueueBatch } from "./wa-campaigns.server";

const HOST = "clever-ship-analyzer.lovable.app";
const AUTOMATION_ID = "auto-1";

function approvedTemplates(status = "APPROVED") {
  return (["initial", "reminder"] as const).map((stage) => ({
    id: stage,
    name: RECOVERY_TEMPLATES[stage].name,
    language: "pt_BR",
    status,
    category: "MARKETING",
    components: [{ type: "BODY", text: RECOVERY_TEMPLATES[stage].body }],
  }));
}

function automation(over: Row = {}): Row {
  return {
    id: AUTOMATION_ID,
    nome: "Recuperar compras",
    automation_kind: "purchase_recovery",
    ativo: false,
    trigger_config: {
      recoveryArmed: true,
      recoveryImplementation: PURCHASE_RECOVERY_IMPLEMENTATION,
      recoveryAllowedHost: HOST,
      recoverySince: "2026-11-13T03:00:00Z",
      recoveryBefore: "2026-11-15T03:00:00Z",
      recoveryStaticListId: "list-1",
      recoveryContinuousSince: "2026-11-15T21:00:00Z",
      recoveryBlockingAutomationIds: ["pix-auto"],
    },
    ...over,
  };
}

function seed() {
  db.tables = {
    store_settings: [{ storefront_domain: "maniadmulher.com", shopify_store_domain: "azmr41-w0.myshopify.com", created_at: "2026-01-01" }],
    whatsapp_automations: [automation()],
    crm_list_members: [
      { lista_id: "list-1", customer_id: "c-ana" },
      { lista_id: "list-1", customer_id: "c-bia" },
      { lista_id: "list-1", customer_id: "c-cris" },
    ],
    shopify_customers: [
      { id: "c-ana", first_name: "ANA maria", phone: "+5531992904210", email: "ana@x.com", tags_custom: [] },
      { id: "c-bia", first_name: "Bia", phone: "+5511988887777", email: "bia@x.com", tags_custom: [] },
      { id: "c-cris", first_name: "Cris", phone: "+5521977776666", email: "cris@x.com", tags_custom: [] },
    ],
    shopify_abandoned_checkouts: [
      { id: "ck-ana", customer_id: "c-ana", email: "ana@x.com", phone: "+5531992904210", checkout_url: "https://maniadmulher.com/77747060914/checkouts/ac/ana", created_at: "2026-11-13T15:00:00Z", raw_data: { completedAt: null }, completed_at: null },
      { id: "ck-bia", customer_id: "c-bia", email: "bia@x.com", phone: "+5511988887777", checkout_url: "https://maniadmulher.com/77747060914/checkouts/ac/bia", created_at: "2026-11-14T15:00:00Z", raw_data: { completedAt: null }, completed_at: null },
      // fora da janela do lote inicial e antes da instalação: não entra
      { id: "ck-cris-old", customer_id: "c-cris", email: "cris@x.com", phone: "+5521977776666", checkout_url: "https://maniadmulher.com/77747060914/checkouts/ac/cris", created_at: "2026-11-15T10:00:00Z", raw_data: { completedAt: null }, completed_at: null },
    ],
    shopify_orders: [
      { id: "o-exp", customer_id: "c-cris", email: "cris@x.com", phone: "+5521977776666", financial_status: "EXPIRED", cancelled_at: null, created_at: "2026-11-14T12:00:00Z", raw_data: {} },
      // Bia comprou depois da tentativa
      { id: "o-bia", customer_id: "c-bia", email: "bia@x.com", phone: "+5511988887777", financial_status: "PAID", cancelled_at: null, created_at: "2026-11-14T18:00:00Z", raw_data: {} },
    ],
    whatsapp_inbox_threads: [],
    whatsapp_inbox_messages: [],
    whatsapp_suppressions: [],
    whatsapp_automation_runs: [],
    purchase_recovery_attempts: [],
    wa_campaigns: [],
    wa_campaign_recipients: [],
    wa_jobs: [],
  };
}

const attempts = () => db.tables["purchase_recovery_attempts"]!;
const byKey = (k: string) => attempts().find((a) => a.attempt_key === k);

beforeEach(() => {
  seed();
  db.failOn.clear();
  meta.templates = approvedTemplates("PENDING");
  meta.apiError = null;
  meta.campaigns = 0;
  meta.sends = [];
  gateHook.fn = null;
  gateHook.calls = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const tick = (now: string, host: string | null = HOST) =>
  runPurchaseRecoveryTick(db.tables["whatsapp_automations"]![0]!, { requestHost: host }, new Date(now));

describe("tick do fluxo de recuperação", () => {
  it("execução manual / preview não processa nem grava nada", async () => {
    const r = await tick("2026-11-16T14:00:00Z", null);
    expect(r.state).toBe("bloqueado");
    expect(attempts()).toHaveLength(0);
    expect(db.tables["wa_jobs"]).toHaveLength(0);
  });

  it("modelos PENDING: registra o lote inicial e exclusões, mas não enfileira nada", async () => {
    const r = await tick("2026-11-16T14:00:00Z");
    expect(r.state).toBe("aguardando_meta");
    expect(byKey("checkout:ck-ana")?.status).toBe("pending");
    expect(byKey("order:o-exp")).toMatchObject({ status: "excluded", exit_reason: "pedido expirado sem link reutilizável seguro" });
    expect(byKey("checkout:ck-cris-old")).toBeUndefined();
    expect(db.tables["wa_jobs"]).toHaveLength(0);
    expect(db.tables["whatsapp_automations"]![0]!.ativo).toBe(false);
  });

  it("REJECTED fica visível e não envia", async () => {
    meta.templates = approvedTemplates("REJECTED");
    const r = await tick("2026-11-16T14:00:00Z");
    expect(r.state).toBe("rejeitado_meta");
    expect(db.tables["whatsapp_automations"]![0]!.trigger_config.recoveryGate.reason).toContain("REJECTED");
    expect(db.tables["wa_jobs"]).toHaveLength(0);
  });

  it("erro na API da Meta nunca libera", async () => {
    meta.apiError = "timeout";
    const r = await tick("2026-11-16T14:00:00Z");
    expect(r.gate?.ok).toBe(false);
    expect(db.tables["wa_jobs"]).toHaveLength(0);
  });

  it("aprovado e dentro da janela: revalida a lista e só enfileira quem continua elegível", async () => {
    meta.templates = approvedTemplates();
    const r = await tick("2026-11-16T14:00:00Z"); // 11h Brasília
    expect(r.state).toBe("online");
    expect(db.tables["whatsapp_automations"]![0]!.ativo).toBe(true);
    expect(byKey("checkout:ck-ana")?.status).toBe("queued_initial");
    expect(byKey("checkout:ck-bia")).toMatchObject({ status: "exited", exit_reason: "compra posterior à tentativa" });
    const recipients = db.tables["wa_campaign_recipients"]!;
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toMatchObject({ phone: "+5531992904210", params: ["Ana", "https://maniadmulher.com/77747060914/checkouts/ac/ana"] });
    expect(db.tables["wa_jobs"]).toHaveLength(1);
  });

  it("fora de 09h–19h aguarda: nada é enfileirado", async () => {
    meta.templates = approvedTemplates();
    await tick("2026-11-16T23:30:00Z"); // 20h30 Brasília
    expect(byKey("checkout:ck-ana")?.status).toBe("pending");
    expect(db.tables["wa_jobs"]).toHaveLength(0);
  });

  it("falha de consulta bloqueia o envio com erro visível", async () => {
    meta.templates = approvedTemplates();
    db.failOn.add("whatsapp_inbox_threads");
    await expect(tick("2026-11-16T14:00:00Z")).rejects.toThrow(/Conferência antes do envio falhou/);
    expect(byKey("checkout:ck-ana")).toMatchObject({ status: "pending", last_error: expect.stringContaining("conversas") });
    expect(db.tables["wa_jobs"]).toHaveLength(0);
  });

  it("lembrete só depois do envio confirmado + 4h, e no máximo um", async () => {
    meta.templates = approvedTemplates();
    await tick("2026-11-16T14:00:00Z");
    const recipient = db.tables["wa_campaign_recipients"]![0]!;
    // Ainda na fila: nenhum lembrete agendado.
    await tick("2026-11-16T19:00:00Z");
    expect(byKey("checkout:ck-ana")?.status).toBe("queued_initial");
    // Meta aceitou às 14:05Z.
    Object.assign(recipient, { status: "sent", sent_at: "2026-11-16T14:05:00Z", wa_message_id: "wamid.1" });
    await tick("2026-11-16T14:06:00Z");
    expect(byKey("checkout:ck-ana")).toMatchObject({ status: "waiting_reminder", reminder_due_at: "2026-11-16T18:05:00.000Z" });
    await tick("2026-11-16T18:00:00Z");
    expect(db.tables["wa_campaign_recipients"]).toHaveLength(1);
    await tick("2026-11-16T18:06:00Z");
    expect(byKey("checkout:ck-ana")?.status).toBe("queued_reminder");
    const reminder = db.tables["wa_campaign_recipients"]![1]!;
    Object.assign(reminder, { status: "sent", sent_at: "2026-11-16T18:07:00Z", wa_message_id: "wamid.2" });
    await tick("2026-11-16T18:10:00Z");
    await tick("2026-11-16T22:30:00Z");
    expect(byKey("checkout:ck-ana")?.status).toBe("completed");
    expect(db.tables["wa_campaign_recipients"]).toHaveLength(2);
  });

  it("entradas contínuas a partir da instalação, com espera de 30 min e sem duplicar por telefone", async () => {
    meta.templates = approvedTemplates();
    db.tables["shopify_abandoned_checkouts"]!.push(
      { id: "ck-new", customer_id: null, email: "dani@x.com", phone: "+5541966665555", checkout_url: "https://maniadmulher.com/77747060914/checkouts/ac/new", created_at: "2026-11-16T13:45:00Z", raw_data: { completedAt: null, customer: { firstName: "Dani" } }, completed_at: null },
      { id: "ck-new2", customer_id: null, email: "dani@x.com", phone: "+554166665555", checkout_url: "https://maniadmulher.com/77747060914/checkouts/ac/new2", created_at: "2026-11-16T13:20:00Z", raw_data: { completedAt: null }, completed_at: null },
    );
    await tick("2026-11-16T14:00:00Z");
    expect(byKey("checkout:ck-new")).toBeUndefined(); // 15 min: ainda esperando
    expect(byKey("checkout:ck-new2")?.status).toBe("queued_initial");
    await tick("2026-11-16T14:16:00Z");
    expect(byKey("checkout:ck-new")).toMatchObject({ status: "excluded", exit_reason: "pessoa já está em uma recuperação aberta" });
  });
});

describe("worker: reconferência imediatamente antes do envio", () => {
  async function queued() {
    meta.templates = approvedTemplates();
    await tick("2026-11-16T14:00:00Z");
    const recipient = db.tables["wa_campaign_recipients"]![0]!;
    const campaign = { id: recipient.campaign_id, automation_id: AUTOMATION_ID, automation_step_id: "recovery_initial" };
    return { recipient, items: [{ recipientId: recipient.id, campaign }] };
  }

  it("tudo limpo: envia", async () => {
    const { recipient, items } = await queued();
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"));
    expect(d.get(recipient.id)).toEqual({ kind: "send" });
  });

  it("compra feita entre a fila e o envio cancela e encerra a tentativa", async () => {
    const { recipient, items } = await queued();
    db.tables["shopify_orders"]!.push({ id: "o-ana", customer_id: null, email: "ANA@x.com", phone: null, financial_status: "PAID", cancelled_at: null, created_at: "2026-11-16T14:00:30Z" });
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"));
    expect(d.get(recipient.id)).toEqual({ kind: "cancel", reason: "compra posterior à tentativa" });
    expect(byKey("checkout:ck-ana")).toMatchObject({ status: "exited", exit_reason: "compra posterior à tentativa" });
  });

  it("resposta recebida entre a fila e o envio (número sem o 9) cancela", async () => {
    const { recipient, items } = await queued();
    db.tables["whatsapp_inbox_threads"]!.push({ id: "t1", phone: "+553192904210" });
    db.tables["whatsapp_inbox_messages"]!.push({ thread_id: "t1", direction: "inbound", sent_at: "2026-11-16T14:00:40Z" });
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"));
    expect(d.get(recipient.id)).toEqual({ kind: "cancel", reason: "cliente respondeu" });
  });

  it("pedido PIX pendente posterior cancela (não duplica cobrança)", async () => {
    const { recipient, items } = await queued();
    db.tables["shopify_orders"]!.push({ id: "o-pix", customer_id: "c-ana", email: null, phone: null, financial_status: "PENDING", cancelled_at: null, created_at: "2026-11-16T14:00:30Z" });
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"));
    expect(d.get(recipient.id)).toMatchObject({ kind: "cancel" });
  });

  it("opt-out registrado entre a fila e o envio cancela", async () => {
    const { recipient, items } = await queued();
    db.tables["whatsapp_suppressions"]!.push({ phone: "+5531992904210", marketing_opt_out: true });
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"));
    expect(d.get(recipient.id)).toEqual({ kind: "cancel", reason: "opt-out de marketing" });
  });

  it("fora da janela adia para 09h sem enviar", async () => {
    const { recipient, items } = await queued();
    db.tables["whatsapp_automations"]![0]!.trigger_config.recoveryGate.checkedAt = "2026-11-16T22:25:00Z";
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T22:30:00Z"));
    expect(d.get(recipient.id)).toEqual({ kind: "defer", until: "2026-11-17T12:00:00.000Z", reason: expect.stringContaining("janela") });
  });

  it("sem confirmação recente da Meta adia", async () => {
    const { recipient, items } = await queued();
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T15:00:00Z")); // gate de 14:00 > 15 min
    expect(d.get(recipient.id)).toMatchObject({ kind: "defer" });
  });

  it("falha de consulta lança erro (worker não envia)", async () => {
    const { items } = await queued();
    db.failOn.add("shopify_orders");
    await expect(decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"))).rejects.toThrow(/pedidos posteriores/);
  });

  it("job reenfileirado por fora do fluxo é cancelado", async () => {
    const { recipient, items } = await queued();
    byKey("checkout:ck-ana")!.status = "failed";
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"));
    expect(d.get(recipient.id)).toMatchObject({ kind: "cancel" });
  });
});

describe("fluxo inativo e leituras acima de 1000 linhas", () => {
  async function queued() {
    meta.templates = approvedTemplates();
    await tick("2026-11-16T14:00:00Z");
    const recipient = db.tables["wa_campaign_recipients"]![0]!;
    const campaign = { id: recipient.campaign_id, automation_id: AUTOMATION_ID, automation_step_id: "recovery_initial" };
    return { recipient, items: [{ recipientId: recipient.id, campaign }] };
  }

  it("fluxo marcado como inativo não envia itens já na fila, mesmo com gate aprovado", async () => {
    const { recipient, items } = await queued();
    db.tables["whatsapp_automations"]![0]!.inativa = true;
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"));
    expect(d.get(recipient.id)).toMatchObject({ kind: "defer", reason: expect.stringContaining("inativo") });
  });

  it("descoberta contínua lê todas as páginas: a tentativa mais nova depois de 1000 é vista", async () => {
    const checkouts = db.tables["shopify_abandoned_checkouts"]!;
    for (let i = 0; i < 1100; i++) {
      const n = String(i).padStart(4, "0");
      checkouts.push({
        id: `ck-bulk-${n}`, customer_id: null, email: null, phone: `+55119${String(60000000 + i)}`,
        checkout_url: `https://maniadmulher.com/77747060914/checkouts/ac/bulk${n}`,
        created_at: new Date(Date.parse("2026-11-15T22:00:00Z") + i * 30_000).toISOString(), raw_data: { completedAt: null }, completed_at: null,
      });
    }
    checkouts.push({
      id: "ck-newest", customer_id: null, email: null, phone: "+5541955554444",
      checkout_url: "https://maniadmulher.com/77747060914/checkouts/ac/newest",
      created_at: "2026-11-16T13:29:00Z", raw_data: { completedAt: null }, completed_at: null,
    });
    await tick("2026-11-16T14:00:00Z"); // modelos PENDING: só registra
    expect(byKey("checkout:ck-newest")?.status).toBe("pending");
    expect(attempts().filter((a) => a.cohort === "continuous")).toHaveLength(1101);
  });

  it("compra bloqueadora numa página seguinte (após 1000 pedidos) impede o envio", async () => {
    const { recipient, items } = await queued();
    const orders = db.tables["shopify_orders"]!;
    for (let i = 0; i < 1100; i++) {
      orders.push({ id: `o-noise-${String(i).padStart(4, "0")}`, customer_id: "c-ana", email: null, phone: null, financial_status: "EXPIRED", cancelled_at: null, created_at: new Date(Date.parse("2026-11-13T16:00:00Z") + i * 1000).toISOString() });
    }
    orders.push({ id: "o-ana-late-paid", customer_id: "c-ana", email: null, phone: null, financial_status: "PAID", cancelled_at: null, created_at: "2026-11-16T14:00:30Z" });
    const d = await decideRecoveryJobsBeforeSend(items, new Date("2026-11-16T14:01:00Z"));
    expect(d.get(recipient.id)).toEqual({ kind: "cancel", reason: "compra posterior à tentativa" });
  });

  it("resposta numa página seguinte (após 1000 mensagens) impede o envio", async () => {
    const base = { automation_id: AUTOMATION_ID, source: "checkout", cohort: "continuous", status: "queued_initial", initial_recipient_id: null, created_at: "2026-11-16T12:00:00Z" };
    const ana = { ...base, id: "a-ana", attempt_key: "checkout:ck-ana", source_id: "ck-ana", customer_id: "c-ana", email: "ana@x.com", phone: "+5531992904210", phone_key: "+5531992904210", recovery_url: "https://maniadmulher.com/77747060914/checkouts/ac/ana", attempt_at: "2026-11-13T15:00:00Z" };
    // Outra tentativa mais antiga no mesmo lote: o corte do lote recua e as conversas dela ocupam a 1ª página.
    const ze = { ...base, id: "a-ze", attempt_key: "checkout:ck-ze", source_id: "ck-ze", customer_id: null, email: null, phone: "+5548933332222", phone_key: "+5548933332222", recovery_url: "https://maniadmulher.com/77747060914/checkouts/ac/ze", attempt_at: "2026-11-10T00:00:00Z" };
    db.tables["whatsapp_inbox_threads"]!.push({ id: "t-ze", phone: "+5548933332222" }, { id: "t-ana", phone: "+5531992904210" });
    const messages = db.tables["whatsapp_inbox_messages"]!;
    for (let i = 0; i < 1100; i++) messages.push({ id: `m-${String(i).padStart(5, "0")}`, thread_id: "t-ze", direction: "inbound", sent_at: "2026-11-11T10:00:00Z" });
    messages.push({ id: "m-99999", thread_id: "t-ana", direction: "inbound", sent_at: "2026-11-16T14:00:40Z" });
    const { loadGuardFacts } = await import("./purchase-recovery.server");
    const { parseRecoveryConfig, evaluateRecoveryGuards } = await import("./purchase-recovery");
    const facts = await loadGuardFacts([ana, ze] as any, parseRecoveryConfig(automation().trigger_config), ["maniadmulher.com"], "initial");
    expect(evaluateRecoveryGuards(facts.get("a-ana")!)).toEqual({ send: false, reason: "cliente respondeu" });
  });
});

// ---------------------------------------------------------------------------
// Worker real (processWhatsappQueueBatch) com provedor simulado
// ---------------------------------------------------------------------------
describe("worker da fila: reconferência depois da espera do ritmo e antes do provedor", () => {
  const PEOPLE = [
    { key: "ana", customer: "c-ana", phone: "+5531992904210", email: "ana@x.com", checkout: "ck-ana", attemptAt: "2026-11-13T15:00:00Z" },
    { key: "bia", customer: "c-bia", phone: "+5511988887777", email: "bia@x.com", checkout: "ck-bia", attemptAt: "2026-11-14T15:00:00Z" },
  ];

  function seedQueue(now: string, opts: { withOtherFlow?: boolean } = {}) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    db.tables["shopify_orders"] = []; // ninguém comprou ainda
    const automationRow = db.tables["whatsapp_automations"]![0]!;
    automationRow.trigger_config.recoveryGate = { ok: true, checkedAt: now, reason: null };
    db.tables["wa_campaigns"] = [
      { id: "camp-rec", origin: "automacao", automation_id: AUTOMATION_ID, automation_step_id: "recovery_initial", template_name: RECOVERY_TEMPLATES.initial.name, template_language: "pt_BR", message_type: "marketing", body_params: [], body_param_tokens: null, header_media_url: null, total_recipients: 2, sent_count: 0, failed_count: 0 },
      { id: "camp-other", origin: "crm", automation_id: null, automation_step_id: null, template_name: "outro_modelo", template_language: "pt_BR", message_type: "utility", body_params: [], body_param_tokens: null, header_media_url: null, total_recipients: 1, sent_count: 0, failed_count: 0 },
    ];
    const past = new Date(Date.parse(now) - 60_000).toISOString();
    PEOPLE.forEach((p, i) => {
      attempts().push({
        id: `att-${p.key}`, automation_id: AUTOMATION_ID, attempt_key: `checkout:${p.checkout}`, source: "checkout", source_id: p.checkout, cohort: "initial",
        customer_id: p.customer, email: p.email, phone: p.phone, phone_key: p.phone, first_name: p.key, recovery_url: `https://maniadmulher.com/77747060914/checkouts/ac/${p.key}`,
        attempt_at: p.attemptAt, eligible_at: p.attemptAt, status: "queued_initial", initial_recipient_id: `rec-${p.key}`, created_at: "2026-11-16T12:00:00Z",
      });
      db.tables["wa_campaign_recipients"]!.push({ id: `rec-${p.key}`, campaign_id: "camp-rec", customer_id: p.customer, name: p.key, phone: p.phone, params: [p.key, "https://maniadmulher.com/x"], status: "queued", event_key: `checkout:${p.checkout}:initial` });
      db.tables["wa_jobs"]!.push({ id: `job-${p.key}`, campaign_id: "camp-rec", recipient_id: `rec-${p.key}`, status: "queued", attempts: 0, max_attempts: 3, priority: 5, scheduled_at: past, next_attempt_at: past, created_at: `2026-11-16T12:00:0${i}Z` });
    });
    if (opts.withOtherFlow) {
      db.tables["wa_campaign_recipients"]!.push({ id: "rec-other", campaign_id: "camp-other", customer_id: "c-cris", name: "Cris", phone: "+5521977776666", params: ["Cris"], status: "queued", event_key: "" });
      db.tables["wa_jobs"]!.push({ id: "job-other", campaign_id: "camp-other", recipient_id: "rec-other", status: "queued", attempts: 0, max_attempts: 3, priority: 5, scheduled_at: past, next_attempt_at: past, created_at: "2026-11-16T12:00:09Z" });
    }
  }

  const job = (id: string) => db.tables["wa_jobs"]!.find((j) => j.id === id)!;
  const recipientRow = (id: string) => db.tables["wa_campaign_recipients"]!.find((r) => r.id === id)!;
  const sentTo = () => meta.sends.map((s) => s.to);

  it("sem mudanças: os dois itens saem e outros fluxos continuam", async () => {
    seedQueue("2026-11-16T14:00:00Z", { withOtherFlow: true });
    const r = await processWhatsappQueueBatch({ limit: 50 });
    expect(r).toMatchObject({ success: true, claimed: 3, sent: 3 });
    expect(sentTo()).toEqual(["+5531992904210", "+5511988887777", "+5521977776666"]);
  });

  it("compra durante a espera do ritmo: zero chamadas ao provedor para o item afetado; demais seguem", async () => {
    seedQueue("2026-11-16T14:00:00Z", { withOtherFlow: true });
    gateHook.fn = (call) => {
      if (call === 2) db.tables["shopify_orders"]!.push({ id: "o-bia-now", customer_id: "c-bia", email: null, phone: null, financial_status: "PAID", cancelled_at: null, created_at: "2026-11-16T14:00:00Z" });
    };
    const r = await processWhatsappQueueBatch({ limit: 50 });
    expect(sentTo()).toEqual(["+5531992904210", "+5521977776666"]);
    expect(r).toMatchObject({ sent: 2 });
    expect(job("job-bia").status).toBe("cancelled");
    expect(recipientRow("rec-bia")).toMatchObject({ status: "cancelled", error_message: "compra posterior à tentativa" });
    expect(byKey("checkout:ck-bia")).toMatchObject({ status: "exited", exit_reason: "compra posterior à tentativa" });
  });

  it("resposta recebida durante a espera do ritmo: item não vai ao provedor", async () => {
    seedQueue("2026-11-16T14:00:00Z");
    gateHook.fn = (call) => {
      if (call !== 2) return;
      db.tables["whatsapp_inbox_threads"]!.push({ id: "t-bia", phone: "+5511988887777" });
      db.tables["whatsapp_inbox_messages"]!.push({ id: "m-bia", thread_id: "t-bia", direction: "inbound", sent_at: "2026-11-16T14:00:00Z" });
    };
    await processWhatsappQueueBatch({ limit: 50 });
    expect(sentTo()).toEqual(["+5531992904210"]);
    expect(byKey("checkout:ck-bia")).toMatchObject({ status: "exited", exit_reason: "cliente respondeu" });
  });

  it("opt-out registrado depois da onda anterior: item não vai ao provedor", async () => {
    seedQueue("2026-11-16T14:00:00Z");
    gateHook.fn = (call) => {
      if (call === 2) db.tables["whatsapp_suppressions"]!.push({ phone: "+5511988887777", marketing_opt_out: true });
    };
    await processWhatsappQueueBatch({ limit: 50 });
    expect(sentTo()).toEqual(["+5531992904210"]);
    expect(recipientRow("rec-bia").status).toBe("cancelled");
    expect(byKey("checkout:ck-bia")).toMatchObject({ status: "exited", exit_reason: "opt-out de marketing" });
  });

  it("relógio chega às 19h durante a espera: item volta à fila sem gastar tentativa nem trava, sem provedor", async () => {
    seedQueue("2026-11-16T21:59:30Z"); // 18:59:30 Brasília
    gateHook.fn = (call) => {
      if (call === 2) vi.setSystemTime(new Date("2026-11-16T22:00:00Z")); // 19:00
    };
    await processWhatsappQueueBatch({ limit: 50 });
    expect(sentTo()).toEqual(["+5531992904210"]);
    expect(job("job-bia")).toMatchObject({ status: "retry_wait", attempts: 0, locked_by: null, locked_at: null, next_attempt_at: "2026-11-17T12:00:00.000Z" });
    expect(recipientRow("rec-bia").status).toBe("queued");
    expect(byKey("checkout:ck-bia")?.status).toBe("queued_initial");
  });

  it("erro na consulta durante a reconferência: não envia e deixa erro visível", async () => {
    seedQueue("2026-11-16T14:00:00Z");
    gateHook.fn = (call) => {
      if (call === 2) db.failOn.add("whatsapp_inbox_threads");
    };
    const r = await processWhatsappQueueBatch({ limit: 50 });
    expect(sentTo()).toEqual(["+5531992904210"]);
    expect(r).toMatchObject({ sent: 1, retry: 1 });
    expect(job("job-bia")).toMatchObject({ status: "retry_wait", error: expect.stringContaining("Envio bloqueado") });
    expect(recipientRow("rec-bia").status).toBe("queued");
  });

  it("fluxo inativo: itens na fila não chamam o provedor e voltam sem gastar tentativa", async () => {
    seedQueue("2026-11-16T14:00:00Z", { withOtherFlow: true });
    db.tables["whatsapp_automations"]![0]!.inativa = true;
    await processWhatsappQueueBatch({ limit: 50 });
    expect(sentTo()).toEqual(["+5521977776666"]);
    expect(job("job-ana")).toMatchObject({ status: "retry_wait", attempts: 0, locked_by: null });
    expect(job("job-bia")).toMatchObject({ status: "retry_wait", attempts: 0, locked_by: null });
  });
});
