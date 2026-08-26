export type PresendAudienceRow = {
  customerId: string;
  rawPhone?: string | null;
  normalizedPhone?: string | null;
  suppressed?: boolean;
};

export type WhatsappPresendAudit = {
  totalSegment: number;
  withPhone: number;
  invalidPhone: number;
  duplicatePhones: number;
  marketingOptOuts: number;
  eligibleRecipients: number;
};

/**
 * Resume as exclusões antes do enfileiramento usando motivos mutuamente exclusivos:
 * sem/telefone inválido -> telefone duplicado -> opt-out de marketing -> elegível.
 * Opt-out de marketing não bloqueia mensagens de utilidade.
 */
export function summarizeWhatsappPresendAudience(
  rows: PresendAudienceRow[],
  options: { totalSegment: number; messageType: "marketing" | "utility" },
): WhatsappPresendAudit {
  const totalSegment = Math.max(0, Number(options.totalSegment) || 0);
  const withPhone = rows.filter((row) => Boolean(row.rawPhone?.trim())).length;
  const missingPhone = Math.max(0, totalSegment - withPhone);
  const seenPhones = new Set<string>();
  let invalidNormalizedPhone = 0;
  let duplicatePhones = 0;
  let marketingOptOuts = 0;
  let eligibleRecipients = 0;

  for (const row of rows) {
    if (!row.rawPhone?.trim()) continue;
    const phone = row.normalizedPhone?.trim() || null;
    if (!phone) {
      invalidNormalizedPhone++;
      continue;
    }
    if (seenPhones.has(phone)) {
      duplicatePhones++;
      continue;
    }
    seenPhones.add(phone);

    if (options.messageType === "marketing" && row.suppressed === true) {
      marketingOptOuts++;
      continue;
    }
    eligibleRecipients++;
  }

  return {
    totalSegment,
    withPhone,
    invalidPhone: missingPhone + invalidNormalizedPhone,
    duplicatePhones,
    marketingOptOuts,
    eligibleRecipients,
  };
}
