import { loadUazapiCreds, createGroup, applyGroupSettings, getGroupInfo } from "./envio-uazapi.server";
import { canonicalWhatsappGroupJid } from "./envio-group-sync";

/** Banco do live-launchpad-79 (Cartzy, antigo OrderZaps) — dono real dos grupos/campanhas, escopado ao tenant
 *  Mania de Mulher. Ver "Fluxo de Envio vs SendFlow" no vault pro histórico dessa migração. */
async function admin() {
  const { getLiveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
  return getLiveLaunchpadAdmin();
}

async function tenantId() {
  const { MANIA_DE_MULHER_TENANT_ID } = await import("@/integrations/supabase/live-launchpad-client.server");
  return MANIA_DE_MULHER_TENANT_ID;
}

export type GroupTemplate = {
  name_base?: string;
  description?: string;
  image_url?: string;
  max_participants?: number;
  seed_numbers?: string[];
};

export type EnvioCampaignStats = {
  clicks: number;
  entries: number;
  exits: number;
  /** entradas ÷ cliques, em %. */
  entryRate: number;
  groupCount: number;
  participants: number;
  fullGroups: number;
  availableGroups: number;
};

export type EnvioCampaign = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_entry_open: boolean;
  is_active: boolean;
  facebook_pixel_id: string | null;
  auto_spawn_enabled: boolean;
  spawn_margin: number;
  group_template: GroupTemplate | null;
  last_spawn_at: string | null;
  created_at: string;
  updated_at: string;
  group_count?: number;
  /** Link público que as pessoas usam (o do Cartzy: o redirecionamento e a contagem de cliques são de lá). */
  public_url?: string;
  stats?: EnvioCampaignStats;
};

export type EnvioCampaignAudience = {
  campaign: EnvioCampaign;
  groupIds: string[];
  groupNames: string[];
  groupCount: number;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PUBLIC_LINK_BASE = "https://app.cartzy.com.br/fluxo";

let tenantSlugCache: string | null = null;
async function tenantSlug(): Promise<string> {
  if (tenantSlugCache) return tenantSlugCache;
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("tenants" as any) as any).select("slug").eq("id", await tenantId()).maybeSingle();
  tenantSlugCache = ((data as { slug?: string } | null)?.slug as string | undefined) || "app";
  return tenantSlugCache;
}

/** Eventos de entrada/saída do tenant, paginados de 1000 em 1000 (o PostgREST corta em 1000 por consulta). */
type GroupEventRow = { group_id: string | null; group_jid: string | null; event_type: string; created_at: string };

async function fetchTenantGroupEvents(): Promise<GroupEventRow[]> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const out: GroupEventRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabaseAdmin.from("fe_group_events" as any) as any)
      .select("group_id, group_jid, event_type, created_at")
      .eq("tenant_id", tenant)
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as any[];
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

/** Mesma regra do original (summarizeFlowEvents): o evento conta pro grupo pelo id OU pelo JID. */
function summarizeEvents(events: GroupEventRow[], groups: { id: string; group_jid: string }[], since?: string) {
  // Campanha nova começa zerada: só contam entradas/saídas a partir da criação dela.
  const sinceMs = since ? new Date(since).getTime() : Number.NEGATIVE_INFINITY;
  const ids = new Set(groups.map((g) => g.id));
  const jids = new Set(groups.map((g) => g.group_jid).filter(Boolean));
  let entries = 0;
  let exits = 0;
  for (const event of events) {
    const matches = (event.group_id && ids.has(event.group_id)) || (event.group_jid && jids.has(event.group_jid));
    if (!matches) continue;
    if (new Date(event.created_at).getTime() < sinceMs) continue;
    if (event.event_type === "join") entries++;
    if (event.event_type === "leave") exits++;
  }
  return { entries, exits };
}

