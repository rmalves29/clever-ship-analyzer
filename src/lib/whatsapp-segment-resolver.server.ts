import type { SegmentRules } from "./crm-segmentation-shared";
import { matchesAdvancedSegmentRules } from "./crm-product-segmentation";
import { summarizeWhatsappPresendAudience } from "./whatsapp-presend-audit";
import { parseWhatsappCampaignAudienceValue } from "./whatsapp-campaign-audience";

const CUSTOMER_BATCH_SIZE = 200;
const RECIPIENT_SAMPLE_SIZE = 20;

export function isCustomSegmentId(value: string | null | undefined): value is string {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  );
}

async function resolveCustomSegmentCustomerIds(segmentId: string): Promise<string[]> {
  const [{ supabaseAdmin }, { loadCRMSegmentationContext }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./crm-segmentation.server"),
  ]);

  const { data: segment, error } = await supabaseAdmin
    .from("crm_segments")
    .select("id, regras")
    .eq("id", segmentId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar o segmento do CRM: ${error.message}`);
  if (!segment) return [];

  const contexts = await loadCRMSegmentationContext();
  return contexts
    .filter((context) => matchesAdvancedSegmentRules(context, segment.regras as SegmentRules))
    .map((context) => context.customer.id);
}

async function loadAudienceCustomers(ids: string[]) {
  if (ids.length === 0) return [] as Array<{
    id: string;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: Array<{
    id: string;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }> = [];

  for (let start = 0; start < ids.length; start += CUSTOMER_BATCH_SIZE) {
    const batch = ids.slice(start, start + CUSTOMER_BATCH_SIZE);
    const { data, error } = await supabaseAdmin
      .from("shopify_customers")
      .select("id, phone, first_name, last_name, email")
      .in("id", batch);

    if (error) throw new Error(`Erro ao carregar destinatários do WhatsApp: ${error.message}`);
    rows.push(...((data ?? []) as typeof rows));
  }

  return rows;
}

/**
 * Fonte única do público usado por campanhas e automações.
 * Segmentos customizados usam exatamente o mesmo motor do CRM; públicos de campanhas usam os
 * clientes que efetivamente receberam aquela mensagem; os segmentos legados continuam delegando
 * para o resolver histórico enquanto são migrados.
 */
export async function resolveWhatsappSegmentCustomerIds(segmentType: string, segmentId?: string): Promise<string[]> {
  const campaignId = parseWhatsappCampaignAudienceValue(segmentType);
  if (campaignId) {
    const { resolveWhatsappCampaignAudienceCustomerIds } = await import("./whatsapp-campaign-audience.server");
    return resolveWhatsappCampaignAudienceCustomerIds(campaignId);
  }

  if (segmentType === "custom" && !segmentId) {
    throw new Error("O segmento customizado perdeu o identificador durante a seleção. Volte à etapa Público e selecione o segmento novamente.");
  }

  const finalSegment = segmentId || segmentType;
  if (isCustomSegmentId(finalSegment)) return resolveCustomSegmentCustomerIds(finalSegment);

  const { getSegmentCustomerIds } = await import("./whatsapp-meta.server");
  return getSegmentCustomerIds(segmentType, segmentId);
}

export async function resolveWhatsappSegmentAudience(segmentType: string, segmentId?: string) {
  const ids = await resolveWhatsappSegmentCustomerIds(segmentType, segmentId);
  const { toE164 } = await import("./whatsapp-meta.server");
  const customers = await loadAudienceCustomers(ids);
  const withPhone = customers.filter((customer) => Boolean(customer.phone));
  const eligible = withPhone.filter((customer) => {
    const phone = toE164(customer.phone);
    return Boolean(phone && phone.length >= 12);
  });

  return {
    ids,
    clientes: ids.length,
    comTelefone: withPhone.length,
    destinatarios: eligible.length,
    recipientSamples: eligible.slice(0, RECIPIENT_SAMPLE_SIZE).map((customer) => ({
      id: customer.id,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Cliente sem nome",
      email: customer.email,
      phone: toE164(customer.phone),
    })),
  };
}

/**
 * Auditoria pré-envio. Além de validar telefones, mostra duplicidades e opt-outs antes de criar
 * a campanha. Para carrinho abandonado usa o mesmo resolver especial do enfileiramento.
 */
export async function resolveWhatsappSegmentAudit(
  segmentType: string,
  segmentId: string | undefined,
  messageType: "marketing" | "utility",
) {
  const ids = await resolveWhatsappSegmentCustomerIds(segmentType, segmentId);
  const { resolveSegmentRecipients, toE164 } = await import("./whatsapp-meta.server");
  const recipients = (await resolveSegmentRecipients(segmentType, ids)) as Array<{ id: string; phone: string }>;

  const rows = recipients.map((recipient) => {
    const normalized = toE164(recipient.phone);
    return {
      customerId: String(recipient.id),
      rawPhone: recipient.phone,
      normalizedPhone: normalized && normalized.length >= 12 ? normalized : null,
      suppressed: false,
    };
  });

  if (messageType === "marketing") {
    const { getSuppressedWhatsappPhones } = await import("./whatsapp-suppression.server");
    const suppressed = await getSuppressedWhatsappPhones(
      rows.map((row) => row.normalizedPhone).filter((phone): phone is string => Boolean(phone)),
    );
    for (const row of rows) row.suppressed = Boolean(row.normalizedPhone && suppressed.has(row.normalizedPhone));
  }

  const audit = summarizeWhatsappPresendAudience(rows, { totalSegment: ids.length, messageType });
  return {
    ids,
    clientes: audit.totalSegment,
    comTelefone: audit.withPhone,
    destinatarios: audit.eligibleRecipients,
    invalidPhone: audit.invalidPhone,
    duplicatePhones: audit.duplicatePhones,
    marketingOptOuts: audit.marketingOptOuts,
    eligibleRecipients: audit.eligibleRecipients,
  };
}
