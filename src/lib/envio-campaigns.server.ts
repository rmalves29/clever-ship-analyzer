import { loadUazapiCreds, createGroup, applyGroupSettings, getGroupInfo, toGroupJid, fromGroupJid } from "./envio-uazapi.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type GroupTemplate = {
  name_base?: string;
  description?: string;
  image_url?: string;
  max_participants?: number;
  seed_numbers?: string[];
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
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listEnvioCampaigns(): Promise<EnvioCampaign[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await ((supabaseAdmin.from("envio_campaigns" as any) as any) as any).select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvioCampaign[];
}

export async function createEnvioCampaign(input: { name: string; description?: string | undefined }): Promise<EnvioCampaign> {
  const supabaseAdmin = await admin();
  const baseSlug = slugify(input.name) || `campanha-${Date.now()}`;
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { data: existing } = await ((supabaseAdmin.from("envio_campaigns" as any) as any) as any).select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }
  const { data, error } = await (supabaseAdmin
    .from("envio_campaigns" as any) as any)
    .insert({ name: input.name, slug, description: input.description ?? null } as never)
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
    facebook_pixel_id?: string | undefined;
    auto_spawn_enabled?: boolean | undefined;
    spawn_margin?: number | undefined;
    group_template?: GroupTemplate | undefined;
  },
): Promise<EnvioCampaign> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin
    .from("envio_campaigns" as any) as any)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioCampaign;
}

export async function deleteEnvioCampaign(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const { error } = await ((supabaseAdmin.from("envio_campaigns" as any) as any) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true };
}

export type CampaignGroupLink = { group_id: string; weight_percent: number | null };

export async function getCampaignGroupLinks(campaignId: string): Promise<(CampaignGroupLink & { id: string; sort_order: number })[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin
    .from("envio_campaign_groups" as any) as any)
    .select("id, group_id, weight_percent, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

/** Substitui o conjunto de grupos vinculados por completo (delete-then-reinsert), preservando os
 *  pesos informados — mesmo padrão do CampaignDetailDialog original. */
export async function setCampaignGroupLinks(campaignId: string, links: CampaignGroupLink[]): Promise<void> {
  const supabaseAdmin = await admin();
  await ((supabaseAdmin.from("envio_campaign_groups" as any) as any) as any).delete().eq("campaign_id", campaignId);
  if (links.length === 0) return;
  await ((supabaseAdmin.from("envio_campaign_groups" as any) as any) as any).insert(
    links.map((l, i) => ({ campaign_id: campaignId, group_id: l.group_id, weight_percent: l.weight_percent, sort_order: i })) as never,
  );
}

export async function updateCampaignGroupWeight(campaignId: string, groupId: string, weightPercent: number | null): Promise<void> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin
    .from("envio_campaign_groups" as any) as any)
    .update({ weight_percent: weightPercent } as never)
    .eq("campaign_id", campaignId)
    .eq("group_id", groupId);
}

export function campaignPublicUrl(slug: string): string {
  return `https://clever-ship-analyzer.lovable.app/fluxo/${slug}`;
}

/** Porta de fe-spawn-group: cria um clone do grupo-molde da campanha. Debounce de 2min via
 *  last_spawn_at (escrito ANTES de chamar a UazAPI, pra fechar a janela de corrida entre cliques
 *  concorrentes que disparariam o spawn ao mesmo tempo). */
export async function spawnGroupForCampaign(campaignId: string): Promise<{ skipped?: "debounce"; groupId?: string }> {
  const supabaseAdmin = await admin();
  const { data: campaign } = await ((supabaseAdmin.from("envio_campaigns" as any) as any) as any).select("*").eq("id", campaignId).maybeSingle();
  const c = campaign as EnvioCampaign | null;
  if (!c) throw new Error("Campanha não encontrada");
  if (!c.auto_spawn_enabled) throw new Error("Auto-clonagem desativada nessa campanha");

  if (c.last_spawn_at && Date.now() - new Date(c.last_spawn_at).getTime() < 2 * 60_000) {
    return { skipped: "debounce" };
  }
  await ((supabaseAdmin.from("envio_campaigns" as any) as any) as any).update({ last_spawn_at: new Date().toISOString() } as never).eq("id", campaignId);

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
      const raw = info?.inviteLink ?? info?.invite_link;
      if (raw) inviteLink = raw.startsWith("http") ? raw : `https://chat.whatsapp.com/${raw}`;
    } catch (error) {
      console.error("spawnGroupForCampaign: falha ao buscar invite link", error);
    }
  }

  const { data: newGroup, error } = await (supabaseAdmin
    .from("envio_groups" as any) as any)
    .insert({
      group_jid: fromGroupJid(groupJid),
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
    .from("envio_campaign_groups" as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  await (supabaseAdmin
    .from("envio_campaign_groups" as any) as any)
    .insert({ campaign_id: campaignId, group_id: groupId, sort_order: count ?? 0 } as never);

  return { groupId };
}
