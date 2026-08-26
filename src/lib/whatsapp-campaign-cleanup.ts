export type WhatsappCampaignCleanupRow = {
  id: string;
  origem?: string | null;
  automationId?: string | null;
};

/**
 * Seleciona somente campanhas manuais do CRM para limpeza.
 * A campanha escolhida pelo usuário é sempre preservada e campanhas de automação
 * nunca entram na exclusão em massa.
 */
export function selectOtherManualWhatsappCampaignIds(
  rows: WhatsappCampaignCleanupRow[],
  keepCampaignId: string,
): string[] {
  const ids = new Set<string>();

  for (const row of rows) {
    if (!row?.id || row.id === keepCampaignId) continue;
    if (row.origem !== "crm") continue;
    if (row.automationId) continue;
    ids.add(row.id);
  }

  return Array.from(ids);
}
