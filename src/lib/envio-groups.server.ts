import { loadUazapiCreds, listGroupsRaw, getGroupInfo, toGroupJid, fromGroupJid } from "./envio-uazapi.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type EnvioGroup = {
  id: string;
  group_jid: string;
  group_name: string;
  invite_link: string | null;
  participant_count: number;
  max_participants: number;
  is_entry_open: boolean;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

export async function listEnvioGroups(): Promise<EnvioGroup[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await ((supabaseAdmin.from("envio_groups" as any) as any) as any).select("*").order("group_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvioGroup[];
}

/** Normalização de número BR pra comparar com o dono do grupo — 8º/9º dígito, DDI 55 opcional. */
function phonesMatch(a: string, b: string): boolean {
  const clean = (s: string) => s.replace(/\D/g, "");
  const na = clean(a);
  const nb = clean(b);
  if (na === nb) return true;
  const strip55 = (s: string) => (s.startsWith("55") ? s.slice(2) : s);
  const sa = strip55(na);
  const sb = strip55(nb);
  if (sa === sb) return true;
  const toggle9 = (s: string) => {
    if (s.length === 11) return s.slice(0, 2) + s.slice(3);
    if (s.length === 10) return s.slice(0, 2) + "9" + s.slice(2);
    return s;
  };
  if (toggle9(sa) === sb || sa === toggle9(sb)) return true;
  return na.endsWith(nb) || nb.endsWith(na);
}

async function parallelLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function syncEnvioGroupsFromWhatsapp(): Promise<{ synced: number; total_found: number; admin_count: number }> {
  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");

  const raw = await listGroupsRaw(creds);
  const supabaseAdmin = await admin();
  const { data: settingsRow } = await supabaseAdmin.from("store_settings" as any).select("uazapi_connected_phone").limit(1).maybeSingle();
  const connectedPhone = (settingsRow as any)?.uazapi_connected_phone as string | null;

  const enriched = await parallelLimit(raw, 10, async (g: any) => {
    const groupJid: string = g.JID ?? g.jid ?? g.groupjid ?? g.id;
    const name: string = g.Name ?? g.name ?? "Grupo sem nome";
    let participantCount: number = g.ParticipantsCount ?? g.participant_count ?? g.size ?? 0;
    let isAdmin = false;
    let inviteLink: string | null = null;

    try {
      const info = await getGroupInfo(creds, groupJid, { getInviteLink: true });
      const participants: any[] = info?.Participants ?? info?.participants ?? [];
      if (participants.length) participantCount = participants.length;
      if (connectedPhone) {
        const me = participants.find((p) => phonesMatch(p.PhoneNumber ?? p.phoneNumber ?? "", connectedPhone));
        isAdmin = Boolean(me?.IsAdmin || me?.IsSuperAdmin || me?.isAdmin || me?.isSuperAdmin);
      }
      inviteLink = info?.inviteLink ?? info?.invite_link ?? null;
    } catch (error) {
      console.error(`syncEnvioGroupsFromWhatsapp: falha ao buscar info de ${groupJid}`, error);
    }

    return {
      group_jid: fromGroupJid(groupJid),
      group_name: name,
      participant_count: participantCount,
      is_admin: isAdmin,
      invite_link: inviteLink,
    };
  });

  let adminCount = 0;
  for (const row of enriched) {
    if (row.is_admin) adminCount++;
    const { data: existing } = await (supabaseAdmin
      .from("envio_groups" as any) as any)
      .select("invite_link")
      .eq("group_jid", row.group_jid)
      .maybeSingle();

    await (supabaseAdmin
      .from("envio_groups" as any) as any)
      .upsert(
        {
          group_jid: row.group_jid,
          group_name: row.group_name,
          participant_count: row.participant_count,
          is_admin: row.is_admin,
          // Preserva o invite_link já salvo se a busca fresca não trouxe um novo (não sobrescreve
          // um link bom com uma falha de lookup).
          invite_link: row.invite_link ?? (existing as any)?.invite_link ?? null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "group_jid" },
      );
  }

  return { synced: enriched.length, total_found: raw.length, admin_count: adminCount };
}

export async function addEnvioGroupManual(input: { groupJid: string; groupName: string; inviteLink?: string | undefined }): Promise<EnvioGroup> {
  const supabaseAdmin = await admin();
  const normalizedJid = input.groupJid.endsWith("-group") ? input.groupJid : fromGroupJid(toGroupJid(input.groupJid));
  const { data, error } = await (supabaseAdmin
    .from("envio_groups" as any) as any)
    .insert({ group_jid: normalizedJid, group_name: input.groupName, invite_link: input.inviteLink || null } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioGroup;
}

export async function updateEnvioGroup(
  id: string,
  patch: {
    is_entry_open?: boolean | undefined;
    is_active?: boolean | undefined;
    invite_link?: string | undefined;
    group_name?: string | undefined;
    max_participants?: number | undefined;
  },
): Promise<EnvioGroup> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin
    .from("envio_groups" as any) as any)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioGroup;
}

export async function deleteEnvioGroup(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const { error } = await ((supabaseAdmin.from("envio_groups" as any) as any) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true };
}
