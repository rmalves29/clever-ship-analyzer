const GRAPH_VERSION = "v21.0";

export type MetaAdsDatePreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "this_month"
  | "last_month";

export type MetaAdsLevel = "campaign" | "adset" | "ad";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadMetaAdsSettings(): Promise<{ accessToken: string | null; accountId: string | null }> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("meta_ads_access_token, meta_ads_account_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    accessToken: (data as any)?.meta_ads_access_token ?? null,
    accountId: (data as any)?.meta_ads_account_id ?? null,
  };
}

/** GET genérico contra a Graph API de Marketing — lança em caso de erro, com a mensagem real da Meta. */
async function graphGET(path: string, params: Record<string, string>, accessToken: string): Promise<any> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    console.error("[meta-ads] Graph API error:", json?.error ?? res.status);
    throw new Error(json?.error?.message ?? `Meta respondeu ${res.status}`);
  }
  return json;
}

export type MetaAdsConnectionStatus = {
  connected: boolean;
  accountId: string | null;
  accountName?: string | undefined;
  currency?: string | undefined;
  error?: string | undefined;
};

/** Status da conexão — também serve pra validar se o token ainda é válido (chamada leve, 1 campo). */
export async function getMetaAdsConnectionStatus(): Promise<MetaAdsConnectionStatus> {
  const { accessToken, accountId } = await loadMetaAdsSettings();
  if (!accessToken || !accountId) return { connected: false, accountId: null };

  try {
    const data = await graphGET(`/${accountId}`, { fields: "name,currency" }, accessToken);
    return { connected: true, accountId, accountName: data.name, currency: data.currency };
  } catch (error) {
    return { connected: false, accountId, error: error instanceof Error ? error.message : "Falha ao conectar." };
  }
}

export type MetaAdsRow = {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  ctr: number;
  cpm: number;
  purchases: number;
  revenue: number;
  cps: number;
  cvr: number;
  ticket: number;
  cpa: number;
  roas: number;
};