export async function listEnvioCampaigns(): Promise<EnvioCampaign[]> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const { data, error } = await ((supabaseAdmin.from("fe_campaigns" as any) as any) as any)
    .select("*")
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const campaigns = (data ?? []) as EnvioCampaign[];
  if (campaigns.length === 0) return [];

  const { data: links, error: linksError } = await (supabaseAdmin.from("fe_campaign_groups" as any) as any)
    .select("campaign_id, group_id")
    .in("campaign_id", campaigns.map((campaign) => campaign.id));
  if (linksError) throw new Error(linksError.message);

  const groupIdsByCampaign = new Map<string, string[]>();
  for (const link of (links ?? []) as any[]) {
    const list = groupIdsByCampaign.get(link.campaign_id as string) ?? [];
    list.push(link.group_id as string);
    groupIdsByCampaign.set(link.campaign_id as string, list);
  }

  const allGroupIds = [...new Set([...groupIdsByCampaign.values()].flat())];
  const groupsById = new Map<string, any>();
  for (let i = 0; i < allGroupIds.length; i += 200) {
    const { data: groups } = await (supabaseAdmin.from("fe_groups" as any) as any)
      .select("id, group_jid, participant_count, max_participants, is_entry_open, is_active")
      .eq("tenant_id", tenant)
      .in("id", allGroupIds.slice(i, i + 200));
    for (const g of (groups ?? []) as any[]) groupsById.set(g.id as string, g);
  }

  const events = await fetchTenantGroupEvents();
  const slug = await tenantSlug();

  const clickCounts = await Promise.all(
    campaigns.map(async (campaign) => {
      const { count } = await (supabaseAdmin.from("fe_link_clicks" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id);
      return count ?? 0;
    }),
  );

  return campaigns.map((campaign, index) => {
    const linkedIds = groupIdsByCampaign.get(campaign.id) ?? [];
    const linked = linkedIds.map((id) => groupsById.get(id)).filter(Boolean);
    const { entries, exits } = summarizeEvents(events, linked, (campaign as { created_at?: string }).created_at);
    const clicks = clickCounts[index] ?? 0;
    const full = (g: any) => Boolean(g.max_participants) && (g.participant_count || 0) >= g.max_participants;
    return {
      ...campaign,
      group_count: linkedIds.length,
      public_url: `${PUBLIC_LINK_BASE}/${slug}/${campaign.slug}`,
      stats: {
        clicks,
        entries,
        exits,
        entryRate: clicks > 0 ? (entries / clicks) * 100 : 0,
        groupCount: linkedIds.length,
        participants: linked.reduce((sum: number, g: any) => sum + (g.participant_count || 0), 0),
        fullGroups: linked.filter(full).length,
        availableGroups: linked.filter((g: any) => g.is_entry_open && g.is_active && !full(g)).length,
      },
    };
  });
}

/** Garante que a campanha é do tenant da Mania de Mulher (o banco é compartilhado com outros clientes do Cartzy). */
async function assertCampaignOfTenant(campaignId: string): Promise<EnvioCampaign> {
  const supabaseAdmin = await admin();
  const { data } = await ((supabaseAdmin.from("fe_campaigns" as any) as any) as any)
    .select("*")
    .eq("id", campaignId)
    .eq("tenant_id", await tenantId())
    .maybeSingle();
  if (!data) throw new Error("Campanha não encontrada.");
  return data as EnvioCampaign;
}

/** Resolve campanha e grupos no banco dono do Fluxo de Envio. O tenant é sempre validado no
 * servidor; IDs e nomes recebidos do navegador nunca são tratados como fonte de verdade. */
