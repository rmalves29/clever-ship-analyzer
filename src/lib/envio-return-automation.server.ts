import { loadUazapiCreds, sendText } from "./envio-uazapi.server";
import { fillEnvioTemplateVars, type EnvioReturnAutomation } from "./envio-auto-messages.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function lookupCustomerName(phone: string): Promise<string> {
  try {
    const supabaseAdmin = await admin();
    const digits = phone.replace(/\D/g, "");
    const { data } = await supabaseAdmin
      .from("shopify_customers" as any)
      .select("first_name, last_name")
      .ilike("phone", `%${digits.slice(-8)}%`)
      .limit(1)
      .maybeSingle();
    const c = data as any;
    if (!c) return "cliente";
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || "cliente";
  } catch {
    return "cliente";
  }
}

/** Chamado pelo webhook da UazAPI em eventos de entrada/saída de grupo (evento "groups"). */
export async function triggerReturnAutomationOnGroupEvent(input: {
  groupId: string | null;
  groupJid: string;
  phone: string;
  eventType: "join" | "leave";
}): Promise<void> {
  if (input.phone.startsWith("unknown-")) return;
  const supabaseAdmin = await admin();

  let groupId = input.groupId;
  if (!groupId) {
    const { data } = await ((supabaseAdmin.from("envio_groups" as any) as any) as any).select("id").eq("group_jid", input.groupJid).maybeSingle();
    groupId = (data as any)?.id ?? null;
  }
  if (!groupId) return;

  if (input.eventType === "leave") {
    await handleLeave(groupId, input.groupJid, input.phone);
  } else {
    await handleJoin(groupId, input.groupJid, input.phone);
  }
}

async function handleLeave(groupId: string, groupJid: string, phone: string): Promise<void> {
  const supabaseAdmin = await admin();

  const { data: campaignLinks } = await ((supabaseAdmin.from("envio_campaign_groups" as any) as any) as any).select("campaign_id").eq("group_id", groupId);
  const campaignIds = (campaignLinks ?? []).map((r: any) => r.campaign_id as string);

  const { data: automations } = await ((supabaseAdmin.from("envio_return_automations" as any) as any) as any).select("*").eq("is_active", true);
  const applicable = ((automations ?? []) as EnvioReturnAutomation[]).filter(
    (a) => a.group_ids.includes(groupId) || a.campaign_ids.some((c) => campaignIds.includes(c)),
  );

  for (const automation of applicable) {
    const cooldownCutoff = new Date(Date.now() - automation.cooldown_hours * 3_600_000).toISOString();
    const { data: recent } = await (supabaseAdmin
      .from("envio_return_pending" as any) as any)
      .select("id, status")
      .eq("automation_id", automation.id)
      .eq("phone", phone)
      .eq("group_jid", groupJid)
      .gte("created_at", cooldownCutoff)
      .limit(1);
    if ((recent ?? []).length > 0) continue;

    const { data: active } = await (supabaseAdmin
      .from("envio_return_pending" as any) as any)
      .select("id")
      .eq("automation_id", automation.id)
      .eq("phone", phone)
      .eq("group_jid", groupJid)
      .in("status", ["scheduled", "invited"])
      .limit(1);
    if ((active ?? []).length > 0) continue;

    const inviteSendAt = new Date(Date.now() + automation.delay_minutes * 60_000);
    const expiresAt = new Date(inviteSendAt.getTime() + automation.validity_days * 86_400_000);

    await ((supabaseAdmin.from("envio_return_pending" as any) as any) as any).insert({
      automation_id: automation.id,
      group_id: groupId,
      group_jid: groupJid,
      phone,
      status: "scheduled",
      invite_send_at: inviteSendAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    } as never);
  }
}

