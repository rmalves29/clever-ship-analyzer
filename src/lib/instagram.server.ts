const GRAPH_VERSION = "v21.0";

export type InstagramDatePreset = "today" | "yesterday" | "last_7d" | "last_14d" | "last_30d" | "this_month" | "last_month";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadInstagramSettings(): Promise<{ accessToken: string | null; pageToken: string | null; igId: string | null; username: string | null }> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("meta_ads_access_token, instagram_page_access_token, instagram_business_account_id, instagram_username")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as any;
  return {
    accessToken: row?.meta_ads_access_token ?? null,
    pageToken: row?.instagram_page_access_token ?? null,
    igId: row?.instagram_business_account_id ?? null,
    username: row?.instagram_username ?? null,
  };
}

async function graphGET(path: string, params: Record<string, string>, accessToken: string): Promise<any> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    console.error("[instagram] Graph API error:", json?.error ?? res.status);
    throw new Error(json?.error?.message ?? `Meta respondeu ${res.status}`);
  }
  return json;
}

function datePresetToRange(preset: InstagramDatePreset): { since: string; until: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };

  switch (preset) {
    // `until` é exclusivo pra métricas diárias do Instagram (confirmado testando: since=13/until=20
    // devolveu os dias 13..19, nunca o 20) — since === until sempre resulta em zero dias, por isso
    // "hoje"/"ontem" precisam do dia seguinte como until, não o próprio dia.
    case "today":
      return { since: toISO(now), until: toISO(daysAgo(-1)) };
    case "yesterday": {
      const y = daysAgo(1);
      return { since: toISO(y), until: toISO(now) };
    }
    // `until` sempre exclusivo (mesma regra do "today"/"yesterday" acima) — pra ranges "até
    // agora" isso significa amanhã, não hoje, senão os posts de hoje ficam de fora.
    case "last_7d":
      return { since: toISO(daysAgo(7)), until: toISO(daysAgo(-1)) };
    case "last_14d":
      return { since: toISO(daysAgo(14)), until: toISO(daysAgo(-1)) };
    case "last_30d":
      return { since: toISO(daysAgo(30)), until: toISO(daysAgo(-1)) };
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: toISO(first), until: toISO(daysAgo(-1)) };
    }
    case "last_month": {
      const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastPrev = new Date(firstThis.getTime() - 86_400_000);
      const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
      return { since: toISO(firstPrev), until: toISO(firstThis) };
    }
  }
}

export type InstagramConnectionStatus = {
  connected: boolean;
  igId: string | null;
  username?: string | undefined;
  followersCount?: number | undefined;
  mediaCount?: number | undefined;
  error?: string | undefined;
};

/** Também serve pra validar se o token/página ainda são válidos (chamada leve). */
export async function getInstagramConnectionStatus(): Promise<InstagramConnectionStatus> {
  const { pageToken, igId } = await loadInstagramSettings();
  if (!pageToken || !igId) return { connected: false, igId: null };

  try {
    const data = await graphGET(`/${igId}`, { fields: "username,followers_count,media_count" }, pageToken);
    return { connected: true, igId, username: data.username, followersCount: data.followers_count, mediaCount: data.media_count };
  } catch (error) {
    return { connected: false, igId, error: error instanceof Error ? error.message : "Falha ao conectar." };
  }
}

/** Acha a conta do Instagram vinculada a alguma Page que o token de sistema (já usado pro Meta Ads)
 *  tem acesso, e guarda o token da própria Page — nos testes, chamar /insights com o token do
 *  usuário de sistema direto (sem passar pela Page) não devolve o campo instagram_business_account. */
export async function connectInstagram(): Promise<{ success: true; username: string } | { success: false; error: string }> {
  const { accessToken } = await loadInstagramSettings();
  if (!accessToken) {
    return { success: false, error: "Configure o token de acesso da Meta (mesmo usado no Meta Ads) em Configurações primeiro." };
  }

  const pagesRes = await graphGET("/me/accounts", { fields: "id,name,access_token", limit: "50" }, accessToken);
  const pages = (pagesRes.data ?? []) as { id: string; name: string; access_token: string }[];

  for (const page of pages) {
    try {
      const pageData = await graphGET(`/${page.id}`, { fields: "instagram_business_account{id,username}" }, page.access_token);
      const igAccount = pageData.instagram_business_account;
      if (igAccount?.id) {
        const supabaseAdmin = await admin();
        const { data: existing } = await supabaseAdmin.from("store_settings").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (!existing) return { success: false, error: "Configure primeiro a conexão com o Shopify em Configurações." };

        await supabaseAdmin
          .from("store_settings")
          .update({
            instagram_business_account_id: igAccount.id,
            instagram_page_access_token: page.access_token,
            instagram_username: igAccount.username,
            instagram_connected_at: new Date().toISOString(),
          } as never)
          .eq("id", (existing as any).id);

        return { success: true, username: igAccount.username };
      }
    } catch {
      // Página sem permissão ou sem Instagram vinculado — tenta a próxima.
      continue;
    }
  }

  return { success: false, error: "Nenhuma Página do Facebook com Instagram profissional vinculado foi encontrada nesse token." };
}

