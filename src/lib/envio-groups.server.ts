import { loadUazapiCreds, listGroupsRaw, getGroupInfo, getGroupInviteInfo, getInstanceStatus, toGroupJid } from "./envio-uazapi.server";
import {
  canonicalWhatsappGroupJid,
  currentWhatsappGroupSnapshot,
  whatsappGroupSourceJid,
  whatsappParticipantIsAdmin,
  whatsappParticipantPhone,
} from "./envio-group-sync";

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

/** Banco do próprio clever-ship-analyzer — só pra config local (credenciais UazAPI), que não
 *  migrou pro live-launchpad. */
async function localAdmin() {
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
  const tenant = await tenantId();
  const { data, error } = await ((supabaseAdmin.from("fe_groups" as any) as any) as any)
    .select("*")
    .eq("tenant_id", tenant)
    .order("group_name", { ascending: true });
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

export type EnvioGroupSyncResult = {
  synced: number;
  total_found: number;
  admin_count: number;
  names_updated: number;
  duplicate_records_updated: number;
  detail_failures: number;
  failed: number;
  /** Ex.: número conectado não identificado (sem ele nenhum grupo é marcado como admin). */
  warning?: string;
};

/** Sinais de "sou admin" que a própria listagem da UazAPI traz — mesmos do fe-list-groups original. */
function adminHintFromListRow(row: any, connectedPhone: string | null): boolean {
  if (!row) return false;
  if (row.wa_isAdmin === true || row.iAmAdmin === true || row.isAdmin === true || row.imAdmin === true || row.owner_is_me === true) return true;
  if (!connectedPhone) return false;
  const owners = [row.OwnerPN, row.ownerPN, row.owner, row.Owner, row.OwnerJID]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.split("@")[0]!);
  return owners.some((owner) => phonesMatch(owner, connectedPhone));
}

