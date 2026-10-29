import {
  FOLLOWUP_CAMPAIGN_ID,
  FOLLOWUP_END,
  FOLLOWUP_LINK,
  FOLLOWUP_REPLIES_SINCE,
  FOLLOWUP_TEXT,
  TAG_LINK_SENT,
  TAG_NO_INTEREST,
  classifyReply,
  isInsideSendWindow,
  phoneKey,
} from "./whatsapp-link-followup-shared";

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export type FollowupResult = {
  skipped?: string;
  dryRun?: boolean;
  respostas: { positiva: number; ok: number; negativa: number; outra: number };
  fila?: { elegiveis: number; barrados_sem_interesse: number; ja_receberam: number; fora_da_janela_24h: number; a_enviar: number };
  enviados?: number;
  falhas?: number;
  exemplos_falha?: string[];
  marcados_sem_interesse?: number;
  marcados_link_enviado?: number;
};

const EMPTY = { positiva: 0, ok: 0, negativa: 0, outra: 0 };

/**
 * Chamada de 20 em 20 minutos. Envia o link do grupo para quem respondeu positivo ao "Convite Black".
 * - Só envia entre 08:00 e 20:00 (Brasília). Fora disso não faz nada: as respostas ficam acumuladas no banco e
 *   saem no primeiro ciclo das 08:00 (a janela de 24h da Meta cobre essa espera, no máximo ~12h).
 * - Nunca envia a quem pediu para sair, nem repete para quem já recebeu o link.
 */
