/** Cliente HTTP fino pra UazAPI GO — porta de `_shared/uazapi-api.ts` do live-launchpad-79,
 *  documentado em "UazAPI GO.md" no vault. Só a parte usada pelo módulo Fluxo de Envio. */

export type UazapiCreds = { url: string; token: string; adminToken: string | null };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadUazapiCreds(): Promise<UazapiCreds | null> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("store_settings" as any)
    .select("uazapi_url, uazapi_token, uazapi_admin_token, uazapi_is_active")
    .limit(1)
    .maybeSingle();
  const row = data as any;
  if (!row?.uazapi_url || !row?.uazapi_token) return null;
  return { url: row.uazapi_url, token: row.uazapi_token, adminToken: row.uazapi_admin_token ?? null };
}

/** `envio_groups.group_jid` guarda o formato "<id>-group"; a UazAPI espera "<id>@g.us". */
export function toGroupJid(groupId: string): string {
  if (groupId.endsWith("@g.us")) return groupId;
  if (groupId.endsWith("-group")) return groupId.replace(/-group$/, "@g.us");
  if (/^\d+$/.test(groupId)) return groupId + "@g.us";
  return groupId;
}

export function fromGroupJid(waJid: string): string {
  if (waJid.endsWith("@g.us")) return waJid.replace(/@g\.us$/, "-group");
  return waJid;
}

async function uazapiFetch(
  creds: UazapiCreds,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; admin?: boolean; timeoutMs?: number } = { method: "GET" },
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${creds.url}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        ...(init.admin ? { admintoken: creds.adminToken ?? "" } : { token: creds.token }),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      console.error(`UazAPI ${path} -> ${res.status}:`, json);
      throw new Error(json?.error || json?.message || `UazAPI ${path} retornou ${res.status}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getInstanceStatus(creds: UazapiCreds): Promise<{ status: string; owner?: string; qrcode?: string; paircode?: string }> {
  const data = await uazapiFetch(creds, "/instance/status", { method: "GET", timeoutMs: 30_000 });
  const inst = data?.instance ?? data;
  return { status: inst?.status ?? "unknown", owner: inst?.owner, qrcode: inst?.qrcode, paircode: inst?.paircode };
}

export async function connectInstance(creds: UazapiCreds, phone?: string): Promise<{ qrcode?: string; paircode?: string; status?: string }> {
  const data = await uazapiFetch(creds, "/instance/connect", { method: "POST", body: phone ? { phone } : {}, timeoutMs: 30_000 });
  const inst = data?.instance ?? data;
  return { qrcode: inst?.qrcode, paircode: inst?.paircode, status: inst?.status };
}

export async function disconnectInstance(creds: UazapiCreds): Promise<void> {
  await uazapiFetch(creds, "/instance/disconnect", { method: "POST", body: {}, timeoutMs: 30_000 });
}

export async function setWebhook(creds: UazapiCreds, url: string): Promise<void> {
  await uazapiFetch(creds, "/webhook", {
    method: "POST",
    body: {
      url,
      enabled: true,
      events: ["messages", "messages_update", "connection", "presence", "groups"],
      addUrlEvents: false,
      addUrlTypesMessages: false,
    },
    timeoutMs: 30_000,
  });
}

export async function listGroupsRaw(creds: UazapiCreds): Promise<any[]> {
  const data = await uazapiFetch(creds, "/group/list", { method: "GET", timeoutMs: 30_000 });
  return Array.isArray(data) ? data : (data?.groups ?? data?.data ?? []);
}

export async function getGroupInfo(creds: UazapiCreds, groupJid: string, opts?: { getInviteLink?: boolean }): Promise<any> {
  return uazapiFetch(creds, "/group/info", {
    method: "POST",
    body: { groupjid: groupJid, ...(opts?.getInviteLink ? { getInviteLink: true } : {}) },
    timeoutMs: 30_000,
  });
}

export async function sendText(creds: UazapiCreds, groupJid: string, text: string): Promise<{ id?: string }> {
  const data = await uazapiFetch(creds, "/send/text", { method: "POST", body: { number: groupJid, text }, timeoutMs: 60_000 });
  return { id: data?.id ?? data?.messageid ?? data?.key?.id };
}

export type MediaType = "image" | "video" | "videoplay" | "document" | "audio" | "myaudio" | "ptt" | "ptv" | "sticker";

export async function sendMedia(
  creds: UazapiCreds,
  groupJid: string,
  type: MediaType,
  fileUrl: string,
  caption?: string,
): Promise<{ id?: string }> {
  const data = await uazapiFetch(creds, "/send/media", {
    method: "POST",
    body: { number: groupJid, type, file: fileUrl, ...(caption ? { text: caption } : {}) },
    timeoutMs: 90_000,
  });
  return { id: data?.id ?? data?.messageid ?? data?.key?.id };
}

/** Endpoint de criação de grupo não é documentado oficialmente — tenta 3 formatos conhecidos em
 *  sequência (mesma estratégia do fe-spawn-group original) e loga qual funcionou. */
export async function createGroup(
  creds: UazapiCreds,
  name: string,
  seedPhones: string[],
): Promise<{ groupJid: string; inviteLink?: string }> {
  const participantsPlain = seedPhones;
  const participantsObj = seedPhones.map((p) => ({ id: `${p}@s.whatsapp.net` }));

  const attempts: Array<{ path: string; body: unknown }> = [
    { path: "/group/create", body: { name, participants: participantsPlain } },
    { path: "/group/create", body: { name, participants: participantsObj } },
    { path: "/group/new", body: { name, participants: participantsPlain } },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const data = await uazapiFetch(creds, attempt.path, { method: "POST", body: attempt.body, timeoutMs: 30_000 });
      const groupJid = data?.JID ?? data?.jid ?? data?.groupjid ?? data?.id;
      if (groupJid) {
        console.log(`createGroup: sucesso via ${attempt.path}`, attempt.body);
        return { groupJid, inviteLink: data?.inviteLink ?? data?.invite_link };
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Falha ao criar grupo na UazAPI (todas as variantes falharam): ${String(lastError)}`);
}

/** Melhor esforço — erros são engolidos, igual ao original (não deve travar o fluxo de spawn). */
export async function applyGroupSettings(
  creds: UazapiCreds,
  groupJid: string,
  opts: { description?: string | undefined; imageUrl?: string | undefined },
): Promise<void> {
  if (opts.description) {
    await uazapiFetch(creds, "/group/description", { method: "POST", body: { groupjid: groupJid, description: opts.description } }).catch(
      (e) => console.error("applyGroupSettings/description falhou:", e),
    );
  }
  if (opts.imageUrl) {
    await uazapiFetch(creds, "/group/image", { method: "POST", body: { groupjid: groupJid, image: opts.imageUrl } }).catch((e) =>
      console.error("applyGroupSettings/image falhou:", e),
    );
  }
  await uazapiFetch(creds, "/group/settings", { method: "POST", body: { groupjid: groupJid, announce: true } }).catch((e) =>
    console.error("applyGroupSettings/settings falhou:", e),
  );
}
