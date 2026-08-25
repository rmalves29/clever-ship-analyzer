import {
  extractIncomingWhatsappText,
  isWhatsappOptOutMessage,
  normalizeWhatsappSuppressionPhone,
} from "./whatsapp-opt-out";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function registerWhatsappOptOutFromMessage(message: any): Promise<{
  optedOut: boolean;
  phone?: string;
}> {
  if (!isWhatsappOptOutMessage(message)) return { optedOut: false };

  const phone = normalizeWhatsappSuppressionPhone(message?.from);
  if (!phone) return { optedOut: false };

  const supabaseAdmin = await admin();
  const now = new Date().toISOString();
  const reason = extractIncomingWhatsappText(message).trim().slice(0, 160) || "opt-out";
  const { error } = await supabaseAdmin.from("whatsapp_suppressions").upsert(
    {
      phone,
      marketing_opt_out: true,
      opted_out_at: now,
      source: "meta_inbound",
      reason,
      updated_at: now,
    },
    { onConflict: "phone" },
  );
  if (error) throw new Error(`Erro ao registrar opt-out do WhatsApp: ${error.message}`);
  return { optedOut: true, phone };
}

export async function getSuppressedWhatsappPhones(phones: string[]): Promise<Set<string>> {
  const normalized = [...new Set(phones.map(normalizeWhatsappSuppressionPhone).filter((v): v is string => Boolean(v)))];
  if (normalized.length === 0) return new Set();

  const supabaseAdmin = await admin();
  const suppressed = new Set<string>();
  for (let i = 0; i < normalized.length; i += 500) {
    const chunk = normalized.slice(i, i + 500);
    const { data, error } = await supabaseAdmin
      .from("whatsapp_suppressions")
      .select("phone")
      .eq("marketing_opt_out", true)
      .in("phone", chunk);
    if (error) throw new Error(`Erro ao consultar supressões do WhatsApp: ${error.message}`);
    for (const row of data ?? []) if (row?.phone) suppressed.add(String(row.phone));
  }
  return suppressed;
}

export async function isWhatsappMarketingSuppressed(phone: string | null | undefined): Promise<boolean> {
  const normalized = normalizeWhatsappSuppressionPhone(phone);
  if (!normalized) return false;
  const suppressed = await getSuppressedWhatsappPhones([normalized]);
  return suppressed.has(normalized);
}