export type MetaAdsSummary = {
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  cvr: number;
  ticket: number;
  cpa: number;
  linkClicks: number;
  impressions: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `actions`/`action_values` vêm como array [{action_type, value}]. A Meta costuma listar VÁRIOS
 *  action_types pro mesmo evento de compra ao mesmo tempo (ex: "purchase" E "omni_purchase" juntos
 *  — "omni_purchase" já é a métrica unificada, que INCLUI o que está em "purchase"). Somar os dois
 *  duplica a contagem e a receita. Por isso aqui é "pega o primeiro tipo que existir" (por prioridade),
 *  nunca soma vários tipos. */
function pickAction(actions: { action_type: string; value: string }[] | undefined, typesByPriority: string[]): number {
  if (!actions) return 0;
  for (const type of typesByPriority) {
    const match = actions.find((a) => a.action_type === type);
    if (match) return num(match.value);
  }
  return 0;
}

const PURCHASE_TYPES = ["omni_purchase", "purchase"];
const LINK_CLICK_TYPES = ["link_click"];

function rowFromInsight(raw: any, idField: string, nameField: string): MetaAdsRow {
  const spend = num(raw.spend);
  const impressions = num(raw.impressions);
  const linkClicks = pickAction(raw.actions, LINK_CLICK_TYPES) || num(raw.inline_link_clicks);
  const purchases = pickAction(raw.actions, PURCHASE_TYPES);
  const revenue = pickAction(raw.action_values, PURCHASE_TYPES);

  return {
    id: raw[idField],
    name: raw[nameField] ?? "(sem nome)",
    status: raw.effective_status ?? raw.status ?? "UNKNOWN",
    spend,
    impressions,
    linkClicks,
    ctr: num(raw.ctr),
    cpm: num(raw.cpm),
    purchases,
    revenue,
    cps: linkClicks > 0 ? spend / linkClicks : 0,
    cvr: linkClicks > 0 ? purchases / linkClicks : 0,
    ticket: purchases > 0 ? revenue / purchases : 0,
    cpa: purchases > 0 ? spend / purchases : 0,
    roas: spend > 0 ? revenue / spend : 0,
  };
}

const LEVEL_FIELDS: Record<MetaAdsLevel, { idField: string; nameField: string; statusEndpoint: string }> = {
  campaign: { idField: "campaign_id", nameField: "campaign_name", statusEndpoint: "campaigns" },
  adset: { idField: "adset_id", nameField: "adset_name", statusEndpoint: "adsets" },
  ad: { idField: "ad_id", nameField: "ad_name", statusEndpoint: "ads" },
};

/** Lista campanhas/conjuntos/anúncios com métricas reais no período — junta insights (números)
 *  com o endpoint de status (ativo/pausado), porque `insights` sozinho não devolve status. */
export async function getMetaAdsRows(level: MetaAdsLevel, datePreset: MetaAdsDatePreset): Promise<{ success: true; rows: MetaAdsRow[] } | { success: false; error: string }> {
  const { accessToken, accountId } = await loadMetaAdsSettings();
  if (!accessToken || !accountId) {
    return { success: false, error: "Meta Ads não conectado. Configure em Configurações." };
  }

  const { idField, nameField, statusEndpoint } = LEVEL_FIELDS[level];

  try {
    const [insightsRes, statusRes] = await Promise.all([
      graphGET(
        `/${accountId}/insights`,
        {
          level,
          date_preset: datePreset,
          fields: `${idField},${nameField},spend,impressions,inline_link_clicks,ctr,cpm,actions,action_values`,
          limit: "500",
        },
        accessToken,
      ),
      graphGET(`/${accountId}/${statusEndpoint}`, { fields: "id,effective_status", limit: "500" }, accessToken),
    ]);

    const statusById = new Map<string, string>((statusRes.data ?? []).map((s: any) => [s.id, s.effective_status]));
    const rows = ((insightsRes.data ?? []) as any[]).map((raw) => {
      const row = rowFromInsight(raw, idField, nameField);
      return { ...row, status: statusById.get(row.id) ?? row.status };
    });
    rows.sort((a, b) => b.spend - a.spend);

    return { success: true, rows };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar a Meta." };
  }
}

/** Resumo da conta inteira no período — cards do topo do dashboard. */
export async function getMetaAdsSummary(datePreset: MetaAdsDatePreset): Promise<{ success: true; summary: MetaAdsSummary } | { success: false; error: string }> {
  const { accessToken, accountId } = await loadMetaAdsSettings();
  if (!accessToken || !accountId) {
    return { success: false, error: "Meta Ads não conectado. Configure em Configurações." };
  }

  try {
    const insightsRes = await graphGET(
      `/${accountId}/insights`,
      { level: "account", date_preset: datePreset, fields: "spend,impressions,inline_link_clicks,actions,action_values" },
      accessToken,
    );
    const raw = insightsRes.data?.[0];
    if (!raw) {
      return { success: true, summary: { spend: 0, revenue: 0, roas: 0, purchases: 0, cvr: 0, ticket: 0, cpa: 0, linkClicks: 0, impressions: 0 } };
    }

    const spend = num(raw.spend);
    const impressions = num(raw.impressions);
    const linkClicks = pickAction(raw.actions, LINK_CLICK_TYPES) || num(raw.inline_link_clicks);
    const purchases = pickAction(raw.actions, PURCHASE_TYPES);
    const revenue = pickAction(raw.action_values, PURCHASE_TYPES);

    return {
      success: true,
      summary: {
        spend,
        revenue,
        roas: spend > 0 ? revenue / spend : 0,
        purchases,
        cvr: linkClicks > 0 ? purchases / linkClicks : 0,
        ticket: purchases > 0 ? revenue / purchases : 0,
        cpa: purchases > 0 ? spend / purchases : 0,
        linkClicks,
        impressions,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar a Meta." };
  }
}

export type DaypartAction = "escalar" | "reduzir" | "cortar" | "zero_venda";

export type DaypartHour = {
  hour: number;
  spend: number;
  purchases: number;
  revenue: number;
  cpa: number;
  roas: number;
  pctSpend: number;
  action: DaypartAction;
};

export type DaypartBlock = {
  label: string;
  spend: number;
  purchases: number;
  revenue: number;
  cpa: number;
  roas: number;
  pctSpend: number;
};

export type DaypartingResult = {
  hours: DaypartHour[];
  blocks: DaypartBlock[];
  totalSpend: number;
  accountRoas: number;
  bestHour: { hour: number; roas: number } | null;
  wasteSpend: number;
  worstHour: { hour: number; spend: number } | null;
};

const DAYPART_BLOCKS: { label: string; hours: number[] }[] = [
  { label: "Madrugada 0-5h", hours: [0, 1, 2, 3, 4, 5] },
  { label: "Manhã 6-11h", hours: [6, 7, 8, 9, 10, 11] },
  { label: "Tarde 12-17h", hours: [12, 13, 14, 15, 16, 17] },
  { label: "Noite 18-23h", hours: [18, 19, 20, 21, 22, 23] },
];

/** Classifica a hora comparando o ROAS dela com o ROAS da conta no período — mesma lógica de
 *  "ação sugerida" observada no Dayparting da Axoly (usada como referência). Sem venda na hora =
 *  alerta máximo; acima do ROAS da conta = escalar; bem abaixo = cortar; moderadamente abaixo = reduzir. */
function classifyHour(purchases: number, roas: number, accountRoas: number): DaypartAction {
  if (purchases === 0) return "zero_venda";
  if (accountRoas <= 0) return roas > 0 ? "escalar" : "zero_venda";
  const ratio = roas / accountRoas;
  if (ratio >= 1) return "escalar";
  if (ratio >= 0.7) return "reduzir";
  return "cortar";
}

/** Eficiência por horário do dia — usa o breakdown nativo da Meta (fuso do anunciante, já não
 *  precisa converter timezone na mão) pra achar horário de pico, horas sem venda e sugerir ação. */
export async function getMetaAdsDayparting(datePreset: MetaAdsDatePreset): Promise<{ success: true; result: DaypartingResult } | { success: false; error: string }> {
  const { accessToken, accountId } = await loadMetaAdsSettings();
  if (!accessToken || !accountId) {
    return { success: false, error: "Meta Ads não conectado. Configure em Configurações." };
  }

  try {
    const insightsRes = await graphGET(
      `/${accountId}/insights`,
      {
        level: "account",
        date_preset: datePreset,
        breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
        fields: "spend,actions,action_values",
        limit: "50",
      },
      accessToken,
    );

    const byHour = new Map<number, { spend: number; purchases: number; revenue: number }>();
    for (let h = 0; h < 24; h++) byHour.set(h, { spend: 0, purchases: 0, revenue: 0 });

    for (const raw of (insightsRes.data ?? []) as any[]) {
      const bucket = raw.hourly_stats_aggregated_by_advertiser_time_zone as string | undefined;
      const hour = bucket ? Number(bucket.slice(0, 2)) : NaN;
      if (!Number.isFinite(hour)) continue;
      const agg = byHour.get(hour)!;
      agg.spend += num(raw.spend);
      agg.purchases += pickAction(raw.actions, PURCHASE_TYPES);
      agg.revenue += pickAction(raw.action_values, PURCHASE_TYPES);
    }

    const totalSpend = Array.from(byHour.values()).reduce((acc, v) => acc + v.spend, 0);
    const totalRevenue = Array.from(byHour.values()).reduce((acc, v) => acc + v.revenue, 0);
    const accountRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    const hours: DaypartHour[] = Array.from(byHour.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, v]) => {
        const roas = v.spend > 0 ? v.revenue / v.spend : 0;
        return {
          hour,
          spend: v.spend,
          purchases: v.purchases,
          revenue: v.revenue,
          cpa: v.purchases > 0 ? v.spend / v.purchases : 0,
          roas,
          pctSpend: totalSpend > 0 ? v.spend / totalSpend : 0,
          action: classifyHour(v.purchases, roas, accountRoas),
        };
      });

    const blocks: DaypartBlock[] = DAYPART_BLOCKS.map((b) => {
      const rows = hours.filter((h) => b.hours.includes(h.hour));
      const spend = rows.reduce((acc, r) => acc + r.spend, 0);
      const purchases = rows.reduce((acc, r) => acc + r.purchases, 0);
      const revenue = rows.reduce((acc, r) => acc + r.revenue, 0);
      return {
        label: b.label,
        spend,
        purchases,
        revenue,
        cpa: purchases > 0 ? spend / purchases : 0,
        roas: spend > 0 ? revenue / spend : 0,
        pctSpend: totalSpend > 0 ? spend / totalSpend : 0,
      };
    });

    const hoursWithSales = hours.filter((h) => h.purchases > 0);
    const bestHour = hoursWithSales.length
      ? hoursWithSales.reduce((best, h) => (h.roas > best.roas ? h : best))
      : null;

    const zeroSaleHours = hours.filter((h) => h.purchases === 0 && h.spend > 0);
    const wasteSpend = zeroSaleHours.reduce((acc, h) => acc + h.spend, 0);
    const worstHour = zeroSaleHours.length
      ? zeroSaleHours.reduce((worst, h) => (h.spend > worst.spend ? h : worst))
      : null;

    return {
      success: true,
      result: {
        hours,
        blocks,
        totalSpend,
        accountRoas,
        bestHour: bestHour ? { hour: bestHour.hour, roas: bestHour.roas } : null,
        wasteSpend,
        worstHour: worstHour ? { hour: worstHour.hour, spend: worstHour.spend } : null,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar a Meta." };
  }
}

export type MetaAdsRule = { id: string; metric: "cpa" | "roas"; operator: "gt" | "lt"; value: number; ativa: boolean };

export async function listMetaAdsRules(): Promise<MetaAdsRule[]> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin.from("meta_ads_rules").select("id, metric, operator, value, ativa").order("created_at", { ascending: false });
  return ((data ?? []) as any[]).map((r) => ({ ...r, value: Number(r.value) }));
}

export async function createMetaAdsRule(input: { metric: "cpa" | "roas"; operator: "gt" | "lt"; value: number }): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin.from("meta_ads_rules").insert(input as never);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function toggleMetaAdsRule(id: string, ativa: boolean): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin.from("meta_ads_rules").update({ ativa } as never).eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteMetaAdsRule(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin.from("meta_ads_rules").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export type AdPulseRow = MetaAdsRow & { pctAccount: number; thumbstop: number; brokenRules: MetaAdsRule[] };

export type AdPulseResult = {
  rows: AdPulseRow[];
  totalSpend: number;
  noReturnSpend: number;
  noReturnCount: number;
  upsideEstimate: number;
};

/** "Ad Pulse": visão a nível de anúncio com % da verba da conta, thumb-stop rate (views de 3s ÷
 *  impressões) e destaque de quais anúncios quebram alguma regra ativa de CPA/ROAS — tudo
 *  informativo, nenhuma ação automática é tomada (o usuário decide, igual ao aviso da Axoly). */
export async function getMetaAdsPulse(datePreset: MetaAdsDatePreset): Promise<{ success: true; result: AdPulseResult } | { success: false; error: string }> {
  const { accessToken, accountId } = await loadMetaAdsSettings();
  if (!accessToken || !accountId) {
    return { success: false, error: "Meta Ads não conectado. Configure em Configurações." };
  }

  try {
    const [insightsRes, statusRes, rules] = await Promise.all([
      graphGET(
        `/${accountId}/insights`,
        {
          level: "ad",
          date_preset: datePreset,
          fields: "ad_id,ad_name,spend,impressions,inline_link_clicks,ctr,cpm,actions,action_values",
          limit: "500",
        },
        accessToken,
      ),
      graphGET(`/${accountId}/ads`, { fields: "id,effective_status", limit: "500" }, accessToken),
      listMetaAdsRules(),
    ]);

    const statusById = new Map<string, string>((statusRes.data ?? []).map((s: any) => [s.id, s.effective_status]));
    const activeRules = rules.filter((r) => r.ativa);

    const base = ((insightsRes.data ?? []) as any[]).map((raw) => {
      const row = rowFromInsight(raw, "ad_id", "ad_name");
      // "video_view" dentro de `actions` = visualização de verdade (~3s contínuos). O campo separado
      // `video_play_actions` conta qualquer play, incluindo o autoplay mudo do Feed — por isso ficava
      // perto de 100% dos casos (quase toda impressão vira "play" automaticamente, não é engajamento real).
      const thumbstop = row.impressions > 0 ? pickAction(raw.actions, ["video_view"]) / row.impressions : 0;
      return { ...row, status: statusById.get(row.id) ?? row.status, thumbstop };
    });

    const totalSpend = base.reduce((acc, r) => acc + r.spend, 0);

    const rows: AdPulseRow[] = base.map((row) => {
      const brokenRules = activeRules.filter((rule) => {
        const value = rule.metric === "cpa" ? row.cpa : row.roas;
        return rule.operator === "gt" ? value > rule.value : value < rule.value;
      });
      return { ...row, pctAccount: totalSpend > 0 ? row.spend / totalSpend : 0, brokenRules };
    });
    rows.sort((a, b) => b.spend - a.spend);

    const noReturn = rows.filter((r) => r.purchases === 0 && r.spend > 0);
    const noReturnSpend = noReturn.reduce((acc, r) => acc + r.spend, 0);

    const accountRoas = totalSpend > 0 ? rows.reduce((acc, r) => acc + r.revenue, 0) / totalSpend : 0;
    // Estimativa: quanto a mais de receita cada anúncio acima da média da conta já está gerando por
    // real investido — serve como indicativo de "quanto vale a pena escalar", não uma previsão exata.
    const upsideEstimate = rows
      .filter((r) => r.roas > accountRoas && r.spend > 0)
      .reduce((acc, r) => acc + r.spend * (r.roas / accountRoas - 1), 0);

    return {
      success: true,
      result: { rows, totalSpend, noReturnSpend, noReturnCount: noReturn.length, upsideEstimate },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar a Meta." };
  }
}

export type CreativeFreshness = "fresco" | "maduro" | "fadigado";
export type CreativeSuggestion = "escalar" | "testar_mais";

export type CreativeInsight = {
  id: string;
  name: string;
  status: string;
  thumbnailUrl: string | null;
  ageDays: number | null;
  freshness: CreativeFreshness | null;
  frequency: number;
  spend: number;
  impressions: number;
  cpm: number;
  thumbstop: number;
  ctrAll: number;
  ctrLink: number;
  cps: number;
  cvr: number;
  ticket: number;
  cpa: number;
  purchases: number;
  revenue: number;
  roas: number;
  suggestion: CreativeSuggestion;
};

export type CreativesSummary = {
  cpm: number;
  thumbstop: number;
  ctrAll: number;
  ctrLink: number;
  purchases: number;
  cpa: number;
  roas: number;
  spend: number;
};

export type CreativesResult = {
  summary: CreativesSummary;
  topGancho: CreativeInsight | null;
  topCtr: CreativeInsight | null;
  topCompras: CreativeInsight | null;
  topRoas: CreativeInsight | null;
  creatives: CreativeInsight[];
};

/** <7 dias = fresco, 7-60 = maduro, >60 = fadigado — limiar nosso, não vem de nenhum campo da
 *  Meta (ela não expõe "idade do criativo" pronta, só created_time do anúncio). */
function classifyFreshness(ageDays: number | null): CreativeFreshness | null {
  if (ageDays === null) return null;
  if (ageDays < 7) return "fresco";
  if (ageDays <= 60) return "maduro";
  return "fadigado";
}

/** Insights por criativo: métricas de vídeo/thumb-stop, idade e um preview real (imagem ou frame
 *  do vídeo) — a Meta devolve o mesmo campo `thumbnail_url` pros dois tipos de criativo. */
export async function getMetaAdsCreatives(datePreset: MetaAdsDatePreset): Promise<{ success: true; result: CreativesResult } | { success: false; error: string }> {
  const { accessToken, accountId } = await loadMetaAdsSettings();
  if (!accessToken || !accountId) {
    return { success: false, error: "Meta Ads não conectado. Configure em Configurações." };
  }

  try {
    const [insightsRes, adsRes] = await Promise.all([
      graphGET(
        `/${accountId}/insights`,
        {
          level: "ad",
          date_preset: datePreset,
          fields: "ad_id,ad_name,spend,impressions,inline_link_clicks,ctr,cpm,frequency,actions,action_values",
          limit: "500",
        },
        accessToken,
      ),
      graphGET(
        `/${accountId}/ads`,
        { fields: "id,effective_status,created_time,creative{thumbnail_url}", limit: "500" },
        accessToken,
      ),
    ]);

    const adsById = new Map<string, { status: string; createdTime: string | null; thumbnailUrl: string | null }>(
      ((adsRes.data ?? []) as any[]).map((a) => [
        a.id,
        { status: a.effective_status, createdTime: a.created_time ?? null, thumbnailUrl: a.creative?.thumbnail_url ?? null },
      ]),
    );

    const now = Date.now();
    const creatives: CreativeInsight[] = ((insightsRes.data ?? []) as any[])
      .filter((raw) => num(raw.spend) > 0)
      .map((raw) => {
        const base = rowFromInsight(raw, "ad_id", "ad_name");
        const meta = adsById.get(base.id);
        const ctrLink = base.impressions > 0 ? base.linkClicks / base.impressions : 0;
        const thumbstop = base.impressions > 0 ? pickAction(raw.actions, ["video_view"]) / base.impressions : 0;
        const ageDays = meta?.createdTime ? Math.floor((now - new Date(meta.createdTime).getTime()) / 86_400_000) : null;

        return {
          id: base.id,
          name: base.name,
          status: meta?.status ?? base.status,
          thumbnailUrl: meta?.thumbnailUrl ?? null,
          ageDays,
          freshness: classifyFreshness(ageDays),
          frequency: num(raw.frequency),
          spend: base.spend,
          impressions: base.impressions,
          cpm: base.cpm,
          thumbstop,
          ctrAll: base.ctr / 100,
          ctrLink,
          cps: base.cps,
          cvr: base.cvr,
          ticket: base.ticket,
          cpa: base.cpa,
          purchases: base.purchases,
          revenue: base.revenue,
          roas: base.roas,
          suggestion: "testar_mais" as CreativeSuggestion,
        };
      });

    const totalSpend = creatives.reduce((acc, c) => acc + c.spend, 0);
    const totalRevenue = creatives.reduce((acc, c) => acc + c.revenue, 0);
    const accountRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const totalPurchases = creatives.reduce((acc, c) => acc + c.purchases, 0);
    const totalImpressions = creatives.reduce((acc, c) => acc + c.impressions, 0);
    const totalLinkClicks = creatives.reduce((acc, c) => acc + c.impressions * c.ctrLink, 0);

    for (const c of creatives) {
      c.suggestion = c.purchases > 0 && c.roas >= accountRoas ? "escalar" : "testar_mais";
    }
    creatives.sort((a, b) => b.spend - a.spend);

    const withPurchases = creatives.filter((c) => c.purchases > 0);
    const topGancho = creatives.length ? creatives.reduce((best, c) => (c.thumbstop > best.thumbstop ? c : best)) : null;
    const topCtr = creatives.length ? creatives.reduce((best, c) => (c.ctrAll > best.ctrAll ? c : best)) : null;
    const topCompras = withPurchases.length ? withPurchases.reduce((best, c) => (c.purchases > best.purchases ? c : best)) : null;
    const topRoas = withPurchases.length ? withPurchases.reduce((best, c) => (c.roas > best.roas ? c : best)) : null;

    return {
      success: true,
      result: {
        summary: {
          cpm: average(creatives.map((c) => c.cpm)),
          thumbstop: average(creatives.map((c) => c.thumbstop)),
          ctrAll: average(creatives.map((c) => c.ctrAll)),
          ctrLink: totalImpressions > 0 ? totalLinkClicks / totalImpressions : 0,
          purchases: totalPurchases,
          cpa: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
          roas: accountRoas,
          spend: totalSpend,
        },
        topGancho,
        topCtr,
        topCompras,
        topRoas,
        creatives,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar a Meta." };
  }
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export type MetaAdsPlan = {
  investimentoMensal: number;
  metaReceita: number | null;
  ticketMedio: number;
  taxaConversao: number;
  cps: number;
  updatedAt: string;
};

export type PlanBaseline = { cps: number; cvr: number; ticket: number; cpa: number; roas: number };

/** Baseline real da conta (últimos 30 dias) — usado tanto pra pré-preencher o planejamento quanto
 *  pra validar se as metas batem com o que a conta de fato entrega hoje. */
export async function getMetaAdsPlanningBaseline(): Promise<{ success: true; baseline: PlanBaseline } | { success: false; error: string }> {
  const res = await getMetaAdsSummary("last_30d");
  if (!res.success) return res;
  const { spend, revenue, purchases, linkClicks, cvr, ticket, cpa, roas } = res.summary;
  const cps = linkClicks > 0 ? spend / linkClicks : 0;
  return { success: true, baseline: { cps, cvr, ticket, cpa, roas } };
}

export type PlanRange = { min: number; max: number };
export type PlanRanges = { cps: PlanRange; cvr: PlanRange; ticket: PlanRange; cpa: PlanRange; roas: PlanRange };

/** Faixa de referência por métrica — não é benchmark de mercado (não temos isso), é o range real
 *  dia-a-dia da própria conta nos últimos 30 dias (do dia mais fraco ao mais forte, ignorando dias
 *  sem nenhuma venda pra CPA/ROAS não virarem infinito/zero artificial). */
export async function getMetaAdsPlanningRanges(): Promise<{ success: true; ranges: PlanRanges } | { success: false; error: string }> {
  const { accessToken, accountId } = await loadMetaAdsSettings();
  if (!accessToken || !accountId) {
    return { success: false, error: "Meta Ads não conectado. Configure em Configurações." };
  }

  try {
    const res = await graphGET(
      `/${accountId}/insights`,
      {
        level: "account",
        date_preset: "last_30d",
        time_increment: "1",
        fields: "spend,inline_link_clicks,actions,action_values",
        limit: "31",
      },
      accessToken,
    );

    const days = ((res.data ?? []) as any[]).map((raw) => {
      const spend = num(raw.spend);
      const linkClicks = pickAction(raw.actions, LINK_CLICK_TYPES) || num(raw.inline_link_clicks);
      const purchases = pickAction(raw.actions, PURCHASE_TYPES);
      const revenue = pickAction(raw.action_values, PURCHASE_TYPES);
      return {
        cps: linkClicks > 0 ? spend / linkClicks : null,
        cvr: linkClicks > 0 ? purchases / linkClicks : null,
        ticket: purchases > 0 ? revenue / purchases : null,
        cpa: purchases > 0 ? spend / purchases : null,
        roas: spend > 0 ? revenue / spend : null,
      };
    });

    const rangeOf = (key: keyof (typeof days)[number]): PlanRange => {
      const values = days.map((d) => d[key]).filter((v): v is number => v !== null && v > 0);
      if (values.length === 0) return { min: 0, max: 0 };
      return { min: Math.min(...values), max: Math.max(...values) };
    };

    return {
      success: true,
      ranges: { cps: rangeOf("cps"), cvr: rangeOf("cvr"), ticket: rangeOf("ticket"), cpa: rangeOf("cpa"), roas: rangeOf("roas") },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar a Meta." };
  }
}

export async function getMetaAdsPlan(): Promise<MetaAdsPlan | null> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("meta_ads_planning")
    .select("investimento_mensal, meta_receita, ticket_medio, taxa_conversao, cps, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as any;
  return {
    investimentoMensal: Number(row.investimento_mensal),
    metaReceita: row.meta_receita != null ? Number(row.meta_receita) : null,
    ticketMedio: Number(row.ticket_medio),
    taxaConversao: Number(row.taxa_conversao),
    cps: Number(row.cps),
    updatedAt: row.updated_at,
  };
}

export async function saveMetaAdsPlan(input: {
  investimentoMensal: number;
  metaReceita: number | null;
  ticketMedio: number;
  taxaConversao: number;
  cps: number;
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { data: existing } = await supabaseAdmin.from("meta_ads_planning").select("id").limit(1).maybeSingle();

  const row = {
    investimento_mensal: input.investimentoMensal,
    meta_receita: input.metaReceita,
    ticket_medio: input.ticketMedio,
    taxa_conversao: input.taxaConversao,
    cps: input.cps,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabaseAdmin.from("meta_ads_planning").update(row as never).eq("id", (existing as any).id)
    : await supabaseAdmin.from("meta_ads_planning").insert(row as never);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Ativa/pausa uma campanha, conjunto ou anúncio direto na Meta. */
export async function setMetaAdsStatus(id: string, status: "ACTIVE" | "PAUSED"): Promise<{ success: true } | { success: false; error: string }> {
  const { accessToken } = await loadMetaAdsSettings();
  if (!accessToken) return { success: false, error: "Meta Ads não conectado." };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status, access_token: accessToken }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) return { success: false, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  return { success: true };
}
