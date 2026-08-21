import { z } from "zod";
import { format, subDays, addDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const GRAPH_VERSION = "v21.0";
const TZ = "America/Sao_Paulo";

export type EventCategory =
  | "preco"
  | "campanha"
  | "criativo"
  | "estoque"
  | "feriado"
  | "concorrencia"
  | "conteudo"
  | "outro";

export type CrmEvent = {
  id: string;
  eventDate: string;
  title: string;
  description: string | null;
  category: EventCategory;
  canais: string[];
  source: "manual" | "auto";
  createdAt: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function mapEvent(row: any): CrmEvent {
  return {
    id: row.id,
    eventDate: row.event_date,
    title: row.title,
    description: row.description,
    category: row.category,
    canais: row.canais ?? [],
    source: row.source ?? "manual",
    createdAt: row.created_at,
  };
}

export async function listEvents(range?: { from: string; to: string }): Promise<CrmEvent[]> {
  const supabaseAdmin = await admin();
  let query = (supabaseAdmin.from("crm_events" as any) as any).select("*").order("event_date", { ascending: true });
  if (range) query = query.gte("event_date", range.from).lte("event_date", range.to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEvent);
}

export async function createEvent(
  input: {
    eventDate: string;
    title: string;
    description?: string | undefined;
    category: EventCategory;
    canais: string[];
  },
  source: "manual" | "auto" = "manual",
): Promise<CrmEvent> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("crm_events" as any) as any)
    .insert({
      event_date: input.eventDate,
      title: input.title,
      description: input.description || null,
      category: input.category,
      canais: input.canais,
      source,
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapEvent(data);
}

export async function updateEvent(input: {
  id: string;
  eventDate: string;
  title: string;
  description?: string | undefined;
  category: EventCategory;
  canais: string[];
}): Promise<CrmEvent> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("crm_events" as any) as any)
    .update({
      event_date: input.eventDate,
      title: input.title,
      description: input.description || null,
      category: input.category,
      canais: input.canais,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapEvent(data);
}

export async function deleteEvent(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const { error } = await (supabaseAdmin.from("crm_events" as any) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true };
}

export type DayMetric = {
  date: string;
  faturamento: number;
  pedidos: number;
  metaSpend: number | null;
  metaRoas: number | null;
  metaPurchases: number | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const PURCHASE_TYPES = ["omni_purchase", "purchase"];

function pickAction(actions: Array<{ action_type: string; value: string }> | undefined, typesByPriority: string[]): number {
  if (!actions) return 0;
  for (const type of typesByPriority) {
    const match = actions.find((a) => a.action_type === type);
    if (match) return num(match.value);
  }
  return 0;
}

/** Série diária de faturamento/pedidos (Shopify) cruzada com gasto/ROAS do Meta Ads (quando conectado),
 *  no mesmo intervalo — é a base do cruzamento causal da tela de Eventos. */
export async function getEventsTimeline(range: { from: string; to: string }): Promise<{
  days: DayMetric[];
  events: CrmEvent[];
  metaConnected: boolean;
}> {
  const supabaseAdmin = await admin();

  const fromISO = new Date(`${range.from}T00:00:00-03:00`).toISOString();
  const toISO = new Date(`${range.to}T23:59:59-03:00`).toISOString();

  const { data: orders } = await supabaseAdmin
    .from("shopify_orders")
    .select("total_price, processed_at")
    .gte("processed_at", fromISO)
    .lte("processed_at", toISO)
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const byDate = new Map<string, { faturamento: number; pedidos: number }>();
  for (const o of orders ?? []) {
    if (!o.processed_at) continue;
    const day = new Date(o.processed_at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const slot = byDate.get(day) ?? { faturamento: 0, pedidos: 0 };
    slot.faturamento += num(o.total_price);
    slot.pedidos += 1;
    byDate.set(day, slot);
  }

  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("meta_ads_access_token, meta_ads_account_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const accessToken = (settings as any)?.meta_ads_access_token ?? null;
  const accountId = (settings as any)?.meta_ads_account_id ?? null;
  const metaByDate = new Map<string, { spend: number; roas: number | null; purchases: number }>();
  let metaConnected = false;

  if (accessToken && accountId) {
    metaConnected = true;
    try {
      const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/insights`);
      url.searchParams.set("level", "account");
      url.searchParams.set("time_increment", "1");
      url.searchParams.set("time_range", JSON.stringify({ since: range.from, until: range.to }));
      url.searchParams.set("fields", "spend,actions,action_values");
      url.searchParams.set("limit", "500");
      url.searchParams.set("access_token", accessToken);

      const res = await fetch(url.toString());
      const json: any = await res.json().catch(() => ({}));
      if (res.ok && !json?.error) {
        for (const raw of (json.data ?? []) as any[]) {
          const spend = num(raw.spend);
          const purchases = pickAction(raw.actions, PURCHASE_TYPES);
          const revenue = pickAction(raw.action_values, PURCHASE_TYPES);
          metaByDate.set(raw.date_start, {
            spend,
            purchases,
            roas: spend > 0 ? revenue / spend : null,
          });
        }
      }
    } catch {
      // Meta indisponível não deve quebrar a timeline — segue só com Shopify.
    }
  }

  const days: DayMetric[] = [];
  const cursor = new Date(`${range.from}T12:00:00Z`);
  const end = new Date(`${range.to}T12:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const shopify = byDate.get(key) ?? { faturamento: 0, pedidos: 0 };
    const meta = metaByDate.get(key);
    days.push({
      date: key,
      faturamento: Number(shopify.faturamento.toFixed(2)),
      pedidos: shopify.pedidos,
      metaSpend: meta ? Number(meta.spend.toFixed(2)) : null,
      metaRoas: meta?.roas != null ? Number(meta.roas.toFixed(2)) : null,
      metaPurchases: meta ? meta.purchases : null,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const events = await listEvents(range);

  return { days, events, metaConnected };
}

function yesterdayInSaoPaulo(): string {
  const nowSP = toZonedTime(new Date(), TZ);
  return format(subDays(nowSP, 1), "yyyy-MM-dd");
}

async function getShopifySessionsForDate(dateISO: string): Promise<{ sessions: number; visitors: number } | null> {
  const { runShopifyQL } = await import("./shopify-live-view.functions");
  const nextDay = format(addDays(new Date(`${dateISO}T12:00:00Z`), 1), "yyyy-MM-dd");
  const rows = await runShopifyQL(
    `FROM sessions SHOW sessions, online_store_visitors SINCE '${dateISO}' UNTIL '${nextDay}'`,
  );
  if (rows.length === 0) return null;
  return { sessions: num(rows[0]?.["sessions"]), visitors: num(rows[0]?.["online_store_visitors"]) };
}

async function getWhatsappActivityForDate(dateISO: string): Promise<{ templateName: string; messageType: string; recipients: number }[]> {
  const supabaseAdmin = await admin();
  const fromISO = new Date(`${dateISO}T00:00:00-03:00`).toISOString();
  const toISO = new Date(`${dateISO}T23:59:59-03:00`).toISOString();
  const { data: campaigns } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("id, template_name, message_type")
    .gte("sent_at", fromISO)
    .lte("sent_at", toISO);
  if (!campaigns || campaigns.length === 0) return [];

  const ids = campaigns.map((c: any) => c.id);
  const { data: recipients } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("campaign_id")
    .in("campaign_id", ids);
  const countByCampaign = new Map<string, number>();
  for (const r of recipients ?? []) {
    const cid = (r as any).campaign_id;
    countByCampaign.set(cid, (countByCampaign.get(cid) ?? 0) + 1);
  }
  return campaigns.map((c: any) => ({
    templateName: c.template_name as string,
    messageType: c.message_type as string,
    recipients: countByCampaign.get(c.id) ?? 0,
  }));
}

const dailyAutoEventSchema = z.object({
  title: z.string(),
  category: z.enum(["preco", "campanha", "criativo", "estoque", "feriado", "concorrencia", "conteudo", "outro"]),
  canais: z.array(z.enum(["shopify", "meta_ads", "instagram", "whatsapp"])),
  description: z.string(),
});

const dailyAnalysisSchema = z.object({
  resumo_texto: z.string(),
  destaques: z.array(dailyAutoEventSchema).max(3).default([]),
});

function buildDailyPrompt(
  dateISO: string,
  ctx: {
    shopify: DayMetric;
    sessions: { sessions: number; visitors: number } | null;
    instagram: { reachTotal: number; accountsEngaged: number; totalInteractions: number; profileViews: number } | null;
    whatsapp: { templateName: string; messageType: string; recipients: number }[];
  },
) {
  return `Você é um analista de e-commerce. Analise o dia ${dateISO} (ontem) com base SOMENTE nos dados reais abaixo — nunca invente números. Conecte o resultado de vendas do dia com o desempenho de cada canal.

DADOS REAIS DO DIA:
- Site/Shopify: faturamento R$${ctx.shopify.faturamento.toFixed(2)}, ${ctx.shopify.pedidos} pedidos${ctx.sessions ? `, ${ctx.sessions.sessions} sessões, ${ctx.sessions.visitors} visitantes únicos` : " (sessões do site indisponíveis)"}.
- Meta Ads: ${ctx.shopify.metaSpend != null ? `gasto R$${ctx.shopify.metaSpend.toFixed(2)}, ${ctx.shopify.metaPurchases ?? 0} compras atribuídas, ROAS ${ctx.shopify.metaRoas?.toFixed(2) ?? "0"}` : "não conectado ou sem dados nesse dia"}.
- Instagram: ${ctx.instagram ? `alcance ${ctx.instagram.reachTotal}, contas engajadas ${ctx.instagram.accountsEngaged}, interações ${ctx.instagram.totalInteractions}, visitas ao perfil ${ctx.instagram.profileViews}` : "não conectado ou sem dados nesse dia"}.
- WhatsApp: ${ctx.whatsapp.length ? ctx.whatsapp.map((c) => `campanha "${c.templateName}" (${c.messageType}) enviada pra ${c.recipients} contatos`).join("; ") : "nenhuma campanha enviada nesse dia"}.

Escreva um "resumo_texto" (2 a 4 frases, português do Brasil) explicando o resultado do dia canal por canal — cite os canais que tiverem dado disponível (ex: "o faturamento foi de RX com N pedidos; o Meta Ads teve ROAS de Y (gasto RZ); o site teve M sessões; o Instagram teve alcance de A"). Se um canal não tiver dado, diga que não há dado ao invés de inventar. Não repita a mesma frase genérica todo dia — descreva o que realmente aconteceu nesse dia específico.

Além disso, SE houver algo realmente digno de nota (gasto atipicamente alto/baixo, zero vendas, pico de engajamento incomum, campanha enviada), liste em "destaques" (0 a 3 itens). Se o dia foi normal, retorne destaques vazio — não invente eventos triviais.

Responda em JSON estrito:
{ "resumo_texto": string, "destaques": [ { "title": string, "category": "preco"|"campanha"|"criativo"|"estoque"|"feriado"|"concorrencia"|"conteudo"|"outro", "canais": ["shopify"|"meta_ads"|"instagram"|"whatsapp"], "description": string } ] }`;
}

async function callOpenAiDaily(apiKey: string, prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você é um analista de e-commerce sênior. Responda sempre em JSON válido, nunca invente números." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI respondeu ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou conteúdo.");
  return dailyAnalysisSchema.parse(JSON.parse(content));
}

/** Roda 1x por dia (via pg_cron + endpoint seguro em server.ts) — olha o dia anterior em todos os
 *  canais (Shopify/site, Meta Ads, Instagram, WhatsApp) e cria um evento de resumo automaticamente,
 *  além de destaques pontuais quando houver algo fora do padrão. Idempotente: não roda de novo se já
 *  existe um evento 'auto' pra essa data (evita duplicar se o cron disparar mais de uma vez). */
export async function runDailyEventsAnalysis(targetDateOverride?: string): Promise<{ created: number; skipped: boolean; date: string }> {
  const supabaseAdmin = await admin();
  const dateISO = targetDateOverride ?? yesterdayInSaoPaulo();

  const { data: existingAuto } = await (supabaseAdmin.from("crm_events" as any) as any)
    .select("id")
    .eq("event_date", dateISO)
    .eq("source", "auto")
    .limit(1);
  if (existingAuto && existingAuto.length > 0) {
    return { created: 0, skipped: true, date: dateISO };
  }

  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("openai_api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const apiKey = (settings as any)?.openai_api_key;
  if (!apiKey) return { created: 0, skipped: true, date: dateISO };

  const { days } = await getEventsTimeline({ from: dateISO, to: dateISO });
  const shopifyDay: DayMetric = days[0] ?? { date: dateISO, faturamento: 0, pedidos: 0, metaSpend: null, metaRoas: null, metaPurchases: null };

  let instagram: { reachTotal: number; accountsEngaged: number; totalInteractions: number; profileViews: number } | null = null;
  try {
    const { getInstagramOverview } = await import("./instagram.server");
    const igRes = await getInstagramOverview("yesterday");
    if (igRes.success) {
      instagram = {
        reachTotal: igRes.overview.reachTotal,
        accountsEngaged: igRes.overview.accountsEngaged,
        totalInteractions: igRes.overview.totalInteractions,
        profileViews: igRes.overview.profileViews,
      };
    }
  } catch {
    // Instagram indisponível não deve travar a análise diária.
  }

  let sessions: { sessions: number; visitors: number } | null = null;
  try {
    sessions = await getShopifySessionsForDate(dateISO);
  } catch {
    // ShopifyQL indisponível não deve travar a análise diária.
  }

  const whatsapp = await getWhatsappActivityForDate(dateISO);

  const prompt = buildDailyPrompt(dateISO, { shopify: shopifyDay, sessions, instagram, whatsapp });

  let analysis: z.infer<typeof dailyAnalysisSchema>;
  try {
    analysis = await callOpenAiDaily(apiKey, prompt);
  } catch (error) {
    console.error("[events] Falha na análise diária automática:", error);
    return { created: 0, skipped: false, date: dateISO };
  }

  const canaisComDados = [
    shopifyDay.faturamento > 0 || shopifyDay.pedidos > 0 || sessions ? "shopify" : null,
    shopifyDay.metaSpend != null ? "meta_ads" : null,
    instagram ? "instagram" : null,
    whatsapp.length > 0 ? "whatsapp" : null,
  ].filter((c): c is string => Boolean(c));

  await createEvent(
    {
      eventDate: dateISO,
      title: `Resumo do dia ${format(new Date(`${dateISO}T12:00:00Z`), "dd/MM")}`,
      description: analysis.resumo_texto,
      category: "outro",
      canais: canaisComDados,
    },
    "auto",
  );

  for (const ev of analysis.destaques) {
    await createEvent(
      { eventDate: dateISO, title: ev.title, description: ev.description, category: ev.category, canais: ev.canais },
      "auto",
    );
  }

  return { created: 1 + analysis.destaques.length, skipped: false, date: dateISO };
}
