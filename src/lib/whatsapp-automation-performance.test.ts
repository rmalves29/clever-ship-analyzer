import { describe, expect, it } from "vitest";
import {
  automationStepTimingLabel,
  buildAutomationPerformanceReport,
} from "./whatsapp-automation-performance";

describe("automationStepTimingLabel", () => {
  it("explica intervalos RFM e datas ancoradas do cashback", () => {
    expect(
      automationStepTimingLabel(
        { id: "one", type: "send", waitMinutes: 1440, waitValue: 1, waitUnit: "days" },
        0,
      ),
    ).toBe("1 dia após o gatilho");
    expect(
      automationStepTimingLabel(
        { id: "two", type: "send", waitMinutes: 4320, waitValue: 3, waitUnit: "days" },
        1,
      ),
    ).toBe("3 dias após a etapa anterior");
    expect(
      automationStepTimingLabel(
        {
          id: "cashback",
          type: "send",
          waitMinutes: 0,
          schedule: { anchor: "cashback_ends_at", offsetMinutes: -1440 },
        },
        2,
      ),
    ).toBe("1 dia antes de expirar");
  });
});

describe("buildAutomationPerformanceReport", () => {
  it("consolida por automação e etapa, incluindo custo, vendas e ROAS", () => {
    const report = buildAutomationPerformanceReport({
      definitions: [
        {
          id: "auto-1",
          name: "RFM — Novos",
          active: true,
          automationKind: "rfm",
          steps: [
            {
              id: "step-1",
              type: "send",
              waitMinutes: 1440,
              waitValue: 1,
              waitUnit: "days",
              templateName: "boas_vindas",
              messageType: "marketing",
            },
            {
              id: "step-2",
              type: "send",
              waitMinutes: 5760,
              waitValue: 4,
              waitUnit: "days",
              templateName: "reforco",
              messageType: "marketing",
            },
          ],
        },
      ],
      campaigns: [
        {
          id: "campaign-1",
          name: "RFM — Novos",
          automationId: "auto-1",
          automationStepId: "step-1",
          templateName: "boas_vindas",
          messageType: "marketing",
          sent: 100,
          delivered: 90,
          read: 70,
          failed: 5,
        },
        {
          id: "campaign-2",
          name: "RFM — Novos",
          automationId: "auto-1",
          automationStepId: "step-2",
          templateName: "reforco",
          messageType: "marketing",
          sent: 50,
          delivered: 45,
          read: 30,
          failed: 2,
        },
      ],
      revenueByCampaign: new Map([
        ["campaign-1", { orders: 4, revenue: 800 }],
        ["campaign-2", { orders: 1, revenue: 200 }],
      ]),
      costPerMessage: { marketing: 0.4, utility: 0.1 },
      attributionWindowDays: 30,
      generatedAt: "2026-09-16T12:00:00.000Z",
    });

    expect(report.automations).toHaveLength(1);
    expect(report.automations[0]?.steps).toHaveLength(2);
    expect(report.automations[0]).toMatchObject({
      sent: 150,
      delivered: 135,
      read: 100,
      failed: 7,
      orders: 5,
      revenue: 1000,
      cost: 60,
      roas: 16.67,
    });
    expect(report.totals).toEqual(
      report.automations[0] && {
        sent: report.automations[0].sent,
        delivered: report.automations[0].delivered,
        read: report.automations[0].read,
        failed: report.automations[0].failed,
        orders: report.automations[0].orders,
        revenue: report.automations[0].revenue,
        cost: report.automations[0].cost,
        roas: report.automations[0].roas,
      },
    );
  });

  it("mantém etapas sem envio visíveis e agrega campanhas históricas duplicadas", () => {
    const report = buildAutomationPerformanceReport({
      definitions: [
        {
          id: "auto-1",
          name: "Cashback",
          steps: [
            { id: "released", type: "send", waitMinutes: 0, templateName: "released" },
            { id: "final", type: "send", waitMinutes: 0, templateName: "final" },
          ],
        },
      ],
      campaigns: [
        {
          id: "old",
          name: "Cashback",
          automationId: "auto-1",
          automationStepId: "released",
          sent: 2,
        },
        {
          id: "new",
          name: "Cashback",
          automationId: "auto-1",
          automationStepId: "released",
          sent: 3,
        },
      ],
      costPerMessage: { marketing: 0.5, utility: 0.1 },
      attributionWindowDays: 30,
    });

    expect(report.automations[0]?.steps[0]).toMatchObject({
      stepId: "released",
      sent: 5,
      cost: 2.5,
    });
    expect(report.automations[0]?.steps[1]).toMatchObject({
      stepId: "final",
      sent: 0,
      cost: 0,
      roas: null,
    });
  });
});
