import type { SegmentRules } from "./crm-segmentation-shared";
import { matchesAdvancedSegmentRules } from "./crm-product-segmentation";
import { summarizeWhatsappPresendAudience } from "./whatsapp-presend-audit";

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

/**
 * Fonte única do público usado por campanhas e automações.
 * Segmentos customizados usam exatamente o mesmo motor do CRM; os segmentos legados continuam
 * delegando para o resolver histórico enquanto são migrados.
 */
export async function resolveWhatsappSegmentCustomerIds(segmentType: string, segmentId?: string): Promise<string[]> {
  const finalSegment = segmentId || segmentType;
  if (isCustomSegmentId(finalSegment)) return resolveCustomSegmentCustomerIds(finalSegment);

  const { getSegmentCustomerIds } = await import("./whatsapp-meta.server");
  return getSegmentCustomerIds(segmentType, segmentId);
}

export async function resolveWhatsappSegmentAudience(segmentType: string, segmentId?: string) {
  const ids = await resolveWhatsappSegmentCustomerIds(segmentType, segmentId);
  const { getCustomersWithPhone, toE164 } = await import("./whatsapp-meta.server");
  const customers = await getCustomersWithPhone(ids);
  const destinatarios = customers.filter((customer) => {
    const phone = toE164(customer.phone);
    return Boolean(phone && phone.length >= 12);
  }).length;

  return {
    ids,
    clientes: ids.length,
    comTelefone: customers.length,
    destinatarios,
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
