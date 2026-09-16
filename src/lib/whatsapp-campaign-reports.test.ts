import { describe, expect, it } from "vitest";
import {
  buildCampaignReport,
  campaignReportPeriodStart,
  type CampaignReportInput,
} from "./whatsapp-campaign-reports";

const campaigns: CampaignReportInput[] = [
  {
    id: "manual-1",
    name: "Campanha VIP",
    status: "finalizada",
    audienceLabel: "Clientes VIP",
    templateName: "oferta_vip",
    messageType: "marketing",
    sentAt: "2026-09-15T14:00:00.000Z",
    createdAt: "2026-09-15T13:00:00.000Z",
    sent: 100,
    delivered: 90,
    read: 72,
    failed: 10,
    orders: 4,
    revenue: 800,
    cost: 20,
  },
  {
    id: "manual-2",
    name: "Aviso de pedido",
    status: "finalizada",
    audienceLabel: null,
    templateName: "aviso_pedido",
    messageType: "utility",
    sentAt: "2026-09-15T18:00:00.000Z",
    createdAt: "2026-09-15T17:00:00.000Z",
    sent: 50,
    delivered: 45,
    read: 36,
    failed: 5,
    orders: 1,
    revenue: 100,
    cost: 5,
  },
];

describe("relatório de campanhas manuais", () => {
  it("calcula totais, taxas, custo e ROAS", () => {
    const report = buildCampaignReport({
      period: "30d",
      messageType: "all",
      attributionWindowDays: 3,
      campaigns,
    });

    expect(report.totals).toMatchObject({
      campaigns: 2,
      sent: 150,
      delivered: 135,
      read: 108,
      failed: 15,
      orders: 5,
      revenue: 900,
      cost: 25,
      roas: 36,
      deliveryRate: 90,
      readRate: 80,
      conversionRate: 3.33,
      averageTicket: 180,
      revenuePerThousand: 6000,
    });
  });

  it("consolida o gráfico por dia e separa Marketing de Utilidade", () => {
    const report = buildCampaignReport({
      period: "7d",
      messageType: "all",
      attributionWindowDays: 3,
      campaigns,
    });

    expect(report.trend).toEqual([
      { date: "2026-09-15", sent: 150, delivered: 135, read: 108, orders: 5, revenue: 900 },
    ]);
    expect(report.byMessageType[0]?.metrics.sent).toBe(100);
    expect(report.byMessageType[1]?.metrics.sent).toBe(50);
  });

  it("agrupa falhas reais por código e motivo", () => {
    const report = buildCampaignReport({
      period: "all",
      messageType: "all",
      attributionWindowDays: 3,
      campaigns,
      failures: [
        { errorCode: "131047", errorMessage: "Re-engagement message" },
        { errorCode: "131047", errorMessage: "131047 — Re-engagement   message" },
        { errorCode: null, errorMessage: "(#131047) Re-engagement message" },
        { errorCode: null, errorMessage: null },
      ],
    });

    expect(report.failures).toEqual([
      { reason: "131047 — Re-engagement message", count: 3, percentage: 75 },
      { reason: "Falha não categorizada", count: 1, percentage: 25 },
    ]);
  });

  it("resolve o início dos períodos e mantém Tudo sem corte", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    expect(campaignReportPeriodStart("7d", now)).toBe("2026-09-09T12:00:00.000Z");
    expect(campaignReportPeriodStart("30d", now)).toBe("2026-08-17T12:00:00.000Z");
    expect(campaignReportPeriodStart("all", now)).toBeNull();
  });
});