async function handleJoin(groupId: string, groupJid: string, phone: string): Promise<void> {
  const supabaseAdmin = await admin();
  const { data: invited } = await (supabaseAdmin
    .from("envio_return_pending" as any) as any)
    .select("*")
    .eq("phone", phone)
    .eq("group_jid", groupJid)
    .eq("status", "invited")
    .gt("expires_at", new Date().toISOString());

  for (const pending of (invited ?? []) as any[]) {
    const { data: automation } = await (supabaseAdmin
      .from("envio_return_automations" as any) as any)
      .select("*")
      .eq("id", pending.automation_id)
      .maybeSingle();
    const a = automation as EnvioReturnAutomation | null;
    if (!a) continue;

    const { data: group } = await ((supabaseAdmin.from("envio_groups" as any) as any) as any).select("group_name").eq("id", groupId).maybeSingle();
    const name = await lookupCustomerName(phone);
    const text = fillEnvioTemplateVars(a.reward_message, { nome: name, cupom: a.coupon_code, grupo: (group as any)?.group_name ?? "" });

    try {
      const creds = await loadUazapiCreds();
      if (!creds) throw new Error("UazAPI não configurada");
      await sendText(creds, phone, text);
      await (supabaseAdmin
        .from("envio_return_pending" as any) as any)
        .update({ status: "rewarded", reward_sent_at: new Date().toISOString() } as never)
        .eq("id", pending.id);
    } catch (error) {
      await (supabaseAdmin
        .from("envio_return_pending" as any) as any)
        .update({ status: "failed", error_message: String(error) } as never)
        .eq("id", pending.id);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const BATCH = 12;
const RATE_LIMIT_MS = 5_000;

/** Cron (1x/min): expira pendências vencidas e dispara convites de retorno já na hora, respeitando
 *  1 msg/5s (mesmo ritmo do fe-return-automation-dispatcher original). */
export async function dispatchDueReturnInvites(): Promise<{ expired: number; dispatched: number; failed: number }> {
  const supabaseAdmin = await admin();

  const { data: expiredRows } = await (supabaseAdmin
    .from("envio_return_pending" as any) as any)
    .update({ status: "expired" } as never)
    .in("status", ["scheduled", "invited"])
    .lt("expires_at", new Date().toISOString())
    .select("id");
  const expired = (expiredRows ?? []).length;

  const { data: due } = await (supabaseAdmin
    .from("envio_return_pending" as any) as any)
    .select("*")
    .eq("status", "scheduled")
    .lte("invite_send_at", new Date().toISOString())
    .limit(BATCH);

  let dispatched = 0;
  let failed = 0;

  for (const pending of (due ?? []) as any[]) {
    if (dispatched + failed > 0) await sleep(RATE_LIMIT_MS);

    const { data: automation } = await (supabaseAdmin
      .from("envio_return_automations" as any) as any)
      .select("*")
      .eq("id", pending.automation_id)
      .maybeSingle();
    const a = automation as EnvioReturnAutomation | null;
    if (!a || !a.is_active) {
      await ((supabaseAdmin.from("envio_return_pending" as any) as any) as any).update({ status: "expired", error_message: "Automação inativa" } as never).eq("id", pending.id);
      continue;
    }

    const { data: group } = await ((supabaseAdmin.from("envio_groups" as any) as any) as any).select("group_name, invite_link").eq("id", pending.group_id).maybeSingle();
    const g = group as any;
    const name = await lookupCustomerName(pending.phone);
    const text = fillEnvioTemplateVars(a.invite_message, { nome: name, grupo: g?.group_name ?? "", link_grupo: g?.invite_link ?? "" });

    try {
      const creds = await loadUazapiCreds();
      if (!creds) throw new Error("UazAPI não configurada");
      await sendText(creds, pending.phone, text);
      await (supabaseAdmin
        .from("envio_return_pending" as any) as any)
        .update({ status: "invited", invite_sent_at: new Date().toISOString() } as never)
        .eq("id", pending.id);
      dispatched++;
    } catch (error) {
      await (supabaseAdmin
        .from("envio_return_pending" as any) as any)
        .update({ status: "failed", error_message: String(error) } as never)
        .eq("id", pending.id);
      failed++;
    }
  }

  return { expired, dispatched, failed };
}
