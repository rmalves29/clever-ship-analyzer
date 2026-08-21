import { z } from "zod";
import { format, subDays, addDays, startOfMonth, differenceInCalendarDays } from "date-fns";
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

type MonthBaseline = {
  daysCounted: number;
  avgFaturamento: number;
  avgPedidos: number;
  avgMetaSpend: number | null;
  avgMetaRoas: number | null;
  igMonthAvgReach: number | null;
  igMonthAvgInteractions: number | null;
  avgSessions: number | null;
  whatsappCampanhasNoMes: number;
};

/** Média do mês corrente até o dia anterior ao alvo (exclui o próprio dia analisado) — é a régua
 *  usada pra dizer se o D-1 ficou acima/abaixo do normal, não um benchmark de mercado. */
async function getMonthBaseline(dateISO: string): Promise<MonthBaseline> {
  const target = new Date(`${dateISO}T12:00:00Z`);
  const monthStartISO = format(startOfMonth(target), "yyyy-MM-dd");
  const dayBeforeISO = format(subDays(target, 1), "yyyy-MM-dd");

  if (dayBeforeISO < monthStartISO) {
    return {
      daysCounted: 0,
      avgFaturamento: 0,
      avgPedidos: 0,
      avgMetaSpend: null,
      avgMetaRoas: null,
      igMonthAvgReach: null,
      igMonthAvgInteractions: null,
      avgSessions: null,
      whatsappCampanhasNoMes: 0,
    };
  }

  const { days } = await getEventsTimeline({ from: monthStartISO, to: dayBeforeISO });
  const n = Math.max(1, days.length);
  const avgFaturamento = days.reduce((a, d) => a + d.faturamento, 0) / n;
  const avgPedidos = days.reduce((a, d) => a + d.pedidos, 0) / n;
  const metaSpendDays = days.filter((d): d is typeof d & { metaSpend: number } => d.metaSpend != null);
  const avgMetaSpend = metaSpendDays.length ? metaSpendDays.reduce((a, d) => a + d.metaSpend, 0) / metaSpendDays.length : null;
  const roasDays = days.filter((d): d is typeof d & { metaRoas: number } => d.metaRoas != null);
  const avgMetaRoas = roasDays.length ? roasDays.reduce((a, d) => a + d.metaRoas, 0) / roasDays.length : null;

  let igMonthAvgReach: number | null = null;
  let igMonthAvgInteractions: number | null = null;
  try {
    const { getInstagramOverview } = await import("./instagram.server");
    const igRes = await getInstagramOverview("this_month");
    if (igRes.success) {
      const daysElapsed = Math.max(1, differenceInCalendarDays(target, startOfMonth(target)));
      igMonthAvgReach = igRes.overview.reachTotal / daysElapsed;
      igMonthAvgInteractions = igRes.overview.totalInteractions / daysElapsed;
    }
  } catch {
    // Instagram indisponível não deve travar o baseline.
  }

  let avgSessions: number | null = null;
  try {
    const sessRange = await getShopifySessionsRange(monthStartISO, dateISO);
    if (sessRange) avgSessions = sessRange.sessions / n;
  } catch {
    // ShopifyQL indisponível não deve travar o baseline.
  }

  const supabaseAdmin = await admin();
  const { data: campaignsThisMonth } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("id")
    .gte("sent_at", new Date(`${monthStartISO}T00:00:00-03:00`).toISOString())
    .lt("sent_at", new Date(`${dateISO}T00:00:00-03:00`).toISOString());

  return {
    daysCounted: days.length,
    avgFaturamento,
    avgPedidos,
    avgMetaSpend,
    avgMetaRoas,
    igMonthAvgReach,
    igMonthAvgInteractions,
    avgSessions,
    whatsappCampanhasNoMes: campaignsThisMonth?.length ?? 0,
  };
}

async function getShopifySessionsRange(sinceISO: string, untilISO: string): Promise<{ sessions: number; visitors: number } | null> {
  const { runShopifyQL } = await import("./shopify-live-view.functions");
  const rows = await runShopifyQL(
    `FROM sessions SHOW sessions, online_store_visitors SINCE '${sinceISO}' UNTIL '${untilISO}'`,
  );
  if (rows.length === 0) return null;
  return { sessions: num(rows[0]?.["sessions"]), visitors: num(rows[0]?.["online_store_visitors"]) };
}

