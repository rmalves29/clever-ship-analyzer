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