export async function resolveEnvioCampaignAudience(campaignId: string): Promise<EnvioCampaignAudience> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();

  const { data: rawCampaign, error: campaignError } = await (supabaseAdmin.from("fe_campaigns" as any) as any)
    .select("*")
    .eq("id", campaignId)
    .eq("tenant_id", tenant)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!rawCampaign) throw new Error("Campanha não encontrada.");
  const campaign = rawCampaign as EnvioCampaign;
  if (!campaign.is_active) throw new Error("A campanha selecionada está inativa.");

  const { data: links, error: linksError } = await (supabaseAdmin.from("fe_campaign_groups" as any) as any)
    .select("group_id")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (linksError) throw new Error(linksError.message);

  const groupIds = ((links ?? []) as any[]).map((link) => link.group_id as string).filter(Boolean);
  let groupNames: string[] = [];
  if (groupIds.length > 0) {
    const { data: groups } = await (supabaseAdmin.from("fe_groups" as any) as any)
      .select("id, group_name")
      .in("id", groupIds);
    const namesById = new Map(((groups ?? []) as any[]).map((group) => [group.id as string, group.group_name as string]));
    groupNames = groupIds.map((id) => namesById.get(id)).filter((name): name is string => Boolean(name));
  }

  return {
    campaign: { ...campaign, group_count: groupIds.length },
    groupIds,
    groupNames,
    groupCount: groupIds.length,
  };
}

export async function createEnvioCampaign(input: { name: string; description?: string | undefined }): Promise<EnvioCampaign> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const baseSlug = slugify(input.name) || `campanha-${Date.now()}`;
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { data: existing } = await ((supabaseAdmin.from("fe_campaigns" as any) as any) as any)
      .select("id")
      .eq("tenant_id", tenant)
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }
  const { data, error } = await (supabaseAdmin
    .from("fe_campaigns" as any) as any)
    .insert({ tenant_id: tenant, name: input.name, slug, description: input.description ?? null } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioCampaign;
}

