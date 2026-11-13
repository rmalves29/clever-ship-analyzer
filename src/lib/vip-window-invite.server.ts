import {
  TAG_VIP_INVITE_SENT,
  VIP_BLOCK_TAGS,
  VIP_INVITE_CLOSE_HOURS,
  VIP_INVITE_LINK,
  VIP_TRIGGER_FLAG,
  vipInviteSendable,
  vipInviteText,
} from "./vip-window-invite-shared";

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export type VipInviteResult = {
  skipped?: string;
  dryRun?: boolean;
  fila?: { reguas: number; clientes_nas_reguas: number; responderam_na_janela: number; barrados: number; ja_receberam: number; fora_do_horario: number; a_enviar: number };
  enviados?: number;
  falhas?: number;
  exemplos_falha?: string[];
};

/**
 * Chamada de 10 em 10 minutos. Convida para o Grupo VIP, em TEXTO LIVRE, quem passou por uma régua marcada
 * (`vipWindowInvite: true` no gatilho) e RESPONDEU depois de entrar nela — na 20ª hora da janela de 24h (sempre entre
 * 08:00 e 20:30 de Brasília). Quem não respondeu não recebe nada: sem janela aberta não há texto livre.
 */
export async function runVipWindowInvites(opts: { dryRun?: boolean; now?: Date; maxSends?: number; deadlineMs?: number } = {}): Promise<VipInviteResult> {
  const now = opts.now ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  const db = await admin();

  // 1) réguas que participam
  const { data: automations, error: automationsError } = await db
    .from("whatsapp_automations")
    .select("id")
    .filter(`trigger_config->>${VIP_TRIGGER_FLAG}`, "eq", "true");
  if (automationsError) throw new Error(automationsError.message);
  const automationIds: string[] = (automations ?? []).map((a: { id: string }) => String(a.id));
  if (automationIds.length === 0) return { skipped: "nenhuma régua marcada para o convite do Grupo VIP" };

  // 2) quem entrou nessas réguas nos últimos 4 dias (a janela de 24h nunca alcança além disso)
  const since = new Date(now.getTime() - 4 * 24 * 3_600_000).toISOString();
  const runs: { customer_id: string; enrolled_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("whatsapp_automation_runs")
      .select("customer_id, enrolled_at")
      .in("automation_id", automationIds)
      .gte("enrolled_at", since)
      .not("customer_id", "is", null)
      .order("enrolled_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    runs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const enrolledByCustomer = new Map<string, number[]>();
  for (const r of runs) {
    const list = enrolledByCustomer.get(String(r.customer_id)) ?? [];
    list.push(new Date(r.enrolled_at).getTime());
    enrolledByCustomer.set(String(r.customer_id), list);
  }
  const customerIds = [...enrolledByCustomer.keys()];
  if (customerIds.length === 0) return { skipped: "ninguém entrou nas réguas marcadas nos últimos 4 dias", fila: { reguas: automationIds.length, clientes_nas_reguas: 0, responderam_na_janela: 0, barrados: 0, ja_receberam: 0, fora_do_horario: 0, a_enviar: 0 } };

  // 3) conversas dessas clientes com resposta dentro da janela de 24h
  const windowStart = new Date(now.getTime() - VIP_INVITE_CLOSE_HOURS * 3_600_000).toISOString();
  const threads: { id: string; phone: string; customer_id: string | null; contact_name: string | null; last_inbound_at: string | null }[] = [];
  for (const part of chunk(customerIds, 150)) {
    const { data, error } = await db
      .from("whatsapp_inbox_threads")
      .select("id, phone, customer_id, contact_name, last_inbound_at")
      .in("customer_id", part)
      .gt("last_inbound_at", windowStart);
    if (error) throw new Error(error.message);
    threads.push(...(data ?? []));
  }
  // só conta resposta DEPOIS de entrar na régua (não uma conversa antiga qualquer)
  const answered = threads.filter((t) => {
    const lastInbound = t.last_inbound_at ? new Date(t.last_inbound_at).getTime() : 0;
    return (enrolledByCustomer.get(String(t.customer_id)) ?? []).some((enrolledAt) => enrolledAt <= lastInbound);
  });

  // 4) quem recusou ou já recebeu fica de fora
  const blockedIds = new Set<string>();
  const firstNameById = new Map<string, string | null>();
  for (const part of chunk([...new Set(answered.map((t) => String(t.customer_id)))], 150)) {
    const { data, error } = await db.from("shopify_customers").select("id, first_name, tags_custom").in("id", part);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      firstNameById.set(String(c.id), c.first_name ?? null);
      const tags: string[] = Array.isArray(c.tags_custom) ? c.tags_custom : [];
      if (tags.some((tag) => VIP_BLOCK_TAGS.includes(tag))) blockedIds.add(String(c.id));
    }
  }
  const already = new Set<string>();
  for (const part of chunk(answered.map((t) => t.id), 150)) {
    const { data, error } = await db
      .from("whatsapp_inbox_messages")
      .select("thread_id")
      .eq("direction", "outbound")
      .eq("status", "sent")
      .like("body", `%${VIP_INVITE_LINK}%`)
      .in("thread_id", part);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) already.add(String(r.thread_id));
  }

  const open = answered.filter((t) => !blockedIds.has(String(t.customer_id)) && !already.has(t.id));
  const due = open.filter((t) => vipInviteSendable(new Date(t.last_inbound_at as string), now));
  const fila = {
    reguas: automationIds.length,
    clientes_nas_reguas: customerIds.length,
    responderam_na_janela: answered.length,
    barrados: answered.filter((t) => blockedIds.has(String(t.customer_id))).length,
    ja_receberam: answered.filter((t) => already.has(t.id)).length,
    fora_do_horario: open.length - due.length,
    a_enviar: due.length,
  };
  if (dryRun) return { dryRun: true, fila };

  // 5) envio, devagar e com limite por ciclo (o resto sai no próximo, ainda dentro da janela)
  const { sendInboxReply } = await import("./whatsapp-inbox.server");
  const maxSends = opts.maxSends ?? 100;
  const deadline = opts.deadlineMs ?? Date.now() + 100_000;
  const sentThreads: string[] = [];
  const falhas: string[] = [];
  for (const t of due) {
    if (sentThreads.length + falhas.length >= maxSends || Date.now() > deadline) break;
    const text = vipInviteText(firstNameById.get(String(t.customer_id)) ?? t.contact_name);
    const result = await sendInboxReply(t.id, text);
    if (result.success) sentThreads.push(t.id);
    else falhas.push(result.error ?? "erro desconhecido");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // 6) marca quem recebeu (vale para todas as réguas: ninguém recebe o convite duas vezes)
  for (const part of chunk(sentThreads, 100)) {
    const { error } = await db.rpc("tag_customers_by_threads", { p_thread_ids: part, p_tag: TAG_VIP_INVITE_SENT });
    if (error) console.error("Falha ao marcar quem recebeu o convite do Grupo VIP:", error.message);
  }

  return { fila, enviados: sentThreads.length, falhas: falhas.length, exemplos_falha: [...new Set(falhas)].slice(0, 3) };
}
