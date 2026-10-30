import { canonicalWhatsappGroupJid } from "./envio-group-sync";

/** Campanhas, grupos, cliques e eventos de grupo vivem no Cartzy (live-launchpad). Bancos diferentes =
 *  sem SQL join, então tudo é cruzado em memória. */
async function db(): Promise<any> {
  const { getLiveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
  return getLiveLaunchpadAdmin();
}

async function tenantId() {
  const { MANIA_DE_MULHER_TENANT_ID } = await import("@/integrations/supabase/live-launchpad-client.server");
  return MANIA_DE_MULHER_TENANT_ID;
}

export type EnvioReportsPeriod = "24h" | "7d" | "30d" | "90d" | "all";

const PAGE = 1000;
const BRT_OFFSET_MS = 3 * 3_600_000;

function periodStart(period: EnvioReportsPeriod): string | null {
  if (period === "all") return null;
  const days: Record<Exclude<EnvioReportsPeriod, "all">, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };
  return new Date(Date.now() - days[period] * 86_400_000).toISOString();
}

/** Dia no fuso de Brasília (YYYY-MM-DD), para o gráfico não "virar o dia" às 21h. */
function dayKey(iso: string): string {
  return new Date(new Date(iso).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Lê todas as linhas em páginas de 1000 (o limite padrão do PostgREST cortava os relatórios). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type Slot = { clicks: number; entries: number; exits: number };

export async function getEnvioReports(period: EnvioReportsPeriod) {
  const supabase = await db();
  const tenant = await tenantId();
  const start = periodStart(period);

  const { data: campaignData, error: campaignError } = await supabase.from("fe_campaigns").select("id, name, created_at, stats_since").eq("tenant_id", tenant);
  if (campaignError) throw new Error(campaignError.message);
  const campaigns = (campaignData ?? []) as { id: string; name: string; created_at: string; stats_since: string | null }[];
  const campaignIds = campaigns.map((c) => c.id);

  const groupsPromise = fetchAll<any>((from, to) =>
    supabase.from("fe_groups").select("id, group_jid, group_name, participant_count").eq("tenant_id", tenant).order("id").range(from, to),
  );
  const linksPromise = fetchAll<any>((from, to) =>
    campaignIds.length
      ? supabase.from("fe_campaign_groups").select("campaign_id, group_id").in("campaign_id", campaignIds).order("campaign_id").order("group_id").range(from, to)
      : Promise.resolve({ data: [], error: null }),
  );
  const clicksPromise = fetchAll<{ campaign_id: string; clicked_at: string }>((from, to) => {
    if (!campaignIds.length) return Promise.resolve({ data: [], error: null });
    let q = supabase.from("fe_link_clicks").select("campaign_id, clicked_at").in("campaign_id", campaignIds);
    if (start) q = q.gte("clicked_at", start);
    return q.order("clicked_at").order("id").range(from, to);
  });
  const eventsPromise = fetchAll<{ group_id: string | null; group_jid: string | null; event_type: string; created_at: string; phone: string | null; campaign_id: string | null }>((from, to) => {
    let q = supabase.from("fe_group_events").select("group_id, group_jid, event_type, created_at, phone, campaign_id").eq("tenant_id", tenant);
    if (start) q = q.gte("created_at", start);
    return q.order("created_at").order("id").range(from, to);
  });

  const [groups, links, clickRows, allEvents] = await Promise.all([groupsPromise, linksPromise, clicksPromise, eventsPromise]);

  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  // Início da contagem de cada campanha: a data de zeramento (ou a criação, se nunca foi zerada).
  const campaignStartMs = new Map(campaigns.map((c) => [c.id, Math.max(new Date(c.created_at).getTime(), c.stats_since ? new Date(c.stats_since).getTime() : 0)]));
  const groupById = new Map<string, any>(groups.map((g) => [g.id, g]));
  // Um mesmo grupo pode ter mais de uma linha (jid "...-group" e "...@g.us"): resolve pelos dois.
  const groupByJid = new Map<string, any>();
  for (const g of groups) {
    const key = canonicalWhatsappGroupJid(g.group_jid);
    if (key && !groupByJid.has(key)) groupByJid.set(key, g);
  }
  const resolveGroup = (e: { group_id: string | null; group_jid: string | null }) =>
    (e.group_id && groupById.get(e.group_id)) || (e.group_jid ? groupByJid.get(canonicalWhatsappGroupJid(e.group_jid)) : undefined) || null;

  const groupToCampaigns = new Map<string, Set<string>>();
  for (const link of links) {
    const set = groupToCampaigns.get(link.group_id) ?? new Set<string>();
    set.add(link.campaign_id);
    groupToCampaigns.set(link.group_id, set);
  }
  // Campanhas de um grupo também valem para as linhas duplicadas do mesmo jid.
  const campaignsOfGroup = (g: any): string[] => {
    const ids = new Set<string>(groupToCampaigns.get(g.id) ?? []);
    const key = canonicalWhatsappGroupJid(g.group_jid);
    for (const other of groups) {
      if (other.id !== g.id && canonicalWhatsappGroupJid(other.group_jid) === key) for (const c of groupToCampaigns.get(other.id) ?? []) ids.add(c);
    }
    return [...ids];
  };

  // Só conta eventos de grupos que pertencem a alguma campanha (mesma regra do painel original).
  const eventRows = allEvents
    .map((e) => ({ ...e, group: resolveGroup(e) }))
    .filter((e) => e.group && campaignsOfGroup(e.group).length > 0) as (typeof allEvents[number] & { group: any })[];

  const totalClicks = clickRows.length;
  const totalEntries = eventRows.filter((e) => e.event_type === "join").length;
  const totalExits = eventRows.filter((e) => e.event_type === "leave").length;
  const net = totalEntries - totalExits;
  const conversionPct = totalClicks > 0 ? Number(((totalEntries / totalClicks) * 100).toFixed(1)) : 0;
  const retentionPct = totalEntries > 0 ? Number((((totalEntries - totalExits) / totalEntries) * 100).toFixed(1)) : 0;

  const timelineMap = new Map<string, Slot>();
  const slotOf = (k: string) => {
    let s = timelineMap.get(k);
    if (!s) timelineMap.set(k, (s = { clicks: 0, entries: 0, exits: 0 }));
    return s;
  };
  for (const c of clickRows) slotOf(dayKey(c.clicked_at)).clicks++;
  for (const e of eventRows) {
    const slot = slotOf(dayKey(e.created_at));
    if (e.event_type === "join") slot.entries++;
    else slot.exits++;
  }
  // Linha do tempo contínua: dias sem movimento aparecem zerados em vez de sumirem do gráfico.
  const timeline: ({ date: string } & Slot)[] = [];
  if (timelineMap.size > 0) {
    const keys = [...timelineMap.keys()].sort();
    const todayKey = dayKey(new Date().toISOString());
    const lastKey = keys[keys.length - 1] as string;
    const last = todayKey > lastKey ? todayKey : lastKey;
    const first = new Date(`${keys[0] as string}T12:00:00Z`);
    const end = new Date(`${last}T12:00:00Z`);
    for (let d = first; d <= end; d = new Date(d.getTime() + 86_400_000)) {
      const k = d.toISOString().slice(0, 10);
      timeline.push({ date: k, ...(timelineMap.get(k) ?? { clicks: 0, entries: 0, exits: 0 }) });
    }
  }

  const clicksByCampaign = new Map<string, number>();
  for (const c of clickRows) {
    if (new Date(c.clicked_at).getTime() < (campaignStartMs.get(c.campaign_id) ?? 0)) continue;
    clicksByCampaign.set(c.campaign_id, (clicksByCampaign.get(c.campaign_id) ?? 0) + 1);
  }
  const entriesByCampaign = new Map<string, number>();
  const exitsByCampaign = new Map<string, number>();
  for (const e of eventRows) {
    // Entrada/saída atribuída à campanha pelo clique (campaign_id), contada só depois do início/zeramento dela.
    if (!e.campaign_id) continue;
    if (new Date(e.created_at).getTime() < (campaignStartMs.get(e.campaign_id) ?? 0)) continue;
    const map = e.event_type === "join" ? entriesByCampaign : exitsByCampaign;
    map.set(e.campaign_id, (map.get(e.campaign_id) ?? 0) + 1);
  }
  const campaignRows = campaigns
    .map((c) => {
      const clicksN = clicksByCampaign.get(c.id) ?? 0;
      const entriesN = entriesByCampaign.get(c.id) ?? 0;
      const exitsN = exitsByCampaign.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        clicks: clicksN,
        entries: entriesN,
        exits: exitsN,
        net: entriesN - exitsN,
        conversionPct: clicksN > 0 ? Number(((entriesN / clicksN) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.clicks + b.entries - (a.clicks + a.entries));

  const entriesByGroup = new Map<string, number>();
  const exitsByGroup = new Map<string, number>();
  for (const e of eventRows) {
    const map = e.event_type === "join" ? entriesByGroup : exitsByGroup;
    map.set(e.group.id, (map.get(e.group.id) ?? 0) + 1);
  }
  const groupRows = groups
    .filter((g) => entriesByGroup.has(g.id) || exitsByGroup.has(g.id))
    .map((g) => {
      const entriesN = entriesByGroup.get(g.id) ?? 0;
      const exitsN = exitsByGroup.get(g.id) ?? 0;
      return { id: g.id, name: g.group_name as string, participants: g.participant_count as number | null, entries: entriesN, exits: exitsN, net: entriesN - exitsN };
    })
    .sort((a, b) => b.net - a.net || b.entries - a.entries);

  const recentEvents = eventRows
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50)
    .map((e) => ({
      event_type: e.event_type,
      phone: e.phone,
      created_at: e.created_at,
      groupName: e.group.group_name as string,
      campaignNames: campaignsOfGroup(e.group).map((id) => campaignName.get(id)).filter(Boolean) as string[],
    }));

  return { totalClicks, totalEntries, totalExits, net, conversionPct, retentionPct, timeline, campaigns: campaignRows, groups: groupRows, recentEvents };
}