export async function updateEnvioCampaign(
  id: string,
  patch: {
    name?: string | undefined;
    description?: string | undefined;
    is_entry_open?: boolean | undefined;
    is_active?: boolean | undefined;
    facebook_pixel_id?: string | null | undefined;
    auto_spawn_enabled?: boolean | undefined;
    spawn_margin?: number | undefined;
    group_template?: GroupTemplate | undefined;
  },
): Promise<EnvioCampaign> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const next: Record<string, unknown> = { ...patch };
  if ("facebook_pixel_id" in patch) next["facebook_pixel_id"] = patch.facebook_pixel_id?.trim() || null;
  if (patch.group_template) {
    // Mescla com o molde atual: descrição, imagem e números-semente configurados no Cartzy não podem sumir
    // quando só parte do molde é editada aqui.
    const current = await assertCampaignOfTenant(id);
    next["group_template"] = { ...(current.group_template ?? {}), ...patch.group_template };
  }
  const { data, error } = await (supabaseAdmin
    .from("fe_campaigns" as any) as any)
    .update({ ...next, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("tenant_id", tenant)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioCampaign;
}

export async function deleteEnvioCampaign(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const { error } = await ((supabaseAdmin.from("fe_campaigns" as any) as any) as any).delete().eq("id", id).eq("tenant_id", tenant);
  if (error) throw new Error(error.message);
  return { success: true };
}

export type CampaignGroupLink = { group_id: string; weight_percent: number | null };

export async function getCampaignGroupLinks(campaignId: string): Promise<(CampaignGroupLink & { id: string; sort_order: number })[]> {
  await assertCampaignOfTenant(campaignId);
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin
    .from("fe_campaign_groups" as any) as any)
    .select("id, group_id, weight_percent, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

/** Substitui o conjunto de grupos vinculados por completo (delete-then-reinsert), preservando os
 *  pesos informados — mesmo padrão do CampaignDetailDialog original. */
export async function setCampaignGroupLinks(campaignId: string, links: CampaignGroupLink[]): Promise<void> {
  await assertCampaignOfTenant(campaignId);
  const supabaseAdmin = await admin();
  const { error: deleteError } = await ((supabaseAdmin.from("fe_campaign_groups" as any) as any) as any).delete().eq("campaign_id", campaignId);
  if (deleteError) throw new Error(deleteError.message);
  if (links.length === 0) return;
  const { error } = await ((supabaseAdmin.from("fe_campaign_groups" as any) as any) as any).insert(
    links.map((l, i) => ({
      campaign_id: campaignId,
      group_id: l.group_id,
      weight_percent: l.weight_percent == null ? null : Math.min(100, Math.max(0, l.weight_percent)),
      sort_order: i,
    })) as never,
  );
  if (error) throw new Error(error.message);
}

export async function updateCampaignGroupWeight(campaignId: string, groupId: string, weightPercent: number | null): Promise<void> {
  await assertCampaignOfTenant(campaignId);
  const supabaseAdmin = await admin();
  const { error } = await (supabaseAdmin
    .from("fe_campaign_groups" as any) as any)
    .update({ weight_percent: weightPercent == null ? null : Math.min(100, Math.max(0, weightPercent)) } as never)
    .eq("campaign_id", campaignId)
    .eq("group_id", groupId);
  if (error) throw new Error(error.message);
}

/** Link do redirecionamento do próprio CRM (/fluxo/<slug>). O link que se divulga é o do Cartzy (`public_url`). */
export function campaignPublicUrl(slug: string): string {
  return `${process.env["PUBLIC_APP_URL"] || "https://crm.maniadmulher.com"}/fluxo/${slug}`;
}

/** Porta de fe-spawn-group: cria um clone do grupo-molde da campanha. Debounce de 2min via
 *  last_spawn_at (escrito ANTES de chamar a UazAPI, pra fechar a janela de corrida entre cliques
 *  concorrentes que disparariam o spawn ao mesmo tempo). */
export async function spawnGroupForCampaign(campaignId: string): Promise<{ skipped?: "debounce"; groupId?: string }> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const c = await assertCampaignOfTenant(campaignId);
  if (!c.auto_spawn_enabled) throw new Error("Auto-clonagem desativada nessa campanha");

  if (c.last_spawn_at && Date.now() - new Date(c.last_spawn_at).getTime() < 2 * 60_000) {
    return { skipped: "debounce" };
  }
  await ((supabaseAdmin.from("fe_campaigns" as any) as any) as any).update({ last_spawn_at: new Date().toISOString() } as never).eq("id", campaignId);

  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");

  const template = c.group_template ?? {};
  const nameBase = template.name_base || c.name;
  const groupName = `${nameBase} #${Date.now().toString().slice(-4)}`;
  const seedNumbers = (template.seed_numbers ?? []).map((p) => {
    const digits = p.replace(/\D/g, "");
    return digits.startsWith("55") ? digits : `55${digits}`;
  });

  const { groupJid, inviteLink: createdInviteLink } = await createGroup(creds, groupName, seedNumbers);
  await applyGroupSettings(creds, groupJid, { description: template.description, imageUrl: template.image_url });

  let inviteLink = createdInviteLink;
  if (!inviteLink) {
    try {
      const info = await getGroupInfo(creds, groupJid, { getInviteLink: true });
      // A UazAPI pode devolver o grupo aninhado em `group` (formato que o fe-spawn-group original lê).
      const grp = info?.group ?? info;
      const raw = grp?.inviteLink ?? grp?.invite_link ?? info?.inviteLink ?? info?.invite_link;
      if (raw) inviteLink = raw.startsWith("http") ? raw : `https://chat.whatsapp.com/${raw}`;
    } catch (error) {
      console.error("spawnGroupForCampaign: falha ao buscar invite link", error);
    }
  }

  const { data: newGroup, error } = await (supabaseAdmin
    .from("fe_groups" as any) as any)
    .insert({
      tenant_id: tenant,
      group_jid: canonicalWhatsappGroupJid(groupJid),
      group_name: groupName,
      invite_link: inviteLink ?? null,
      participant_count: seedNumbers.length,
      max_participants: template.max_participants || 1000,
      is_entry_open: true,
      is_active: true,
      is_admin: true,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const groupId = (newGroup as any).id as string;

  const { count } = await (supabaseAdmin
    .from("fe_campaign_groups" as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  await (supabaseAdmin
    .from("fe_campaign_groups" as any) as any)
    .insert({ campaign_id: campaignId, group_id: groupId, sort_order: count ?? 0 } as never);

  return { groupId };
}
