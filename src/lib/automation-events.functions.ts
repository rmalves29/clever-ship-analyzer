import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { AUTOMATION_EVENT_IDS } from "./automation-events";

/** Opções leves para os filtros rápidos do gatilho (tags existentes e segmentos RFM). */
export const getAutomationFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { RFM_SEGMENTS_CONFIG } = await import("./crm-rfm-shared");
    const customerTags = new Set<string>();
    const customTags = new Set<string>();
    const PAGE = 1000;
    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin
        .from("shopify_customers")
        .select("tags, tags_custom")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const customer of data) {
        for (const tag of customer.tags ?? []) if (tag?.trim()) customerTags.add(tag.trim());
        for (const tag of customer.tags_custom ?? []) if (tag?.trim()) customTags.add(tag.trim());
      }
      if (data.length < PAGE) break;
    }
    return {
      customerTags: [...customerTags].sort((a, b) => a.localeCompare(b, "pt-BR")),
      customTags: [...customTags].sort((a, b) => a.localeCompare(b, "pt-BR")),
      rfmSegments: Object.keys(RFM_SEGMENTS_CONFIG),
    };
  });

const previewSchema = z.object({
  event: z.enum(AUTOMATION_EVENT_IDS),
  lookbackHours: z.number().int().min(1).max(720),
  filters: z
    .array(z.object({ id: z.string().max(40), field: z.string().max(40), operator: z.string().max(30), value: z.string().max(120) }))
    .max(12),
  segmentId: z.string().uuid().optional(),
});

/** Quantos eventos/clientes entrariam agora neste gatilho, antes e depois dos filtros. */
export const previewEventTrigger = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => previewSchema.parse(data))
  .handler(async ({ data }) => {
    const { parseEventTrigger } = await import("./automation-events");
    const { findEventTargets, applyEventAudienceFilters } = await import("./automation-events.server");
    const { resolveSegmentRecipients } = await import("./whatsapp-meta.server");

    const trigger = parseEventTrigger({ event: data.event, lookbackHours: data.lookbackHours, quickFilters: data.filters });
    if (!trigger) return { eventos: 0, eventosFiltrados: 0, clientes: 0, comTelefone: 0 };

    const targets = await findEventTargets(trigger.event, trigger.lookbackHours);
    const kept = await applyEventAudienceFilters(
      targets,
      trigger,
      data.segmentId ? { segmentType: "custom", segmentId: data.segmentId } : null,
    );
    const customerIds = [...new Set(kept.map((t) => t.customerId))];
    const withPhone = customerIds.length ? ((await resolveSegmentRecipients("custom", customerIds)) as Array<{ id: string }>) : [];
    return {
      eventos: targets.length,
      eventosFiltrados: kept.length,
      clientes: customerIds.length,
      comTelefone: withPhone.length,
    };
  });
