import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { loadSettings } from "./whatsapp-meta.server";
import { WA_REVENUE_WINDOW_DAYS } from "./wa-campaigns.functions";
import {
  buildCampaignReport,
  campaignReportPeriodStart,
  CAMPAIGN_REPORT_MESSAGE_TYPES,
  CAMPAIGN_REPORT_PERIODS,
  type CampaignFailureInput,
  type CampaignReport,
  type CampaignReportInput,
} from "./whatsapp-campaign-reports";

const reportFilterSchema = z.object({
  period: z.enum(CAMPAIGN_REPORT_PERIODS).default("30d"),
  messageType: z.enum(CAMPAIGN_REPORT_MESSAGE_TYPES).default("all"),
});

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AdminClient = Awaited<ReturnType<typeof admin>>;

type CampaignDbRow = {
  id: string;
  name: string;
  status: string;
  audience_label: string | null;
  template_name: string;
  message_type: string;
  sent_at: string | null;
  created_at: string;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  failed_count: number | null;
};

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadFailures(
  supabaseAdmin: AdminClient,
  campaignIds: string[],
): Promise<CampaignFailureInput[]> {
  if (campaignIds.length === 0) return [];
  const pageSize = 1_000;
  const groups = chunks(campaignIds, 50);
  const pages = await Promise.all(
    groups.map(async (ids) => {
      const rows: CampaignFailureInput[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabaseAdmin
          .from("wa_campaign_recipients")
          .select("error_code, error_message")
          .in("campaign_id", ids)
          .eq("status", "failed")
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        const current = (data ?? []) as Array<{
          error_code: string | null;
          error_message: string | null;
        }>;
        rows.push(
          ...current.map((row) => ({
            errorCode: row.error_code,
            errorMessage: row.error_message,
          })),
        );
        if (current.length < pageSize) break;
      }
      return rows;
    }),
  );
  return pages.flat();
}

async function loadCampaigns(
  supabaseAdmin: AdminClient,
  filters: z.infer<typeof reportFilterSchema>,
  start: string | null,
): Promise<CampaignDbRow[]> {
  const rows: CampaignDbRow[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    let query = supabaseAdmin
      .from("wa_campaigns")
      .select(
        "id, name, status, audience_label, template_name, message_type, sent_at, created_at, sent_count, delivered_count, read_count, failed_count",
      )
      .is("automation_id", null)
      .is("conversation_flow_id", null)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (start) {
      query = query.or(`sent_at.gte.${start},and(sent_at.is.null,created_at.gte.${start})`);
    }
    if (filters.messageType !== "all") {
      query = query.eq("message_type", filters.messageType);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const current = (data ?? []) as CampaignDbRow[];
    rows.push(...current);
    if (current.length < pageSize) break;
  }

  return rows;
}

/**
 * Fonte única da página de Relatórios. Lê apenas `wa_campaigns` e exclui explicitamente
 * automações e fluxos conversacionais. Assim, os totais desta página nunca contaminam o painel
 * exclusivo de Automações.
 */
export const getWhatsappCampaignReport = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => reportFilterSchema.parse(data))
  .handler(async ({ data }): Promise<CampaignReport> => {
    const supabaseAdmin = await admin();
    const start = campaignReportPeriodStart(data.period);

    const [campaignRowsResult, revenueResult, settings] = await Promise.all([
      loadCampaigns(supabaseAdmin, data, start),
      supabaseAdmin.rpc("wa_campaign_revenue", {
        p_window_days: WA_REVENUE_WINDOW_DAYS,
      }),
      loadSettings(),
    ]);

    if (revenueResult.error) {
      throw new Error(
        `Não foi possível calcular as vendas atribuídas: ${revenueResult.error.message}`,
      );
    }

    const campaignRows = campaignRowsResult.filter(
      (row) => Number(row.sent_count ?? 0) > 0 || Number(row.failed_count ?? 0) > 0,
    );
    const selectedIds = new Set(campaignRows.map((row) => row.id));
    const revenueByCampaign = new Map<string, { orders: number; revenue: number }>();
    for (const row of revenueResult.data ?? []) {
      const campaignId = String(row.campaign_id);
      if (!selectedIds.has(campaignId)) continue;
      revenueByCampaign.set(campaignId, {
        orders: Number(row.orders ?? 0),
        revenue: Number(row.revenue ?? 0),
      });
    }

    const costs = {
      marketing: Number(settings.costMarketing ?? 0),
      utility: Number(settings.costUtility ?? 0),
    };
    const campaigns: CampaignReportInput[] = campaignRows.map((row) => {
      const sent = Number(row.sent_count ?? 0);
      const messageType = row.message_type === "utility" ? "utility" : "marketing";
      const attributed = revenueByCampaign.get(row.id);
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        audienceLabel: row.audience_label,
        templateName: row.template_name,
        messageType,
        sentAt: row.sent_at,
        createdAt: row.created_at,
        sent,
        delivered: Number(row.delivered_count ?? 0),
        read: Number(row.read_count ?? 0),
        failed: Number(row.failed_count ?? 0),
        orders: attributed?.orders ?? 0,
        revenue: attributed?.revenue ?? 0,
        cost: sent * costs[messageType],
      };
    });

    const failures = await loadFailures(
      supabaseAdmin,
      campaignRows.map((row) => row.id),
    );

    return buildCampaignReport({
      period: data.period,
      messageType: data.messageType,
      attributionWindowDays: WA_REVENUE_WINDOW_DAYS,
      campaigns,
      failures,
    });
  });