export type InstagramOverview = {
  followersCount: number;
  mediaCount: number;
  reachTotal: number;
  profileViews: number;
  accountsEngaged: number;
  totalInteractions: number;
  websiteClicks: number;
  reachByDay: { date: string; value: number }[];
};

export async function getInstagramOverview(datePreset: InstagramDatePreset): Promise<{ success: true; overview: InstagramOverview } | { success: false; error: string }> {
  const { pageToken, igId } = await loadInstagramSettings();
  if (!pageToken || !igId) return { success: false, error: "Instagram não conectado. Configure em Configurações." };

  const { since, until } = datePresetToRange(datePreset);

  try {
    const [profileRes, reachRes, totalsRes] = await Promise.all([
      graphGET(`/${igId}`, { fields: "followers_count,media_count" }, pageToken),
      graphGET(`/${igId}/insights`, { metric: "reach", period: "day", since, until }, pageToken),
      graphGET(
        `/${igId}/insights`,
        { metric: "profile_views,accounts_engaged,total_interactions,website_clicks", period: "day", metric_type: "total_value", since, until },
        pageToken,
      ),
    ]);

    const reachByDay = ((reachRes.data?.[0]?.values ?? []) as { value: number; end_time: string }[]).map((v) => ({
      date: v.end_time.slice(0, 10),
      value: v.value,
    }));
    const reachTotal = reachByDay.reduce((acc, d) => acc + d.value, 0);

    const totalsByName = new Map<string, number>(
      ((totalsRes.data ?? []) as any[]).map((m) => [m.name, m.total_value?.value ?? 0]),
    );

    return {
      success: true,
      overview: {
        followersCount: profileRes.followers_count ?? 0,
        mediaCount: profileRes.media_count ?? 0,
        reachTotal,
        profileViews: totalsByName.get("profile_views") ?? 0,
        accountsEngaged: totalsByName.get("accounts_engaged") ?? 0,
        totalInteractions: totalsByName.get("total_interactions") ?? 0,
        websiteClicks: totalsByName.get("website_clicks") ?? 0,
        reachByDay,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar o Instagram." };
  }
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: "Brasil", US: "Estados Unidos", PT: "Portugal", DE: "Alemanha", RU: "Rússia", BD: "Bangladesh",
  BE: "Bélgica", AR: "Argentina", MX: "México", ES: "Espanha", FR: "França", IT: "Itália", GB: "Reino Unido",
  CA: "Canadá", AU: "Austrália", JP: "Japão", CN: "China", IN: "Índia", NG: "Nigéria", PK: "Paquistão",
  ID: "Indonésia", PH: "Filipinas", CL: "Chile", CO: "Colômbia", PE: "Peru", UY: "Uruguai", PY: "Paraguai",
};
function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

export type AudienceBucket = { label: string; value: number; pct: number };
export type InstagramAudience = {
  age: AudienceBucket[];
  gender: AudienceBucket[];
  topCountries: AudienceBucket[];
  topStates: AudienceBucket[];
  topCities: AudienceBucket[];
};

async function fetchDemographic(igId: string, pageToken: string, breakdown: string): Promise<{ label: string; value: number }[]> {
  const res = await graphGET(
    `/${igId}/insights`,
    { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown },
    pageToken,
  );
  const results = (res.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []) as { dimension_values: string[]; value: number }[];
  return results.map((r) => ({ label: r.dimension_values[0] ?? "—", value: r.value }));
}

const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

export async function getInstagramAudience(): Promise<{ success: true; audience: InstagramAudience } | { success: false; error: string }> {
  const { pageToken, igId } = await loadInstagramSettings();
  if (!pageToken || !igId) return { success: false, error: "Instagram não conectado. Configure em Configurações." };

  try {
    const [ageRaw, genderRaw, countryRaw, cityRaw] = await Promise.all([
      fetchDemographic(igId, pageToken, "age"),
      fetchDemographic(igId, pageToken, "gender"),
      fetchDemographic(igId, pageToken, "country"),
      fetchDemographic(igId, pageToken, "city"),
    ]);

    const withPct = (rows: { label: string; value: number }[]): AudienceBucket[] => {
      const total = rows.reduce((acc, r) => acc + r.value, 0);
      return rows.map((r) => ({ ...r, pct: total > 0 ? r.value / total : 0 }));
    };

    const age = withPct(ageRaw.sort((a, b) => AGE_ORDER.indexOf(a.label) - AGE_ORDER.indexOf(b.label)));
    const genderLabel: Record<string, string> = { F: "Mulheres", M: "Homens", U: "Não informado" };
    const gender = withPct(genderRaw.map((r) => ({ ...r, label: genderLabel[r.label] ?? r.label })));
    const topCountries = withPct(countryRaw.map((r) => ({ ...r, label: countryName(r.label) })).sort((a, b) => b.value - a.value).slice(0, 10));
    const topCities = withPct(cityRaw.sort((a, b) => b.value - a.value).slice(0, 10));

    // Estados: O Instagram não fornece um breakdown direto de "region" no segmendo follower_demographics via API Graph.
    // Mas as cidades vêm no formato "Cidade, Estado". Vamos agrupar as cidades para estimar os estados.
    const stateMap = new Map<string, number>();
    cityRaw.forEach(c => {
      const parts = c.label.split(',').map(s => s.trim());
      if (parts.length > 1) {
        const state = parts[parts.length - 1]!;
        stateMap.set(state, (stateMap.get(state) ?? 0) + c.value);
      }
    });
    const topStates = withPct(Array.from(stateMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10));

    return { success: true, audience: { age, gender, topCountries, topStates, topCities } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar o Instagram." };
  }
}

export type InstagramMedia = {
  id: string;
  caption: string | null;
  mediaType: string;
  productType: string;
  permalink: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  timestamp: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  totalInteractions: number;
};

/** Fetch+mapeamento compartilhado entre `getInstagramTopContent` (presets fechados) e
 *  `getInstagramTopContentInRange` (range arbitrário, ex: "semana anterior" pro lote de IA).
 *  `untilISO` é exclusivo (mesma semântica dos outros usos de range nesse arquivo). */
async function fetchTopContentInRange(pageToken: string, igId: string, sinceISO: string, untilISO: string): Promise<InstagramMedia[]> {
  const sinceTs = Math.floor(new Date(sinceISO + "T00:00:00Z").getTime() / 1000);
  const untilTs = Math.floor(new Date(untilISO + "T00:00:00Z").getTime() / 1000);

  const listRes = await graphGET(
    `/${igId}/media`,
    { fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count", limit: "50" },
    pageToken,
  );
  const items = ((listRes.data ?? []) as any[]).filter((m) => {
    const ts = Math.floor(new Date(m.timestamp).getTime() / 1000);
    return ts >= sinceTs && ts < untilTs;
  });

  const withInsights = await Promise.all(
    items.map(async (m) => {
      const byName = await fetchMediaInsights(m.id, pageToken);
      const likes = Number(m.like_count ?? 0);
      const comments = Number(m.comments_count ?? 0);
      const shares = byName.get("shares") ?? 0;
      const saved = byName.get("saved") ?? 0;
      return {
        id: m.id,
        caption: m.caption ?? null,
        mediaType: m.media_type,
        productType: m.media_product_type,
        permalink: m.permalink ?? null,
        mediaUrl: m.media_url ?? null,
        thumbnailUrl: m.thumbnail_url ?? (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url : null) ?? null,
        timestamp: m.timestamp,
        views: byName.get("views") ?? byName.get("plays") ?? 0,
        reach: byName.get("reach") ?? 0,
        likes,
        comments,
        shares,
        saved,
        totalInteractions: byName.get("total_interactions") ?? likes + comments + shares + saved,
      } as InstagramMedia;
    }),
  );

  return withInsights
    .sort((a, b) => b.totalInteractions - a.totalInteractions)
    .slice(0, 10);
}

/** Métricas disponíveis variam por tipo de mídia e versão da Graph API. Uma métrica inválida não
 * pode eliminar a postagem inteira: tentamos conjuntos progressivamente menores e preservamos os
 * contadores básicos (`like_count` e `comments_count`) retornados pelo próprio objeto de mídia. */
async function fetchMediaInsights(mediaId: string, pageToken: string): Promise<Map<string, number>> {
  const metricGroups = [
    "views,reach,total_interactions,saved,shares",
    "plays,reach,total_interactions,saved,shares",
    "impressions,reach,total_interactions,saved,shares",
    "reach,total_interactions,saved,shares",
    "reach,saved,shares",
    "reach",
  ];
  for (const metric of metricGroups) {
    try {
      const response = await graphGET(`/${mediaId}/insights`, { metric }, pageToken);
      return new Map<string, number>(
        ((response.data ?? []) as any[]).map((row) => [
          row.name,
          Number(row.values?.[0]?.value ?? row.total_value?.value ?? 0),
        ]),
      );
    } catch {
      // Tenta um conjunto compatível com outro tipo de mídia/versão da API.
    }
  }
  return new Map<string, number>();
}

export async function getInstagramTopContent(datePreset: InstagramDatePreset): Promise<{ success: true; media: InstagramMedia[] } | { success: false; error: string }> {
  const { pageToken, igId } = await loadInstagramSettings();
  if (!pageToken || !igId) return { success: false, error: "Instagram não conectado. Configure em Configurações." };

  const { since, until } = datePresetToRange(datePreset);

  try {
    const media = await fetchTopContentInRange(pageToken, igId, since, until);
    return { success: true, media };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar o Instagram." };
  }
}

/** Generalização pra range arbitrário (ex: "semana anterior" do lote de IA) — mesmo fetch e
 *  mapeamento de `getInstagramTopContent`, mas sem depender de um preset fechado. */
export async function getInstagramTopContentInRange(sinceISO: string, untilISO: string): Promise<{ success: true; media: InstagramMedia[] } | { success: false; error: string }> {
  const { pageToken, igId } = await loadInstagramSettings();
  if (!pageToken || !igId) return { success: false, error: "Instagram não conectado. Configure em Configurações." };

  try {
    const media = await fetchTopContentInRange(pageToken, igId, sinceISO, untilISO);
    return { success: true, media };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar o Instagram." };
  }
}

async function fetchStoryInsights(storyId: string, pageToken: string): Promise<{ views: number; reach: number }> {
  // `views` é a métrica atual. Contas ainda atendidas por uma versão anterior da API podem
  // expor `impressions`; o fallback mantém a seleção funcionando durante a transição da Meta.
  for (const metric of ["views,reach", "impressions,reach"]) {
    try {
      const response = await graphGET(`/${storyId}/insights`, { metric }, pageToken);
      const byName = new Map<string, number>(
        ((response.data ?? []) as any[]).map((row) => [
          row.name,
          Number(row.total_value?.value ?? row.values?.[0]?.value ?? 0),
        ]),
      );
      return {
        views: byName.get("views") ?? byName.get("impressions") ?? 0,
        reach: byName.get("reach") ?? 0,
      };
    } catch {
      // Tenta o conjunto de métricas compatível com a outra versão da API.
    }
  }
  return { views: 0, reach: 0 };
}

/** Stories ainda ativos no momento da criação do calendário (janela prática de até 24h).
 * A API não devolve Stories expirados por esse endpoint, então a seleção é sempre feita sobre o
 * conteúdo que o público ainda consegue abrir. */
export async function getInstagramActiveStories(): Promise<{ success: true; media: InstagramMedia[] } | { success: false; error: string }> {
  const { pageToken, igId } = await loadInstagramSettings();
  if (!pageToken || !igId) return { success: false, error: "Instagram não conectado. Configure em Configurações." };

  try {
    const response = await graphGET(
      `/${igId}/stories`,
      { fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp", limit: "50" },
      pageToken,
    );
    const media = await Promise.all(
      ((response.data ?? []) as any[]).map(async (story) => {
        const insights = await fetchStoryInsights(story.id, pageToken);
        return {
          id: story.id,
          caption: story.caption ?? null,
          mediaType: story.media_type,
          productType: story.media_product_type ?? "STORY",
          permalink: story.permalink ?? null,
          mediaUrl: story.media_url ?? null,
          thumbnailUrl: story.thumbnail_url ?? (story.media_type === "IMAGE" ? story.media_url : null) ?? null,
          timestamp: story.timestamp,
          views: insights.views,
          reach: insights.reach,
          likes: 0,
          comments: 0,
          shares: 0,
          saved: 0,
          totalInteractions: 0,
        } satisfies InstagramMedia;
      }),
    );
    media.sort((a, b) => b.views - a.views || b.reach - a.reach || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { success: true, media };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar os Stories ativos." };
  }
}
