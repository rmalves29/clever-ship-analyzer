import { isSessionWindowOpen, sessionTextError } from "./whatsapp-session";
import { META_GRAPH_API_VERSION } from "./whatsapp-phone-registration";

export async function getOpenSessionPhones(phones: string[]): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const unique = [...new Set(phones)];
  const open = new Set<string>();
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabaseAdmin.from("whatsapp_inbox_threads")
      .select("phone, last_inbound_at").in("phone", unique.slice(i, i + 200));
    if (error) throw new Error("Não foi possível verificar as janelas de 24h. Tente novamente.");
    for (const row of data ?? []) if (isSessionWindowOpen(row.last_inbound_at)) open.add(row.phone);
  }
  return open;
}

/** Fails closed on missing/invalid timestamps and DB errors. Checked again by
 * the worker immediately before sending, including retries and scheduled jobs. */
export async function sendSessionCampaignText(input: {
  to: string; text: string; accessToken: string; phoneNumberId: string;
}) {
  const invalid = sessionTextError(input.text);
  if (invalid) return { ok: false as const, error: invalid, permanent: true };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("whatsapp_inbox_threads")
    .select("last_inbound_at").eq("phone", input.to).maybeSingle();
  if (error) return { ok: false as const, error: "Não foi possível verificar a janela de 24h." };
  if (!isSessionWindowOpen(data?.last_inbound_at)) {
    return { ok: false as const, error: "Janela de 24h encerrada ou sem mensagem recebida do cliente.", permanent: true };
  }
  const res = await fetch(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${input.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: input.to, type: "text", text: { body: input.text.trim(), preview_url: true } }),
  }).catch(() => null);
  if (!res) return { ok: false as const, error: "Falha de conexão com a Meta." };
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: `${json?.error?.code ?? res.status}: ${json?.error?.message ?? "Falha no envio pela Meta"}` };
  return { ok: true as const, waMessageId: json?.messages?.[0]?.id as string | undefined };
}
