export const CAMPAIGN_REPORT_PERIODS = ["7d", "30d", "90d", "all"] as const;
export type CampaignReportPeriod = (typeof CAMPAIGN_REPORT_PERIODS)[number];

export const CAMPAIGN_REPORT_MESSAGE_TYPES = ["all", "marketing", "utility"] as const;
export type CampaignReportMessageType = (typeof CAMPAIGN_REPORT_MESSAGE_TYPES)[number];

export type CampaignReportMetrics = {
  campaigns: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  orders: number;
  revenue: number;
  cost: number;
  roas: number | null;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
  conversionRate: number;
  averageTicket: number;
  revenuePerThousand: number;
};

export type CampaignReportRow = {
  id: string;
  name: string;
  status: string;
  audienceLabel: string | null;
  templateName: string;
  messageType: "marketing" | "utility";
  sentAt: string | null;
  createdAt: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  orders: number;
  revenue: number;
  cost: number;
  roas: number | null;
};

export type CampaignReportTrendPoint = {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  orders: number;
  revenue: number;
};

export type CampaignReportFailure = {
  reason: string;
  count: number;
  percentage: number;
};

export type CampaignReport = {
  period: CampaignReportPeriod;
  messageType: CampaignReportMessageType;
  attributionWindowDays: number;
  generatedAt: string;
  totals: CampaignReportMetrics;
  rows: CampaignReportRow[];
  trend: CampaignReportTrendPoint[];
  byMessageType: Array<{
    messageType: "marketing" | "utility";
    metrics: CampaignReportMetrics;
  }>;
  failures: CampaignReportFailure[];
};

export type CampaignReportInput = Omit<CampaignReportRow, "roas">;

export type CampaignFailureInput = {
  errorCode?: string | null;
  errorMessage?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

function finite(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): number {
  return Number(value.toFixed(2));
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

export function campaignReportPeriodStart(
  period: CampaignReportPeriod,
  now: Date = new Date(),
): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

function metrics(rows: Array<Omit<CampaignReportRow, "roas">>): CampaignReportMetrics {
  const totals = rows.reduce(
    (acc, row) => {
      acc.sent += finite(row.sent);
      acc.delivered += finite(row.delivered);
      acc.read += finite(row.read);
      acc.failed += finite(row.failed);
      acc.orders += finite(row.orders);
      acc.revenue += finite(row.revenue);
      acc.cost += finite(row.cost);
      return acc;
    },
    { sent: 0, delivered: 0, read: 0, failed: 0, orders: 0, revenue: 0, cost: 0 },
  );
  const revenue = money(totals.revenue);
  const cost = money(totals.cost);
  return {
    campaigns: rows.length,
    ...totals,
    revenue,
    cost,
    roas: cost > 0 ? Number((revenue / cost).toFixed(2)) : null,
    deliveryRate: percentage(totals.delivered, totals.sent),
    readRate: percentage(totals.read, totals.delivered),
    failureRate: percentage(totals.failed, totals.sent + totals.failed),
    conversionRate: percentage(totals.orders, totals.sent),
    averageTicket: totals.orders > 0 ? money(revenue / totals.orders) : 0,
    revenuePerThousand: totals.sent > 0 ? money((revenue / totals.sent) * 1_000) : 0,
  };
}

function saoPauloDateKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "sem-data";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function buildTrend(rows: Array<Omit<CampaignReportRow, "roas">>): CampaignReportTrendPoint[] {
  const byDate = new Map<string, CampaignReportTrendPoint>();
  for (const row of rows) {
    const date = saoPauloDateKey(row.sentAt ?? row.createdAt);
    if (date === "sem-data") continue;
    const point = byDate.get(date) ?? {
      date,
      sent: 0,
      delivered: 0,
      read: 0,
      orders: 0,
      revenue: 0,
    };
    point.sent += finite(row.sent);
    point.delivered += finite(row.delivered);
    point.read += finite(row.read);
    point.orders += finite(row.orders);
    point.revenue += finite(row.revenue);
    byDate.set(date, point);
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => ({ ...point, revenue: money(point.revenue) }));
}

function buildFailureBreakdown(rows: CampaignFailureInput[]): CampaignReportFailure[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const originalMessage = row.errorMessage?.trim().replace(/\s+/g, " ") ?? "";
    const leadingCode = originalMessage.match(/^\s*\(?#?(\d{3,})\)?(?:\s*[-—:])?\s*/)?.[1];
    const rawCode = row.errorCode?.trim() || leadingCode || "";
    const code = rawCode.match(/\d{3,}/)?.[0] ?? rawCode;
    const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const message =
      (code
        ? originalMessage.replace(
            new RegExp(`^\\s*\\(?#?${escapedCode}\\)?(?:\\s*[-—:])?\\s*`, "i"),
            "",
          )
        : originalMessage) || "Falha não categorizada";
    const reason = code ? `${code} — ${message}` : message;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: percentage(count, rows.length),
    }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export function buildCampaignReport(params: {
  period: CampaignReportPeriod;
  messageType: CampaignReportMessageType;
  attributionWindowDays: number;
  campaigns: CampaignReportInput[];
  failures?: CampaignFailureInput[];
  generatedAt?: string;
}): CampaignReport {
  const baseRows = params.campaigns.map((row) => ({
    ...row,
    sent: finite(row.sent),
    delivered: finite(row.delivered),
    read: finite(row.read),
    failed: finite(row.failed),
    orders: finite(row.orders),
    revenue: money(finite(row.revenue)),
    cost: money(finite(row.cost)),
  }));
  const rows: CampaignReportRow[] = baseRows
    .map((row) => ({
      ...row,
      roas: row.cost > 0 ? Number((row.revenue / row.cost).toFixed(2)) : null,
    }))
    .sort(
      (a, b) =>
        new Date(b.sentAt ?? b.createdAt).getTime() - new Date(a.sentAt ?? a.createdAt).getTime(),
    );

  return {
    period: params.period,
    messageType: params.messageType,
    attributionWindowDays: params.attributionWindowDays,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    totals: metrics(baseRows),
    rows,
    trend: buildTrend(baseRows),
    byMessageType: (["marketing", "utility"] as const).map((messageType) => ({
      messageType,
      metrics: metrics(baseRows.filter((row) => row.messageType === messageType)),
    })),
    failures: buildFailureBreakdown(params.failures ?? []),
  };
}