export async function runLinkFollowup(opts: { dryRun?: boolean; now?: Date; maxSends?: number; deadlineMs?: number } = {}): Promise<FollowupResult> {
  const now = opts.now ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  if (now.getTime() >= new Date(FOLLOWUP_END).getTime()) return { skipped: "encerrado (depois da Black Friday)", respostas: EMPTY };
  if (!isInsideSendWindow(now)) return { skipped: "fora do horário de envio (08:00–20:00); as respostas ficam acumuladas para o próximo ciclo", respostas: EMPTY };

  const db = await admin();

  // 1) quem recebeu o Convite Black (chave: DDD + últimos 8 dígitos)
  const recipients = await fetchAll<{ phone: string | null }>((from, to) =>
    db.from("wa_campaign_recipients").select("phone").eq("campaign_id", FOLLOWUP_CAMPAIGN_ID).order("id").range(from, to),
  );
  const recipientKeys = new Set(recipients.map((r) => phoneKey(r.phone)).filter(Boolean));

  // 2) última resposta (texto ou botão) de cada conversa depois do disparo
  const inbound = await fetchAll<{ thread_id: string; body: string | null }>((from, to) =>
    db
      .from("whatsapp_inbox_messages")
      .select("thread_id, body")
      .eq("direction", "inbound")
      .in("message_type", ["text", "button"])
      .gt("created_at", FOLLOWUP_REPLIES_SINCE)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const lastByThread = new Map<string, string>();
  for (const m of inbound) lastByThread.set(m.thread_id, String(m.body ?? ""));

  const threadIds = [...lastByThread.keys()];
  const threads: { id: string; phone: string; customer_id: string | null; last_inbound_at: string | null }[] = [];
  for (const part of chunk(threadIds, 150)) {
    const { data, error } = await db.from("whatsapp_inbox_threads").select("id, phone, customer_id, last_inbound_at").in("id", part);
    if (error) throw new Error(error.message);
    threads.push(...(data ?? []));
  }
  // só conversas de quem recebeu o convite (não mexe em respostas a outras mensagens do CRM)
  const ofCampaign = threads.filter((t) => recipientKeys.has(phoneKey(t.phone)));

  const respostas = { positiva: 0, ok: 0, negativa: 0, outra: 0 };
  const negativeIds: string[] = [];
  const eligible: typeof ofCampaign = [];
  for (const t of ofCampaign) {
    const cls = classifyReply(lastByThread.get(t.id));
    respostas[cls]++;
    if (cls === "negativa") negativeIds.push(t.id);
    else if (cls === "positiva" || cls === "ok") eligible.push(t);
  }

  // 3) quem pediu para sair fica marcado (vale para todos os próximos envios)
  let marcadosSemInteresse = 0;
  if (!dryRun && negativeIds.length > 0) {
    for (const part of chunk(negativeIds, 100)) {
      const { data, error } = await db.rpc("tag_customers_by_threads", { p_thread_ids: part, p_tag: TAG_NO_INTEREST });
      if (error) throw new Error(`Falha ao marcar quem pediu para sair: ${error.message}`);
      marcadosSemInteresse += Number(data ?? 0);
    }
  }

  // 4) barrar quem tem a marca de sem interesse (por vínculo ou telefone)
  const optedOut = await fetchAll<{ id: string; phone: string | null }>((from, to) =>
    db.from("shopify_customers").select("id, phone").contains("tags_custom", [TAG_NO_INTEREST]).order("id").range(from, to),
  );
  const optIds = new Set(optedOut.map((c) => c.id));
  const optKeys = new Set(optedOut.map((c) => phoneKey(c.phone)).filter(Boolean));
  const isOptedOut = (t: { phone: string; customer_id: string | null }) => (t.customer_id ? optIds.has(t.customer_id) : false) || optKeys.has(phoneKey(t.phone));

  // 5) quem já recebeu o link não recebe de novo
  const already = new Set<string>();
  for (const part of chunk(eligible.map((t) => t.id), 150)) {
    const { data, error } = await db
      .from("whatsapp_inbox_messages")
      .select("thread_id")
      .eq("direction", "outbound")
      .eq("status", "sent")
      .like("body", `%${FOLLOWUP_LINK}%`)
      .in("thread_id", part);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) already.add(r.thread_id);
  }

  // 6) janela de 24h da Meta (margem de 5 min)
  const windowLimit = now.getTime() - (24 * 60 - 5) * 60_000;
  const inWindow = (t: { last_inbound_at: string | null }) => Boolean(t.last_inbound_at) && new Date(t.last_inbound_at as string).getTime() > windowLimit;

  const blocked = eligible.filter(isOptedOut);
  const queue = eligible.filter((t) => !isOptedOut(t) && !already.has(t.id) && inWindow(t));
  const fila = {
    elegiveis: eligible.length,
    barrados_sem_interesse: blocked.length,
    ja_receberam: eligible.filter((t) => already.has(t.id)).length,
    fora_da_janela_24h: eligible.filter((t) => !isOptedOut(t) && !already.has(t.id) && !inWindow(t)).length,
    a_enviar: queue.length,
  };

  if (dryRun) return { dryRun: true, respostas, fila };

  // 7) envio, devagar e com limite de tempo/quantidade por ciclo (o resto sai no próximo)
  const { sendInboxReply } = await import("./whatsapp-inbox.server");
  const maxSends = opts.maxSends ?? 150;
  const deadline = opts.deadlineMs ?? Date.now() + 100_000;
  const sentThreadIds: string[] = [];
  const falhas: string[] = [];
  for (const t of queue) {
    if (sentThreadIds.length + falhas.length >= maxSends || Date.now() > deadline) break;
    const result = await sendInboxReply(t.id, FOLLOWUP_TEXT);
    if (result.success) sentThreadIds.push(t.id);
    else falhas.push(result.error ?? "erro desconhecido");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // 8) marca quem recebeu
  let marcadosLink = 0;
  for (const part of chunk(sentThreadIds, 100)) {
    const { data, error } = await db.rpc("tag_customers_by_threads", { p_thread_ids: part, p_tag: TAG_LINK_SENT });
    if (error) console.error("Falha ao marcar quem recebeu o link:", error.message);
    else marcadosLink += Number(data ?? 0);
  }

  return {
    respostas,
    fila,
    enviados: sentThreadIds.length,
    falhas: falhas.length,
    exemplos_falha: [...new Set(falhas)].slice(0, 3),
    marcados_sem_interesse: marcadosSemInteresse,
    marcados_link_enviado: marcadosLink,
  };
}
