/** exactOptionalPropertyTypes exige `| undefined` explícito nas props opcionais — Partial<T> comum
 *  não adiciona isso, então um patch vindo de zod .partial() (que inclui undefined) não bate com
 *  o Partial<T> estrutural. Esse helper resolve isso pros updates abaixo. */
type LoosePartial<T> = { [K in keyof T]?: T[K] | undefined };

/** As automações de entrada (boas-vindas) e de retorno ficam em fe_auto_messages / fe_return_automations do Cartzy
 *  (live-launchpad): é lá que roda o motor — o webhook da instância da UazAPI aponta para o Cartzy, que envia as
 *  boas-vindas, agenda o convite de retorno e dá a recompensa. O CRM é a tela dessas mesmas tabelas. */
async function admin(): Promise<any> {
  const { getLiveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
  return getLiveLaunchpadAdmin();
}

async function tenantId() {
  const { MANIA_DE_MULHER_TENANT_ID } = await import("@/integrations/supabase/live-launchpad-client.server");
  return MANIA_DE_MULHER_TENANT_ID;
}

/** Aceita as duas sintaxes de variável: {{var}} (CRM) e {var} (Cartzy: {nome}, {grupo}, {link_grupo}, {cupom}). */
export function fillEnvioTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, double: string | undefined, single: string | undefined) => vars[(double ?? single) as string] ?? "");
}

export type EnvioAutoMessage = {
  id: string;
  group_id: string | null;
  campaign_id: string | null;
  event_type: "join" | "leave";
  content_type: "text" | "image";
  content_text: string | null;
  media_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listEnvioAutoMessages(): Promise<EnvioAutoMessage[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("fe_auto_messages")
    .select("*")
    .eq("tenant_id", await tenantId())
    .eq("event_type", "join")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvioAutoMessage[];
}

export async function createEnvioAutoMessage(input: Omit<EnvioAutoMessage, "id" | "created_at" | "updated_at">): Promise<EnvioAutoMessage> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("fe_auto_messages")
    .insert({ ...input, tenant_id: await tenantId() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioAutoMessage;
}

export async function updateEnvioAutoMessage(id: string, patch: LoosePartial<EnvioAutoMessage>): Promise<EnvioAutoMessage> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("fe_auto_messages")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", await tenantId())
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioAutoMessage;
}

export async function deleteEnvioAutoMessage(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin.from("fe_auto_messages").delete().eq("id", id).eq("tenant_id", await tenantId());
  if (error) throw new Error(error.message);
  return { success: true };
}

export type EnvioReturnAutomation = {
  id: string;
  name: string;
  group_ids: string[];
  campaign_ids: string[];
  delay_minutes: number;
  invite_message: string;
  reward_message: string;
  coupon_code: string;
  validity_days: number;
  cooldown_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listEnvioReturnAutomations(): Promise<EnvioReturnAutomation[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("fe_return_automations")
    .select("*")
    .eq("tenant_id", await tenantId())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvioReturnAutomation[];
}

export async function createEnvioReturnAutomation(
  input: Omit<EnvioReturnAutomation, "id" | "created_at" | "updated_at">,
): Promise<EnvioReturnAutomation> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("fe_return_automations")
    .insert({ ...input, tenant_id: await tenantId() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioReturnAutomation;
}

export async function updateEnvioReturnAutomation(id: string, patch: LoosePartial<EnvioReturnAutomation>): Promise<EnvioReturnAutomation> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("fe_return_automations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", await tenantId())
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioReturnAutomation;
}

/** Apagar a automação também cancela os convites ainda em aberto, em vez de deixá-los órfãos. */
export async function deleteEnvioReturnAutomation(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  await supabaseAdmin
    .from("fe_return_pending")
    .update({ status: "cancelled", error_message: "Automação apagada" })
    .eq("automation_id", id)
    .eq("tenant_id", tenant)
    .in("status", ["scheduled", "invited"]);
  const { error } = await supabaseAdmin.from("fe_return_automations").delete().eq("id", id).eq("tenant_id", tenant);
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getEnvioReturnStats(): Promise<{ leftTotal: number; rewardedTotal: number }> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const { count: leftTotal } = await supabaseAdmin.from("fe_return_pending").select("id", { count: "exact", head: true }).eq("tenant_id", tenant);
  const { count: rewardedTotal } = await supabaseAdmin
    .from("fe_return_pending")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .eq("status", "rewarded");
  return { leftTotal: leftTotal ?? 0, rewardedTotal: rewardedTotal ?? 0 };
}

/** Opções leves para os formulários de automação (sem as estatísticas pesadas da lista de campanhas). */
export async function getEnvioAutomationOptions(): Promise<{ groups: { id: string; group_name: string }[]; campaigns: { id: string; name: string }[] }> {
  const supabaseAdmin = await admin();
  const tenant = await tenantId();
  const [groups, campaigns] = await Promise.all([
    supabaseAdmin.from("fe_groups").select("id, group_name").eq("tenant_id", tenant).eq("is_admin", true).eq("is_active", true).order("group_name"),
    supabaseAdmin.from("fe_campaigns").select("id, name").eq("tenant_id", tenant).order("name"),
  ]);
  if (groups.error) throw new Error(groups.error.message);
  if (campaigns.error) throw new Error(campaigns.error.message);
  return { groups: (groups.data ?? []) as { id: string; group_name: string }[], campaigns: (campaigns.data ?? []) as { id: string; name: string }[] };
}
