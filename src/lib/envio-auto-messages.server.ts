/** exactOptionalPropertyTypes exige `| undefined` explícito nas props opcionais — Partial<T> comum
 *  não adiciona isso, então um patch vindo de zod .partial() (que inclui undefined) não bate com
 *  o Partial<T> estrutural. Esse helper resolve isso pros updates abaixo. */
type LoosePartial<T> = { [K in keyof T]?: T[K] | undefined };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Sintaxe única de variável em todo o módulo: {{var}} (o original usava {{phone}}/{{group}} nas
 *  mensagens de entrada e {nome}/{cupom}/{grupo} no retorno — unificado aqui). */
export function fillEnvioTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
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
  const { data, error } = await ((supabaseAdmin.from("envio_auto_messages" as any) as any) as any).select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvioAutoMessage[];
}

export async function createEnvioAutoMessage(input: Omit<EnvioAutoMessage, "id" | "created_at" | "updated_at">): Promise<EnvioAutoMessage> {
  const supabaseAdmin = await admin();
  const { data, error } = await ((supabaseAdmin.from("envio_auto_messages" as any) as any) as any).insert(input as never).select("*").single();
  if (error) throw new Error(error.message);
  return data as EnvioAutoMessage;
}

export async function updateEnvioAutoMessage(id: string, patch: LoosePartial<EnvioAutoMessage>): Promise<EnvioAutoMessage> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin
    .from("envio_auto_messages" as any) as any)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioAutoMessage;
}

export async function deleteEnvioAutoMessage(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const { error } = await ((supabaseAdmin.from("envio_auto_messages" as any) as any) as any).delete().eq("id", id);
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
  const { data, error } = await ((supabaseAdmin.from("envio_return_automations" as any) as any) as any).select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvioReturnAutomation[];
}

export async function createEnvioReturnAutomation(
  input: Omit<EnvioReturnAutomation, "id" | "created_at" | "updated_at">,
): Promise<EnvioReturnAutomation> {
  const supabaseAdmin = await admin();
  const { data, error } = await ((supabaseAdmin.from("envio_return_automations" as any) as any) as any).insert(input as never).select("*").single();
  if (error) throw new Error(error.message);
  return data as EnvioReturnAutomation;
}

export async function updateEnvioReturnAutomation(id: string, patch: LoosePartial<EnvioReturnAutomation>): Promise<EnvioReturnAutomation> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin
    .from("envio_return_automations" as any) as any)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioReturnAutomation;
}

/** Correção deliberada em relação ao original: apagar a automação também expira as pendências
 *  ainda em aberto, em vez de deixá-las órfãs (o original nunca fazia isso — a pendência ficava
 *  presa pra sempre, silenciosamente, porque o dispatcher não encontra mais a automação). */
export async function deleteEnvioReturnAutomation(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin
    .from("envio_return_pending" as any) as any)
    .update({ status: "expired", error_message: "Automação apagada" } as never)
    .eq("automation_id", id)
    .in("status", ["scheduled", "invited"]);
  const { error } = await ((supabaseAdmin.from("envio_return_automations" as any) as any) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getEnvioReturnStats(): Promise<{ leftTotal: number; rewardedTotal: number }> {
  const supabaseAdmin = await admin();
  const { count: leftTotal } = await ((supabaseAdmin.from("envio_return_pending" as any) as any) as any).select("id", { count: "exact", head: true });
  const { count: rewardedTotal } = await (supabaseAdmin
    .from("envio_return_pending" as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "rewarded");
  return { leftTotal: leftTotal ?? 0, rewardedTotal: rewardedTotal ?? 0 };
}
