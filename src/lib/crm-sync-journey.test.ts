import { describe, expect, it, vi } from "vitest";
import { backfillOrderJourney } from "./crm-sync.server";

function fakeDb(pendingIds: string[]) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const db = {
    from: () => ({
      select: () => {
        const chain: any = {
          eq: () => chain,
          is: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: async () => ({ data: pendingIds.map((id) => ({ id })) }),
        };
        return chain;
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ id, patch });
          return { error: null };
        },
      }),
    }),
  };
  return { db: db as never, updates };
}

describe("backfillOrderJourney", () => {
  it("não consulta a Shopify quando não há pedido pendente", async () => {
    const { db } = fakeDb([]);
    const shopify = vi.fn();
    expect(await backfillOrderJourney(db, shopify)).toEqual({ checked: 0, filled: 0 });
    expect(shopify).not.toHaveBeenCalled();
  });

  it("preenche quando há jornada, marca vazio quando a Shopify fechou sem jornada e ignora ready=false", async () => {
    const { db, updates } = fakeDb(["gid://o/1", "gid://o/2", "gid://o/3"]);
    const shopify = vi.fn(async () => ({
      nodes: [
        { id: "gid://o/1", customerJourneySummary: { ready: true, firstVisit: { landingPage: "https://loja.com/collections/x", referrerUrl: "https://google.com/" } } },
        { id: "gid://o/2", customerJourneySummary: { ready: true, firstVisit: null } },
        { id: "gid://o/3", customerJourneySummary: { ready: false, firstVisit: null } },
      ],
    }));
    const r = await backfillOrderJourney(db, shopify);
    expect(r).toEqual({ checked: 3, filled: 1 });
    expect(updates).toEqual([
      { id: "gid://o/1", patch: { landing_site: "https://loja.com/collections/x", referring_site: "https://google.com/" } },
      { id: "gid://o/2", patch: { landing_site: "" } },
    ]);
  });
});
