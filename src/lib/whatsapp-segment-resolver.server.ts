import type { SegmentRules } from "./crm-segmentation-shared";
import { matchesAdvancedSegmentRules } from "./crm-product-segmentation";

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
