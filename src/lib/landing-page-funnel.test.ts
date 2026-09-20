import { describe, expect, it } from "vitest";
import { computeLandingPageFunnel, landingPagePhoneKey } from "./landing-page-funnel";

const page = { id: "lp-1", nome: "Grupo VIP", slug: "grupo-vip", groupId: "group-1", groupName: "VIP" };

describe("landing page funnel", () => {
  it("normaliza telefone com ou sem DDI", () => {
    expect(landingPagePhoneKey("+55 (31) 98212-5522")).toBe("31982125522");
    expect(landingPagePhoneKey("31982125522")).toBe("31982125522");
  });

  it("conta pessoas unicas e somente entradas de quem clicou", () => {
    const result = computeLandingPageFunnel(
      [page],
      [
        { id: "v1", landingPageId: page.id, eventType: "view", visitorId: "visitor-a", createdAt: "2026-09-19T10:00:00Z" },
        { id: "v2", landingPageId: page.id, eventType: "view", visitorId: "visitor-a", createdAt: "2026-09-19T10:01:00Z" },
        { id: "v3", landingPageId: page.id, eventType: "view", visitorId: "visitor-b", createdAt: "2026-09-19T10:02:00Z" },
        { id: "s1", landingPageId: page.id, eventType: "form_submit", phone: "+5531982125522", createdAt: "2026-09-19T10:03:00Z" },
        { id: "c1", landingPageId: page.id, eventType: "link_click", phone: "+5531982125522", createdAt: "2026-09-19T10:03:00Z" },
        { id: "c2", landingPageId: page.id, eventType: "link_click", phone: "+5531982125522", createdAt: "2026-09-19T10:04:00Z" },
      ],
      [
        { landingPageId: page.id, phone: "31982125522", joinedAt: "2026-09-19T10:05:00Z", groupId: "group-1", groupName: "VIP" },
        { landingPageId: page.id, phone: "31999999999", joinedAt: "2026-09-19T10:06:00Z", groupId: "group-1", groupName: "VIP" },
      ],
    );

    expect(result.totals).toMatchObject({ visits: 2, submissions: 1, clicks: 1, joins: 1, abandoned: 0 });
    expect(result.totals.accessToClickRate).toBe(50);
    expect(result.totals.clickToJoinRate).toBe(100);
  });

  it("nao mistura entrada de outra landing page", () => {
    const result = computeLandingPageFunnel(
      [page],
      [{ id: "c1", landingPageId: page.id, eventType: "link_click", phone: "+5531982125522", createdAt: "2026-09-19T10:00:00Z" }],
      [{ landingPageId: "lp-2", phone: "+5531982125522", joinedAt: "2026-09-19T10:05:00Z", groupId: "group-2", groupName: "Outro" }],
    );

    expect(result.totals).toMatchObject({ clicks: 1, joins: 0, abandoned: 1 });
  });
});
