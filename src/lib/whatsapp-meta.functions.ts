import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GOALS, SEGMENT_TYPES, type SegmentType } from "./crm-mock";

const DAY_MS = 86_400_000;

/** Converte telefone BR (com ou sem +55/DDI) pra E.164, exigido pela API do WhatsApp. */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

/** IDs de clientes que batem com o segmento — calculado sobre o histórico completo, não o período do dashboard. */
async function getSegmentCustomerIds(segmentType: SegmentType): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (segmentType === "envio_atrasado") {
    const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const { data: fulfillments } = await supabaseAdmin
      .from("shopify_fulfillments")
      .select("updated_at, shopify_orders!inner(customer_id, processed_at)")
      .not("tracking_number", "is", null)
      .gte("updated_at", cutoff);

    const ids = new Set<string>();
    for (const f of fulfillments ?? []) {
      const order = f.shopify_orders as unknown as { customer_id: string | null; processed_at: string | null } | null;
      if (!order?.customer_id || !order?.processed_at || !f.updated_at) continue;
      const hours = (new Date(f.updated_at).getTime() - new Date(order.processed_at).getTime()) / 3_600_000;
      if (hours / 24 > GOALS.tempoMedioEnvio.regular) ids.add(order.customer_id);
    }
    return Array.from(ids);
  }

  const { data: orders } = await supabaseAdmin
    .from("shopify_orders")
    .select("customer_id, total_price, processed_at, created_at")
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const byCustomer = new Map<string, { dates: number[]; total: number }>();
  for (const o of orders ?? []) {
    if (!o.customer_id) continue;
    const at = new Date(o.processed_at ?? o.created_at).getTime();
    const agg = byCustomer.get(o.customer_id) ?? { dates: [], total: 0 };
    agg.dates.push(at);
    agg.total += Number(o.total_price ?? 0);
    byCustomer.set(o.customer_id, agg);
  }

  const now = Date.now();
  const ids: string[] = [];
  for (const [customerId, agg] of byCustomer) {
    const count = agg.dates.length;
    const avgTicket = agg.total / count;
    const daysSinceFirst = (now - Math.min(...agg.dates)) / DAY_MS;

    let match = false;
    if (segmentType === "ticket_alto") match = avgTicket > GOALS.ticketMedio.regular;
    else if (segmentType === "sem_recompra") match = count === 1 && daysSinceFirst >= 14;
    else if (segmentType === "recompra_30d") match = count === 1 && daysSinceFirst <= 30;
    else if (segmentType === "recompra_60d") match = count === 1 && daysSinceFirst > 30 && daysSinceFirst <= 60;

    if (match) ids.push(customerId);
  }
  return ids;
}

async function getCustomersWithPhone(ids: string[]) {
  if (ids.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("shopify_customers").select("id, phone, first_name").in("id", ids);
  return (data ?? []).filter((c) => Boolean(c.phone)) as { id: string; phone: string; first_name: string | null }[];
}

async function sendTemplateMessage(params: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
}) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${params.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.to,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.templateLanguage },
        ...(params.bodyParams.length
          ? { components: [{ type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text })) }] }
          : {}),
      },
    }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  return { ok: true as const };
}

/** Status pra tela de Configurações — nunca devolve o token de acesso. */
export const getWhatsappMetaStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("whatsapp_meta_access_token, whatsapp_meta_phone_number_id, whatsapp_meta_template_name, whatsapp_meta_template_language")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    hasAccessToken: Boolean(data?.whatsapp_meta_access_token),
    hasPhoneNumberId: Boolean(data?.whatsapp_meta_phone_number_id),
    templateName: data?.whatsapp_meta_template_name ?? "",
    templateLanguage: data?.whatsapp_meta_template_language ?? "pt_BR",
  };
});

const saveSchema = z.object({
  accessToken: z.string().min(20).optional(),
  phoneNumberId: z.string().min(5).optional(),
  templateName: z.string().min(1).optional(),
  templateLanguage: z.string().min(2).optional(),
});

/** Salva as credenciais da API oficial da Meta — token nunca é devolvido ao cliente depois de salvo. */
export const saveWhatsappMetaSettings = createServerFn({ method: "POST" })
  .validator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("store_settings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return { success: false as const, error: "Configure primeiro a conexão com o Shopify em Configurações." };
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.accessToken) patch["whatsapp_meta_access_token"] = data.accessToken.trim();
    if (data.phoneNumberId) patch["whatsapp_meta_phone_number_id"] = data.phoneNumberId.trim();
    if (data.templateName) patch["whatsapp_meta_template_name"] = data.templateName.trim();
    if (data.templateLanguage) patch["whatsapp_meta_template_language"] = data.templateLanguage.trim();

    const { error } = await supabaseAdmin.from("store_settings").update(patch as never).eq("id", existing.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

const segmentTypeSchema = z.enum(SEGMENT_TYPES);

/** Quantos clientes do segmento têm telefone cadastrado — pra mostrar antes de disparar de verdade. */
export const previewSegment = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ segmentType: segmentTypeSchema }).parse(data))
  .handler(async ({ data }) => {
    const ids = await getSegmentCustomerIds(data.segmentType);
    const customers = await getCustomersWithPhone(ids);
    return { totalClientes: ids.length, comTelefone: customers.length };
  });

const sendCampaignSchema = z.object({
  segmentType: segmentTypeSchema,
  bodyParams: z.array(z.string()).max(5).default([]),
});

/** Botão "Aplicar ação": manda o template aprovado da Meta pra todo mundo que bate com o segmento. */
export const sendSegmentCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => sendCampaignSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("whatsapp_meta_access_token, whatsapp_meta_phone_number_id, whatsapp_meta_template_name, whatsapp_meta_template_language")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings?.whatsapp_meta_access_token || !settings?.whatsapp_meta_phone_number_id || !settings?.whatsapp_meta_template_name) {
      return {
        success: false as const,
        error: "Configure o token de acesso, o Phone Number ID e o nome do template do WhatsApp (Meta) em Configurações.",
      };
    }

    const ids = await getSegmentCustomerIds(data.segmentType);
    const customers = await getCustomersWithPhone(ids);

    let sent = 0;
    let failed = 0;
    const sampleErrors: string[] = [];
    for (const c of customers) {
      const to = toE164(c.phone);
      if (!to) {
        failed++;
        continue;
      }
      const result = await sendTemplateMessage({
        accessToken: settings.whatsapp_meta_access_token,
        phoneNumberId: settings.whatsapp_meta_phone_number_id,
        to,
        templateName: settings.whatsapp_meta_template_name,
        templateLanguage: settings.whatsapp_meta_template_language ?? "pt_BR",
        bodyParams: data.bodyParams,
      });
      if (result.ok) sent++;
      else {
        failed++;
        if (sampleErrors.length < 3) sampleErrors.push(result.error);
      }
    }

    return { success: true as const, total: customers.length, sent, failed, sampleErrors };
  });
