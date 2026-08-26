import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { selectOtherManualWhatsappCampaignIds } from "./whatsapp-campaign-cleanup";

export const deleteOtherManualWhatsappCampaignAttempts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ keepCampaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: keep, error: keepError } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("id, origem, automation_id")
      .eq("id", data.keepCampaignId)
      .maybeSingle();

    if (keepError) return { success: false as const, error: keepError.message };
    if (!keep) return { success: false as const, error: "Campanha que deve ser mantida não foi encontrada." };
    if ((keep as any).origem !== "crm" || (keep as any).automation_id) {
      return {
        success: false as const,
        error: "A limpeza em massa só pode manter uma campanha manual do CRM. Campanhas de automação são protegidas.",
      };
    }

    const { data: rows, error: listError } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("id, origem, automation_id");
    if (listError) return { success: false as const, error: listError.message };

    const ids = selectOtherManualWhatsappCampaignIds(
      ((rows ?? []) as any[]).map((row) => ({
        id: String(row.id),
        origem: row.origem == null ? null : String(row.origem),
        automationId: row.automation_id == null ? null : String(row.automation_id),
      })),
      data.keepCampaignId,
    );

    if (ids.length === 0) {
      return { success: true as const, deleted: 0 };
    }

    const { error: deleteError } = await supabaseAdmin.from("whatsapp_campaigns").delete().in("id", ids);
    if (deleteError) return { success: false as const, error: deleteError.message };

    return { success: true as const, deleted: ids.length };
  });
