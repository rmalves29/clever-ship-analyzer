import { uniqueWhatsappCampaignCustomerIds, whatsappCampaignAudienceValue } from "./whatsapp-campaign-audience";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function listWhatsappCampaignAudienceOptions() {
  const db = await admin();
  const { data: campaigns, error: campaignError } = await db
    .from("whatsapp_campaigns")
    .select("id, nome, created_at, sent_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (campaignError) throw new Error(`Erro ao carregar campanhas do WhatsApp: ${campaignError.message}`);

  const ids = (campaigns ?? []).map((campaign: any) => String(campaign.id));
  if (ids.length === 0) return [];

  const { data: recipients, error: recipientError } = await db
    .from("whatsapp_campaign_recipients")
    .select("campaign_id, customer_id, status, sent_at")
    .in("campaign_id", ids);
  if (recipientError) throw new Error(`Erro ao carregar destinatários das campanhas: ${recipientError.message}`);

  const byCampaign = new Map<string, Array<{ customer_id?: string | null; status?: string | null; sent_at?: string | null }>>();
  for (const row of recipients ?? []) {
    const campaignId = String((row as any).campaign_id ?? "");
    if (!campaignId) continue;
    const list = byCampaign.get(campaignId) ?? [];
    list.push(row as any);
    byCampaign.set(campaignId, list);
  }

  return (campaigns ?? [])
    .map((campaign: any) => {
      const campaignId = String(campaign.id);
      const customerIds = uniqueWhatsappCampaignCustomerIds(byCampaign.get(campaignId) ?? []);
      return {
        value: whatsappCampaignAudienceValue(campaignId),
        campaignId,
        nome: String(campaign.nome ?? "Campanha sem nome"),
        recipients: customerIds.length,
        createdAt: String(campaign.created_at ?? ""),
      };
    })
    .filter((option: { recipients: number }) => option.recipients > 0);
}

export async function resolveWhatsappCampaignAudienceCustomerIds(campaignId: string): Promise<string[]> {
  const db = await admin();
  const { data, error } = await db
    .from("whatsapp_campaign_recipients")
    .select("customer_id, status, sent_at")
    .eq("campaign_id", campaignId);
  if (error) throw new Error(`Erro ao carregar destinatários da campanha: ${error.message}`);
  return uniqueWhatsappCampaignCustomerIds(data ?? []);
}
