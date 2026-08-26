export const WHATSAPP_QUEUE_HEALTH_STATUSES = ["queued", "sending", "retry_wait", "sent", "failed", "cancelled", "skipped"] as const;
export type WhatsappQueueHealthStatus = (typeof WHATSAPP_QUEUE_HEALTH_STATUSES)[number];

export type WhatsappQueueHealthRow = {
  status: string;
  error?: string | null;
};

export function summarizeWhatsappQueue(rows: WhatsappQueueHealthRow[]) {
  const byStatus: Record<WhatsappQueueHealthStatus, number> = {
    queued: 0,
    sending: 0,
    retry_wait: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
  };
  const failureReasons = new Map<string, number>();

  for (const row of rows) {
    if ((WHATSAPP_QUEUE_HEALTH_STATUSES as readonly string[]).includes(row.status)) {
      byStatus[row.status as WhatsappQueueHealthStatus]++;
    }
    if (row.status === "failed") {
      const reason = row.error?.trim() || "Falha não categorizada";
      failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + 1);
    }
  }

  const pending = byStatus.queued + byStatus.sending + byStatus.retry_wait;
  const finished = byStatus.sent + byStatus.failed + byStatus.cancelled + byStatus.skipped;
  const total = pending + finished;
  const successBase = byStatus.sent + byStatus.failed;
  const successRate = successBase > 0 ? (byStatus.sent / successBase) * 100 : 0;

  return {
    total,
    pending,
    finished,
    successRate,
    byStatus,
    failureReasons: [...failureReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
}
