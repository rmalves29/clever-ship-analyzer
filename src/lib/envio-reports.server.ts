async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type EnvioReportsPeriod = "24h" | "7d" | "30d" | "90d" | "all";

function periodStart(period: EnvioReportsPeriod): string {
  const days: Record<EnvioReportsPeriod, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, all: 36500 };
  return new Date(Date.now() - days[period] * 86_400_000).toISOString();
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function getEnvioReports(period: EnvioReportsPeriod) {
  const supabaseAdmin = await admin();
  const start = periodStart(period);

  const [{ data: clicks }, { data: events }, { data: campaigns }, { data: campaignGroups }, { data: groups }] = await Promise.all([
    ((supabaseAdmin.from("envio_link_clicks" as any) as any) as any).select("campaign_id, clicked_at").gte("clicked_at", start),
    ((supabaseAdmin.from("envio_group_events" as any) as any) as any).select("group_id, event_type, created_at").gte("created_at", start),
    ((supabaseAdmin.from("envio_campaigns" as any) as any) as any).select("id, name"),
    ((supabaseAdmin.from("envio_campaign_groups" as any) as any) as any).select("campaign_id, group_id"),
    ((supabaseAdmin.from("envio_groups" as any) as any) as any).select("id, group_name, participant_count"),
  ]);

  const linkedGroupIds = new Set(((campaignGroups ?? []) as any[]).map((r) => r.group_id));
  const groupToCampaigns = new Map<string, string[]>();
  for (const link of (campaignGroups ?? []) as any[]) {
    const arr = groupToCampaigns.get(link.group_id) ?? [];
    arr.push(link.campaign_id);
    groupToCampaigns.set(link.group_id, arr);
  }

  const clickRows = (clicks ?? []) as any[];
  const eventRows = ((events ?? []) as any[]).filter((e) => linkedGroupIds.has(e.group_id));

  const totalClicks = clickRows.length;
  const totalEntries = eventRows.filter((e) => e.event_type === "join").length;
  const totalExits = eventRows.filter((e) => e.event_type === "leave").length;
  const net = totalEntries - totalExits;
  const conversionPct = totalClicks > 0 ? Number(((totalEntries / totalClicks) * 100).toFixed(1)) : 0;

  const timelineMap = new Map<string, { clicks: number; entries: number; exits: number }>();
  for (const c of clickRows) {
    const k = dayKey(c.clicked_at);
    const slot = timelineMap.get(k) ?? { clicks: 0, entries: 0, exits: 0 };
    slot.clicks++;
    timelineMap.set(k, slot);
  }
  for (const e of eventRows) {
    const k = dayKey(e.created_at);
    const slot = timelineMap.get(k) ?? { clicks: 0, entries: 0, exits: 0 };
    if (e.event_type === "join") slot.entries++;
    else slot.exits++;
    timelineMap.set(k, slot);
  }
  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-90)
    .map(([date, v]) => ({ date, ...v }));

  const clicksByCampaign = new Map<string, number>();
  for (const c of clickRows) clicksByCampaign.set(c.campaign_id, (clicksByCampaign.get(c.campaign_id) ?? 0) + 1);
  const entriesByCampaign = new Map<string, number>();
  const exitsByCampaign = new Map<string, number>();
  for (const e of eventRows) {
    for (const campaignId of groupToCampaigns.get(e.group_id) ?? []) {
      const map = e.event_type === "join" ? entriesByCampaign : exitsByCampaign;
      map.set(campaignId, (map.get(campaignId) ?? 0) + 1);
    }
  }
  const campaignRows = ((campaigns ?? []) as any[])
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
    map.set(e.group_id, (map.get(e.group_id) ?? 0) + 1);
  }
  const groupRows = ((groups ?? []) as any[])
    .filter((g) => entriesByGroup.has(g.id) || exitsByGroup.has(g.id))
    .map((g) => {
      const entriesN = entriesByGroup.get(g.id) ?? 0;
      const exitsN = exitsByGroup.get(g.id) ?? 0;
      return { id: g.id, name: g.group_name, participants: g.participant_count, entries: entriesN, exits: exitsN, net: entriesN - exitsN };
    })
    .sort((a, b) => b.net - a.net);

  const recentEvents = eventRows
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);

  return { totalClicks, totalEntries, totalExits, net, conversionPct, timeline, campaigns: campaignRows, groups: groupRows, recentEvents };
}
