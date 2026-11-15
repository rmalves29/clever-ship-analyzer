import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Banco em memória (subconjunto do cliente usado pelo fluxo)
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, failOn: new Set<string>(), seq: 0 }));

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "update" | "insert" | "upsert" = "select";
  let payload: any = null;
  let onConflict: string | null = null;
  let ignoreDuplicates = false;
  let limitN: number | null = null;
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
    const matched = rows().filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      for (const r of matched) Object.assign(r, payload);
      return { data: returning ? matched : null, error: null };
    }
    let data = matched.map((r) => ({ ...r }));
    if (limitN !== null) data = data.slice(0, limitN);
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
    order: () => b,
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

function rpc(name: string, args: any) {
  const emails = (args.p_emails as string[]).map((e) => e.toLowerCase());
  if (name === "purchase_recovery_orders_by_emails") {
    if (db.failOn.has("shopify_orders")) return Promise.resolve({ data: null, error: { message: "falha simulada em shopify_orders" } });
    const data = (db.tables["shopify_orders"] ?? []).filter((o) => o.email && emails.includes(String(o.email).toLowerCase()) && new Date(o.created_at) >= new Date(args.p_since));
    return Promise.resolve({ data, error: null });
  }
  if (name === "purchase_recovery_customers_by_emails") {
    const data = (db.tables["shopify_customers"] ?? []).filter((c) => c.email && emails.includes(String(c.email).toLowerCase()));
    return Promise.resolve({ data, error: null });
  }
  return Promise.resolve({ data: null, error: { message: `rpc desconhecida ${name}` } });
}

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => builder(t), rpc } }));

const meta = vi.hoisted(() => ({ templates: [] as any[], apiError: null as string | null, campaigns: 0 }));
vi.mock("./whatsapp-meta.server", () => ({
  listMetaTemplates: async () => (meta.apiError ? { success: false, error: meta.apiError, templates: [] } : { success: true, templates: meta.templates }),
  createCampaignRow: async () => {
    meta.campaigns++;
    const id = `camp-${meta.campaigns}`;
    (db.tables["wa_campaigns"] ??= []).push({ id });
    return { success: true, campaignId: id };
  },
}));

import { PURCHASE_RECOVERY_IMPLEMENTATION, RECOVERY_TEMPLATES } from "./purchase-recovery";
import { decideRecoveryJobsBeforeSend, runPurchaseRecoveryTick } from "./purchase-recovery.server";

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
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

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