async function getShopifySessionsForDate(dateISO: string): Promise<{ sessions: number; visitors: number } | null> {
  const nextDay = format(addDays(new Date(`${dateISO}T12:00:00Z`), 1), "yyyy-MM-dd");
  return getShopifySessionsRange(dateISO, nextDay);
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

/** Tradução do source_name do Shopify — o mais importante é marcar "shopify_draft_order" como
 *  pedido lançado manualmente pela equipe, pra IA nunca confundir isso com tráfego do site. */
const SOURCE_NAME_LABELS: Record<string, string> = {
  web: "compra direta no site (checkout normal do cliente)",
  shopify_draft_order: "pedido lançado manualmente pela equipe no admin (rascunho faturado à mão — NÃO é tráfego do site nem resultado de campanha)",
  pos: "venda presencial (Shopify POS)",
  iphone: "venda via app Shopify POS (iPhone)",
  android: "venda via app Shopify POS (Android)",
};

function labelSource(source: string): string {
  return SOURCE_NAME_LABELS[source] ?? `origem "${source}" (não mapeada)`;
}

/** De onde vieram os pedidos do dia (source_name do Shopify: direto, rascunho manual, POS, etc) —
 *  é o que permite achar a causa real de um pico quando Meta Ads/Instagram NÃO explicam o resultado. */
async function getOrderSourceBreakdown(dateISO: string): Promise<{ source: string; label: string; pedidos: number; receita: number }[]> {
  const supabaseAdmin = await admin();
  const fromISO = new Date(`${dateISO}T00:00:00-03:00`).toISOString();
  const toISO = new Date(`${dateISO}T23:59:59-03:00`).toISOString();
  const { data } = await supabaseAdmin
    .from("shopify_orders")
    .select("source_name, total_price")
    .gte("processed_at", fromISO)
    .lte("processed_at", toISO)
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const map = new Map<string, { pedidos: number; receita: number }>();
  for (const o of data ?? []) {
    const key = (o as any).source_name || "desconhecida";
    const slot = map.get(key) ?? { pedidos: 0, receita: 0 };
    slot.pedidos += 1;
    slot.receita += num((o as any).total_price);
    map.set(key, slot);
  }
  return Array.from(map.entries())
    .map(([source, v]) => ({ source, label: labelSource(source), ...v }))
    .sort((a, b) => b.receita - a.receita);
}

/** Quantos clientes do dia já tinham comprado antes (recorrente) vs nunca tinham comprado (novo) —
 *  diferencia "veio gente nova" de "a base recorrente comprou mais" como causa do resultado. */
async function getNewVsReturningForDate(dateISO: string): Promise<{ novos: number; recorrentes: number }> {
  const supabaseAdmin = await admin();
  const fromISO = new Date(`${dateISO}T00:00:00-03:00`).toISOString();
  const toISO = new Date(`${dateISO}T23:59:59-03:00`).toISOString();
  const { data: dayOrders } = await supabaseAdmin
    .from("shopify_orders")
    .select("customer_id")
    .gte("processed_at", fromISO)
    .lte("processed_at", toISO)
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const customerIds = Array.from(new Set((dayOrders ?? []).map((o: any) => o.customer_id).filter(Boolean)));
  if (customerIds.length === 0) return { novos: 0, recorrentes: 0 };

  const { data: priorOrders } = await supabaseAdmin
    .from("shopify_orders")
    .select("customer_id")
    .in("customer_id", customerIds)
    .lt("processed_at", fromISO);

  const returningSet = new Set((priorOrders ?? []).map((o: any) => o.customer_id));
  let novos = 0;
  let recorrentes = 0;
  for (const id of customerIds) {
    if (returningSet.has(id)) recorrentes++;
    else novos++;
  }
  return { novos, recorrentes };
}

const dailyAutoEventSchema = z.object({
  title: z.string(),
  category: z.enum(["preco", "campanha", "criativo", "estoque", "feriado", "concorrencia", "conteudo", "outro"]),
  canais: z.array(z.enum(["shopify", "meta_ads", "instagram", "whatsapp"])),
  description: z.string(),
});

const dailyAnalysisSchema = z.object({
  resumo_texto: z.string(),
  causa_provavel: z.string(),
  pontos_positivos: z.array(z.string()).max(4).default([]),
  pontos_negativos: z.array(z.string()).max(4).default([]),
  recomendacoes: z.array(z.string()).max(4).default([]),
  destaques: z.array(dailyAutoEventSchema).max(3).default([]),
});

function pct(value: number, base: number): string {
  if (!base) return "sem base de comparação";
  const delta = ((value - base) / base) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(0)}% vs média do mês`;
}

function buildDailyPrompt(
  dateISO: string,
  ctx: {
    shopify: DayMetric;
    sessions: { sessions: number; visitors: number } | null;
    instagram: { reachTotal: number; accountsEngaged: number; totalInteractions: number; profileViews: number } | null;
    whatsapp: { templateName: string; messageType: string; recipients: number }[];
    baseline: MonthBaseline;
    sources: { source: string; label: string; pedidos: number; receita: number }[];
    novosVsRecorrentes: { novos: number; recorrentes: number };
  },
) {
  const b = ctx.baseline;
  const ticketDia = ctx.shopify.pedidos > 0 ? ctx.shopify.faturamento / ctx.shopify.pedidos : 0;
  const ticketBaseline = b.avgPedidos > 0 ? b.avgFaturamento / b.avgPedidos : 0;
  const direcao = ctx.shopify.faturamento > b.avgFaturamento ? "SUBIU" : ctx.shopify.faturamento < b.avgFaturamento ? "CAIU" : "ficou estável";
  const conversaoDia = ctx.sessions && ctx.sessions.sessions > 0 ? (ctx.shopify.pedidos / ctx.sessions.sessions) * 100 : null;
  const conversaoBaseline = b.avgSessions && b.avgSessions > 0 ? (b.avgPedidos / b.avgSessions) * 100 : null;

  return `Você é um analista de e-commerce sênior, especialista em atribuição de causa (não só correlação). Analise o dia ${dateISO} (ontem) comparando com a MÉDIA DO MÊS corrente até esse dia, com base SOMENTE nos dados reais abaixo — nunca invente números.

O faturamento do dia ${direcao} em relação à média do mês. Sua tarefa central é responder: **o que REALMENTE explica essa direção**, e o que poderia ter sido feito de diferente (pra subir ainda mais, se subiu; ou pra não ter caído, se caiu).

REGRA MAIS IMPORTANTE — não liste os canais lado a lado sem checar a causalidade: um canal só "explica" o resultado se ele se moveu NA MESMA DIREÇÃO do faturamento. Se o faturamento subiu mas o gasto em Meta Ads e o alcance no Instagram caíram em relação à média, ESSES CANAIS NÃO SÃO A CAUSA do aumento — diga isso explicitamente e aponte pra origem real dos pedidos e pro perfil de cliente (novo vs recorrente) abaixo pra achar a causa verdadeira. Não deixe a IA "empurrar" ROAS ou alcance como causa só porque o número existe — some 2+2: gasto menor + alcance menor não geram mais venda.

REGRA SOBRE ORIGEM DOS PEDIDOS — preste atenção no que cada origem realmente significa (já vem explicado entre parênteses abaixo). Pedidos com origem "pedido lançado manualmente pela equipe" NÃO são tráfego do site nem resultado de marketing — são vendas fechadas por fora (WhatsApp, telefone, presencial) e depois lançadas no admin. NUNCA atribua esses pedidos a "o site atraiu clientes" ou a qualquer canal de aquisição — trate como uma categoria separada (venda direta/manual da equipe).

REGRA SOBRE SESSÕES — sempre compare as sessões do site (tráfego) com a média do mês E calcule se a TAXA DE CONVERSÃO (pedidos ÷ sessões) subiu ou caiu. É perfeitamente possível o faturamento subir com sessões caindo (conversão melhorou) ou sessões subirem sem o faturamento acompanhar (conversão piorou) — diga isso explicitamente, não assuma que sessão e venda andam sempre juntas.

DADOS DO DIA (D-1):
- Site/Shopify: faturamento R$${ctx.shopify.faturamento.toFixed(2)}, ${ctx.shopify.pedidos} pedidos, ticket médio R$${ticketDia.toFixed(2)}.
- Sessões do site: ${ctx.sessions ? `${ctx.sessions.sessions} sessões, ${ctx.sessions.visitors} visitantes únicos, taxa de conversão ${conversaoDia?.toFixed(2) ?? "0"}%` : "indisponíveis nesse dia"}.
- Origem dos pedidos do dia: ${ctx.sources.length ? ctx.sources.map((s) => `${s.pedidos} pedido(s) via ${s.label}, totalizando R$${s.receita.toFixed(2)}`).join("; ") : "sem pedidos no dia"}.
- Perfil de cliente do dia: ${ctx.novosVsRecorrentes.novos} clientes novos, ${ctx.novosVsRecorrentes.recorrentes} clientes recorrentes.
- Meta Ads: ${ctx.shopify.metaSpend != null ? `gasto R$${ctx.shopify.metaSpend.toFixed(2)}, ${ctx.shopify.metaPurchases ?? 0} compras atribuídas, ROAS ${ctx.shopify.metaRoas?.toFixed(2) ?? "0"}` : "não conectado ou sem dados nesse dia"}.
- Instagram: ${ctx.instagram ? `alcance ${ctx.instagram.reachTotal}, contas engajadas ${ctx.instagram.accountsEngaged}, interações ${ctx.instagram.totalInteractions}, visitas ao perfil ${ctx.instagram.profileViews}` : "não conectado ou sem dados nesse dia"}.
- WhatsApp: ${ctx.whatsapp.length ? ctx.whatsapp.map((c) => `campanha "${c.templateName}" (${c.messageType}) enviada pra ${c.recipients} contatos`).join("; ") : "nenhuma campanha enviada nesse dia"}.

MÉDIA DO MÊS ATÉ ANTES DE ONTEM (baseline, ${b.daysCounted} dia(s) considerados):
- Site/Shopify: faturamento médio R$${b.avgFaturamento.toFixed(2)}/dia (D-1 ficou ${pct(ctx.shopify.faturamento, b.avgFaturamento)}), ${b.avgPedidos.toFixed(1)} pedidos/dia (D-1 ficou ${pct(ctx.shopify.pedidos, b.avgPedidos)}), ticket médio R$${ticketBaseline.toFixed(2)} (D-1 ficou ${pct(ticketDia, ticketBaseline)}).
- Sessões: ${b.avgSessions != null ? `${b.avgSessions.toFixed(0)} sessões/dia em média${ctx.sessions ? ` (D-1 ficou ${pct(ctx.sessions.sessions, b.avgSessions)})` : ""}, conversão média ${conversaoBaseline?.toFixed(2) ?? "0"}%${conversaoDia != null && conversaoBaseline ? ` (D-1 ficou ${pct(conversaoDia, conversaoBaseline)})` : ""}` : "sem baseline de sessões"}.
- Meta Ads: ${b.avgMetaSpend != null ? `gasto médio R$${b.avgMetaSpend.toFixed(2)}/dia` : "sem baseline de gasto"}${ctx.shopify.metaSpend != null && b.avgMetaSpend != null ? ` (D-1 ficou ${pct(ctx.shopify.metaSpend, b.avgMetaSpend)})` : ""}; ${b.avgMetaRoas != null ? `ROAS médio ${b.avgMetaRoas.toFixed(2)}` : "sem baseline de ROAS"}${ctx.shopify.metaRoas != null && b.avgMetaRoas != null ? ` (D-1 ficou ${pct(ctx.shopify.metaRoas, b.avgMetaRoas)})` : ""}.
- Instagram: ${b.igMonthAvgReach != null ? `alcance médio ${b.igMonthAvgReach.toFixed(0)}/dia` : "sem baseline"}${ctx.instagram && b.igMonthAvgReach != null ? ` (D-1 ficou ${pct(ctx.instagram.reachTotal, b.igMonthAvgReach)})` : ""}.
- WhatsApp: ${b.whatsappCampanhasNoMes} campanha(s) enviada(s) no mês até antes de ontem.

Com base nisso, escreva:
1. "resumo_texto" (2-3 frases): o resultado do dia em relação à média do mês, sem ainda explicar a causa.
2. "causa_provavel" (2-4 frases, o MAIS IMPORTANTE): explique com que canal(is)/fator(es) REALMENTE bate com a direção do faturamento (origem dos pedidos — separando venda manual de tráfego real do site —, cliente novo vs recorrente, taxa de conversão, ticket médio, ou um canal pago que de fato subiu junto). Se NENHUM canal rastreado explica — ex: pedidos subiram mas todo canal pago caiu — diga isso claramente, sem inventar uma causa externa que os dados não sustentam.
3. "pontos_positivos" (0-4 itens curtos, só fatores que realmente empurraram o resultado na mesma direção).
4. "pontos_negativos" (0-4 itens curtos, fatores que empurraram contra o resultado ou representam risco/ineficiência mesmo num dia bom).
5. "recomendacoes" (2-4 itens, ação concreta): se o faturamento SUBIU, o que fazer pra sustentar/ampliar ainda mais esse resultado (ex: dobrar investimento no canal de origem que mais vendeu, replicar a venda manual como processo); se CAIU, o que poderia ter evitado a queda.
6. "destaques" (0-3 itens, só se houver algo realmente fora do padrão): eventos candidatos a registrar formalmente no CRM.

Não invente pontos triviais só pra preencher — se não houver nada relevante numa lista, retorne vazio. Responda em português do Brasil.

Responda em JSON estrito:
{ "resumo_texto": string, "causa_provavel": string, "pontos_positivos": [string], "pontos_negativos": [string], "recomendacoes": [string], "destaques": [ { "title": string, "category": "preco"|"campanha"|"criativo"|"estoque"|"feriado"|"concorrencia"|"conteudo"|"outro", "canais": ["shopify"|"meta_ads"|"instagram"|"whatsapp"], "description": string } ] }`;
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
export async function runDailyEventsAnalysis(
  targetDateOverride?: string,
  force = false,
): Promise<{ created: number; skipped: boolean; date: string }> {
  const supabaseAdmin = await admin();
  const dateISO = targetDateOverride ?? yesterdayInSaoPaulo();

  const { data: existingAuto } = await (supabaseAdmin.from("crm_events" as any) as any)
    .select("id")
    .eq("event_date", dateISO)
    .eq("source", "auto");

  if (existingAuto && existingAuto.length > 0) {
    if (!force) return { created: 0, skipped: true, date: dateISO };
    await (supabaseAdmin.from("crm_events" as any) as any)
      .delete()
      .in("id", existingAuto.map((r: any) => r.id));
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
  const baseline = await getMonthBaseline(dateISO);
  const sources = await getOrderSourceBreakdown(dateISO);
  const novosVsRecorrentes = await getNewVsReturningForDate(dateISO);

  const prompt = buildDailyPrompt(dateISO, { shopify: shopifyDay, sessions, instagram, whatsapp, baseline, sources, novosVsRecorrentes });

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

  const conversaoDia = sessions && sessions.sessions > 0 ? (shopifyDay.pedidos / sessions.sessions) * 100 : null;
  const conversaoBaseline = baseline.avgSessions && baseline.avgSessions > 0 ? (baseline.avgPedidos / baseline.avgSessions) * 100 : null;
  const ticketDia = shopifyDay.pedidos > 0 ? shopifyDay.faturamento / shopifyDay.pedidos : 0;
  const ticketBaseline = baseline.avgPedidos > 0 ? baseline.avgFaturamento / baseline.avgPedidos : 0;

  const descricaoPartes = [analysis.resumo_texto];

  descricaoPartes.push(
    sessions
      ? `Sessões do site: ${sessions.sessions} (${pct(sessions.sessions, baseline.avgSessions ?? 0)}), taxa de conversão ${conversaoDia?.toFixed(2) ?? "0"}%${conversaoBaseline ? ` (${pct(conversaoDia ?? 0, conversaoBaseline)})` : ""}.`
      : "Sessões do site: indisponíveis nesse dia.",
  );

  if (sources.length) {
    descricaoPartes.push(`Origem dos pedidos: ${sources.map((s) => `${s.pedidos} via ${s.label} (R$${s.receita.toFixed(2)})`).join("; ")}.`);
  }

  descricaoPartes.push(`Causa provável: ${analysis.causa_provavel}`);
  if (analysis.pontos_positivos.length) {
    descricaoPartes.push(`O que ajudou: ${analysis.pontos_positivos.join("; ")}.`);
  }
  if (analysis.pontos_negativos.length) {
    descricaoPartes.push(`O que atrapalhou: ${analysis.pontos_negativos.join("; ")}.`);
  }

  const contrafactuais: string[] = [];

  if (baseline.avgPedidos > 0 && shopifyDay.pedidos < baseline.avgPedidos && ticketDia > 0) {
    const hipotetico = baseline.avgPedidos * ticketDia;
    contrafactuais.push(
      `Se os pedidos tivessem ficado na média do mês (${baseline.avgPedidos.toFixed(1)}/dia) mantendo o mesmo ticket médio, o faturamento teria sido de R$${hipotetico.toFixed(2)} (R$${(hipotetico - shopifyDay.faturamento).toFixed(2)} a mais).`,
    );
  }

  if (ticketBaseline > 0 && ticketDia > 0 && ticketDia < ticketBaseline) {
    const hipotetico = shopifyDay.pedidos * ticketBaseline;
    contrafactuais.push(
      `Se o ticket médio tivesse ficado na média do mês (R$${ticketBaseline.toFixed(2)}) mantendo o mesmo número de pedidos, o faturamento teria sido de R$${hipotetico.toFixed(2)} (R$${(hipotetico - shopifyDay.faturamento).toFixed(2)} a mais).`,
    );
  }

  if (conversaoBaseline && conversaoDia != null && conversaoDia < conversaoBaseline && sessions && ticketDia > 0) {
    const pedidosHipoteticos = sessions.sessions * (conversaoBaseline / 100);
    const faturamentoHipotetico = pedidosHipoteticos * ticketDia;
    contrafactuais.push(
      `Se a taxa de conversão tivesse ficado na média do mês (${conversaoBaseline.toFixed(2)}%) mantendo as mesmas sessões, o faturamento teria sido de aproximadamente R$${faturamentoHipotetico.toFixed(2)} (R$${(faturamentoHipotetico - shopifyDay.faturamento).toFixed(2)} a mais), com cerca de ${Math.round(pedidosHipoteticos)} pedidos.`,
    );
  }

  if (baseline.avgMetaRoas != null && shopifyDay.metaRoas != null && shopifyDay.metaRoas < baseline.avgMetaRoas && shopifyDay.metaSpend != null) {
    const receitaAtual = shopifyDay.metaSpend * shopifyDay.metaRoas;
    const receitaHipotetica = shopifyDay.metaSpend * baseline.avgMetaRoas;
    contrafactuais.push(
      `Se o ROAS do Meta Ads tivesse ficado na média do mês (${baseline.avgMetaRoas.toFixed(2)}) mantendo o mesmo gasto, a receita atribuída ao Meta Ads teria sido de R$${receitaHipotetica.toFixed(2)} em vez de R$${receitaAtual.toFixed(2)} (R$${(receitaHipotetica - receitaAtual).toFixed(2)} a mais).`,
    );
  }

  if (contrafactuais.length) {
    descricaoPartes.push(`E se tivesse ficado na média: ${contrafactuais.join(" ")}`);
  }

  if (analysis.recomendacoes.length) {
    descricaoPartes.push(`Recomendações: ${analysis.recomendacoes.join("; ")}.`);
  }

  await createEvent(
    {
      eventDate: dateISO,
      title: `Resumo do dia ${format(new Date(`${dateISO}T12:00:00Z`), "dd/MM")}`,
      description: descricaoPartes.join(" "),
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
