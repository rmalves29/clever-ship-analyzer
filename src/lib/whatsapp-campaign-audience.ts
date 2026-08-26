export const WHATSAPP_CAMPAIGN_AUDIENCE_PREFIX = "campaign:";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function whatsappCampaignAudienceValue(campaignId: string): string {
  return `${WHATSAPP_CAMPAIGN_AUDIENCE_PREFIX}${campaignId}`;
}

export function parseWhatsappCampaignAudienceValue(value: string | null | undefined): string | null {
  if (!value?.startsWith(WHATSAPP_CAMPAIGN_AUDIENCE_PREFIX)) return null;
  const id = value.slice(WHATSAPP_CAMPAIGN_AUDIENCE_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

export function uniqueWhatsappCampaignCustomerIds(
  rows: Array<{ customer_id?: string | null; status?: string | null; sent_at?: string | null }>,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const sent = Boolean(row.sent_at) || ["sent", "delivered", "read"].includes(String(row.status ?? "").toLowerCase());
    if (sent && row.customer_id) ids.add(String(row.customer_id));
  }
  return Array.from(ids);
}
