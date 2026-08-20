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
    case "last_7d":
      return { since: toISO(daysAgo(7)), until: toISO(now) };
    case "last_14d":
      return { since: toISO(daysAgo(14)), until: toISO(now) };
    case "last_30d":
      return { since: toISO(daysAgo(30)), until: toISO(now) };
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: toISO(first), until: toISO(now) };
    }
    case "last_month": {
      const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastPrev = new Date(firstThis.getTime() - 86_400_000);
      const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
      return { since: toISO(firstPrev), until: toISO(lastPrev) };
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

    return { success: true, audience: { age, gender, topCountries, topCities } };
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
  thumbnailUrl: string | null;
  timestamp: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  totalInteractions: number;
};

export async function getInstagramTopContent(datePreset: InstagramDatePreset): Promise<{ success: true; media: InstagramMedia[] } | { success: false; error: string }> {
  const { pageToken, igId } = await loadInstagramSettings();
  if (!pageToken || !igId) return { success: false, error: "Instagram não conectado. Configure em Configurações." };

  const { since } = datePresetToRange(datePreset);
  const sinceTs = Math.floor(new Date(since + "T00:00:00Z").getTime() / 1000);

  try {
    const listRes = await graphGET(
      `/${igId}/media`,
      { fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp", limit: "50" },
      pageToken,
    );
    const items = ((listRes.data ?? []) as any[]).filter((m) => Math.floor(new Date(m.timestamp).getTime() / 1000) >= sinceTs);

    const withInsights = await Promise.all(
      items.map(async (m) => {
        try {
          const insRes = await graphGET(`/${m.id}/insights`, { metric: "reach,likes,comments,shares,saved,total_interactions" }, pageToken);
          const byName = new Map<string, number>(((insRes.data ?? []) as any[]).map((row) => [row.name, row.values?.[0]?.value ?? row.total_value?.value ?? 0]));
          return {
            id: m.id,
            caption: m.caption ?? null,
            mediaType: m.media_type,
            productType: m.media_product_type,
            permalink: m.permalink ?? null,
            thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
            timestamp: m.timestamp,
            reach: byName.get("reach") ?? 0,
            likes: byName.get("likes") ?? 0,
            comments: byName.get("comments") ?? 0,
            shares: byName.get("shares") ?? 0,
            saved: byName.get("saved") ?? 0,
            totalInteractions: byName.get("total_interactions") ?? 0,
          } as InstagramMedia;
        } catch {
          return null;
        }
      }),
    );

    const media = withInsights
      .filter((m): m is InstagramMedia => m !== null)
      .sort((a, b) => b.totalInteractions - a.totalInteractions)
      .slice(0, 10);

    return { success: true, media };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar o Instagram." };
  }
}
