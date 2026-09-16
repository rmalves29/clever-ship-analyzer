import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { loadSettings } from "./whatsapp-meta.server";
import { WA_REVENUE_WINDOW_DAYS } from "./wa-campaigns.functions";
import {
  buildAutomationPerformanceReport,
  type AutomationCampaignPerformanceInput,
  type AutomationCampaignRevenueInput,
  type AutomationDefinitionPerformanceInput,
  type AutomationPerformanceReport,
} from "./whatsapp-automation-performance";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Relatório exclusivo das réguas automáticas. A seleção exige `origin = automacao` e
 * `automation_id`, então campanhas manuais e fluxos conversacionais nunca entram nesta soma.
 */
export const getAutomationPerformance = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async (): Promise<AutomationPerformanceReport> => {
    const supabaseAdmin = await admin();
    const [definitionsResult, campaignsResult, revenueResult, settings] = await Promise.all([
      supabaseAdmin
        .from("whatsapp_automations")
        .select("id, nome, descricao, ativo, automation_kind, steps, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("wa_campaigns")
        .select(
          "id, name, automation_id, automation_step_id, template_name, message_type, sent_count, delivered_count, read_count, failed_count",
        )
        .eq("origin", "automacao")
        .not("automation_id", "is", null),
      supabaseAdmin.rpc("wa_campaign_revenue", { p_window_days: WA_REVENUE_WINDOW_DAYS }),
      loadSettings(),
    ]);

    if (definitionsResult.error) throw new Error(definitionsResult.error.message);
    if (campaignsResult.error) throw new Error(campaignsResult.error.message);

    const definitions: AutomationDefinitionPerformanceInput[] = (definitionsResult.data ?? []).map(
      (row) => ({
        id: String(row.id),
        name: String(row.nome),
        description: row.descricao ? String(row.descricao) : null,
        active: Boolean(row.ativo),
        automationKind: String(row.automation_kind ?? "segment"),
        steps: row.steps,
      }),
    );

    const campaigns: AutomationCampaignPerformanceInput[] = (campaignsResult.data ?? []).map(
      (row) => ({
        id: String(row.id),
        name: String(row.name),
        automationId: String(row.automation_id),
        automationStepId: row.automation_step_id ? String(row.automation_step_id) : null,
        templateName: row.template_name ? String(row.template_name) : null,
        messageType: row.message_type ? String(row.message_type) : null,
        sent: Number(row.sent_count ?? 0),
        delivered: Number(row.delivered_count ?? 0),
        read: Number(row.read_count ?? 0),
        failed: Number(row.failed_count ?? 0),
      }),
    );

    const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
    const revenueByCampaign = new Map<string, AutomationCampaignRevenueInput>();
    if (!revenueResult.error) {
      for (const row of revenueResult.data ?? []) {
        const campaignId = String(row.campaign_id);
        if (!campaignIds.has(campaignId)) continue;
        revenueByCampaign.set(campaignId, {
          revenue: Number(row.revenue ?? 0),
          orders: Number(row.orders ?? 0),
        });
      }
    }

    return buildAutomationPerformanceReport({
      definitions,
      campaigns,
      revenueByCampaign,
      costPerMessage: {
        marketing: Number(settings.costMarketing ?? 0),
        utility: Number(settings.costUtility ?? 0),
      },
      attributionWindowDays: WA_REVENUE_WINDOW_DAYS,
    });
  });