export async function syncEnvioGroupsFromWhatsapp(): Promise<EnvioGroupSyncResult> {
  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");

  // A UazAPI mantém cache da lista e dos detalhes. Forçar ambos é essencial para refletir
  // renomeações feitas diretamente no WhatsApp.
  const raw = await listGroupsRaw(creds, { force: true });
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const localSupabaseAdmin = await localAdmin();
  const { data: settingsRow } = await localSupabaseAdmin.from("store_settings" as any).select("uazapi_connected_phone").limit(1).maybeSingle();
  let connectedPhone = ((settingsRow as any)?.uazapi_connected_phone as string | null) || null;
  let warning: string | undefined;
  if (!connectedPhone) {
    // O telefone só era preenchido quando alguém abria a aba Conexão: busca na instância (como o original).
    try {
      const status = await getInstanceStatus(creds);
      const owner = (status.owner ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
      if (owner) {
        connectedPhone = owner;
        await localSupabaseAdmin.from("store_settings" as any).update({ uazapi_connected_phone: owner } as never).not("id", "is", null);
      }
    } catch (error) {
      console.error("syncEnvioGroupsFromWhatsapp: não consegui ler o número conectado", error);
    }
    if (!connectedPhone) warning = "Número conectado não identificado — nenhum grupo foi marcado como admin.";
  }

  const { data: existingData, error: existingError } = await (supabaseAdmin
    .from("fe_groups" as any) as any)
    .select("id, group_jid, group_name, invite_link, is_admin")
    .eq("tenant_id", tenant);
  if (existingError) throw new Error(`Falha ao carregar os grupos salvos: ${existingError.message}`);

  const existingGroups = (existingData ?? []) as Array<Pick<EnvioGroup, "id" | "group_jid" | "group_name" | "invite_link" | "is_admin">>;
  const existingByJid = new Map<string, typeof existingGroups>();
  for (const group of existingGroups) {
    const key = canonicalWhatsappGroupJid(group.group_jid);
    if (!key) continue;
    existingByJid.set(key, [...(existingByJid.get(key) ?? []), group]);
  }

  const enriched = await parallelLimit(raw, 10, async (g: any) => {
    const groupJid = whatsappGroupSourceJid(g);
    if (!groupJid) return null;
    let snapshot = currentWhatsappGroupSnapshot(g, null);
    let isAdmin = adminHintFromListRow(g, connectedPhone);
    let detailFailed = false;

    try {
      // Buscar primeiro sem link: pedir convite pode falhar para grupos onde a instância não é
      // administradora, mas o nome atual ainda deve ser sincronizado.
      const info = await getGroupInfo(creds, groupJid, { force: true });
      snapshot = currentWhatsappGroupSnapshot(g, info);
      if (connectedPhone) {
        const me = snapshot.participants.find((participant) =>
          phonesMatch(whatsappParticipantPhone(participant), connectedPhone),
        );
        isAdmin = isAdmin || Boolean(me && whatsappParticipantIsAdmin(me));
      }

      const wasAlreadyAdmin = (existingByJid.get(groupJid) ?? []).some((group) => group.is_admin);
      if (isAdmin || wasAlreadyAdmin) {
        try {
          const infoWithInvite = await getGroupInfo(creds, groupJid, { getInviteLink: true, force: true });
          snapshot = currentWhatsappGroupSnapshot(snapshot, infoWithInvite);
        } catch (error) {
          console.error(`syncEnvioGroupsFromWhatsapp: falha ao buscar convite de ${groupJid}`, error);
        }
      }

      const savedInvite = (existingByJid.get(groupJid) ?? [])
        .map((group) => group.invite_link)
        .find((link): link is string => Boolean(link));
      const inviteLink = snapshot.inviteLink ?? savedInvite;
      if (inviteLink) {
        try {
          const inviteInfo = await getGroupInviteInfo(creds, inviteLink);
          if (whatsappGroupSourceJid(inviteInfo) === groupJid) {
            snapshot = currentWhatsappGroupSnapshot(snapshot, inviteInfo);
          }
        } catch (error) {
          console.error(`syncEnvioGroupsFromWhatsapp: falha ao resolver convite de ${groupJid}`, error);
        }
      }
    } catch (error) {
      detailFailed = true;
      console.error(`syncEnvioGroupsFromWhatsapp: falha ao buscar info de ${groupJid}`, error);
    }

    return {
      group_jid: groupJid,
      group_name: snapshot.name,
      participant_count: snapshot.participantCount,
      is_admin: isAdmin,
      invite_link: snapshot.inviteLink,
      detail_failed: detailFailed,
    };
  });

  const validGroups = enriched.filter((row): row is NonNullable<typeof row> => Boolean(row));
  let adminCount = 0;
  let synced = 0;
  let namesUpdated = 0;
  let duplicateRecordsUpdated = 0;
  let failed = raw.length - validGroups.length;

  for (const row of validGroups) {
    if (row.is_admin) adminCount++;
    const matches = existingByJid.get(row.group_jid) ?? [];
    const targets = matches.length > 0 ? matches : [null];
    let rowSucceeded = false;

    if (matches.length > 1) duplicateRecordsUpdated += matches.length - 1;
    for (const existing of targets) {
      const payload = {
        tenant_id: tenant,
        group_jid: existing?.group_jid ?? row.group_jid,
        group_name: row.group_name,
        participant_count: row.participant_count,
        // Se a consulta de detalhes falhou, a decisão de admin não é confiável: mantém o que já estava salvo
        // (antes uma falha momentânea tirava o grupo de "onde sou admin" e ele sumia da lista).
        is_admin: row.detail_failed && existing ? existing.is_admin : connectedPhone ? row.is_admin : (existing?.is_admin ?? row.is_admin),
        // Preserva o invite_link já salvo se a busca fresca não trouxe um novo.
        invite_link: row.invite_link ?? existing?.invite_link ?? null,
        updated_at: new Date().toISOString(),
      };
      const query = existing
        ? (supabaseAdmin.from("fe_groups" as any) as any).update(payload as never).eq("tenant_id", tenant).eq("id", existing.id)
        : (supabaseAdmin.from("fe_groups" as any) as any).insert(payload as never);
      const { error } = await query;
      if (error) {
        failed++;
        console.error(`syncEnvioGroupsFromWhatsapp: falha ao salvar ${row.group_jid}`, error);
      } else {
        rowSucceeded = true;
        if (existing && existing.group_name !== row.group_name) namesUpdated++;
      }
    }
    if (rowSucceeded) synced++;
  }

  if (validGroups.length > 0 && synced === 0) {
    throw new Error("O WhatsApp respondeu, mas nenhum grupo pôde ser salvo. Verifique a conexão com o Live Launchpad.");
  }

  return {
    synced,
    total_found: raw.length,
    admin_count: adminCount,
    names_updated: namesUpdated,
    duplicate_records_updated: duplicateRecordsUpdated,
    detail_failures: validGroups.filter((row) => row.detail_failed).length,
    failed,
    ...(warning ? { warning } : {}),
  };
}

export type EnvioGroupLinkRefreshResult = { checked: number; updated: number; failed: number };

/** Atualiza só o link de convite dos grupos onde somos admin (sem re-sincronizar nomes e participantes) —
 *  mesmo comportamento do botão "Atualizar links" / fe-refresh-group-links do painel original. */
export async function refreshEnvioGroupLinks(): Promise<EnvioGroupLinkRefreshResult> {
  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const { data, error } = await (supabaseAdmin.from("fe_groups" as any) as any)
    .select("id, group_jid, invite_link")
    .eq("tenant_id", tenant)
    .eq("is_admin", true);
  if (error) throw new Error(error.message);
  const groups = (data ?? []) as Array<{ id: string; group_jid: string; invite_link: string | null }>;

  let updated = 0;
  let failed = 0;
  await parallelLimit(groups, 10, async (group) => {
    try {
      const info = await getGroupInfo(creds, toGroupJid(group.group_jid), { getInviteLink: true, force: true });
      const grp = info?.group ?? info;
      const raw: string | undefined = grp?.inviteLink ?? grp?.invite_link ?? info?.inviteLink ?? info?.invite_link;
      if (!raw) {
        failed++;
        return;
      }
      const link = raw.startsWith("http") ? raw : `https://chat.whatsapp.com/${raw}`;
      if (link !== group.invite_link) {
        const { error: updateError } = await (supabaseAdmin.from("fe_groups" as any) as any)
          .update({ invite_link: link, updated_at: new Date().toISOString() } as never)
          .eq("id", group.id)
          .eq("tenant_id", tenant);
        if (updateError) failed++;
        else updated++;
      }
    } catch (e) {
      failed++;
      console.error(`refreshEnvioGroupLinks: falha em ${group.group_jid}`, e);
    }
  });
  return { checked: groups.length, updated, failed };
}

export async function addEnvioGroupManual(input: { groupJid: string; groupName: string; inviteLink?: string | undefined }): Promise<EnvioGroup> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const normalizedJid = canonicalWhatsappGroupJid(input.groupJid);
  if (!normalizedJid) throw new Error("JID do grupo inválido");
  const { data, error } = await (supabaseAdmin
    .from("fe_groups" as any) as any)
    .insert({ tenant_id: tenant, group_jid: normalizedJid, group_name: input.groupName, invite_link: input.inviteLink || null } as never)
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
  const tenant = await tenantId();
  const next: Record<string, unknown> = { ...patch };
  if (patch.invite_link !== undefined) next["invite_link"] = patch.invite_link.trim() || null;
  const { data, error } = await (supabaseAdmin
    .from("fe_groups" as any) as any)
    .update({ ...next, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("tenant_id", tenant)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioGroup;
}

export async function deleteEnvioGroup(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const { error } = await ((supabaseAdmin.from("fe_groups" as any) as any) as any).delete().eq("id", id).eq("tenant_id", tenant);
  if (error) throw new Error(error.message);
  return { success: true };
}
