export type LandingPageFunnelEventType = "view" | "form_submit" | "link_click";

export type LandingPageFunnelEvent = {
  id: string;
  landingPageId: string;
  eventType: LandingPageFunnelEventType;
  visitorId?: string | null;
  phone?: string | null;
  createdAt: string;
};

export type LandingPageJoin = {
  landingPageId: string;
  phone: string;
  joinedAt: string;
  groupId: string;
  groupName: string;
  detectionSource?: "event" | "current_member";
};

export type LandingPageFunnelDefinition = {
  id: string;
  nome: string;
  slug: string;
  groupId: string | null;
  groupName: string | null;
};

export type LandingPageFunnelRow = {
  landingPageId: string;
  nome: string;
  slug: string;
  groupId: string | null;
  groupName: string | null;
  visits: number;
  submissions: number;
  clicks: number;
  joins: number;
  abandoned: number;
  accessToClickRate: number;
  clickToJoinRate: number;
  accessToJoinRate: number;
};

/** Normaliza celulares brasileiros vindos do formulário e do WhatsApp. O WhatsApp ainda pode
 * devolver números antigos com 8 dígitos; nesse caso, acrescenta o 9 depois do DDD. */
export function landingPagePhoneKey(value: string | null | undefined): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length === 10) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return digits.slice(-11);
}

function rate(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function eventPersonKey(event: LandingPageFunnelEvent): string {
  const phone = landingPagePhoneKey(event.phone);
  if (phone) return `phone:${phone}`;
  if (event.visitorId) return `visitor:${event.visitorId}`;
  return `event:${event.id}`;
}

export function computeLandingPageFunnel(
  pages: LandingPageFunnelDefinition[],
  events: LandingPageFunnelEvent[],
  joins: LandingPageJoin[],
): { totals: Omit<LandingPageFunnelRow, "landingPageId" | "nome" | "slug" | "groupId" | "groupName">; porLandingPage: LandingPageFunnelRow[] } {
  const eventsByPage = new Map<string, LandingPageFunnelEvent[]>();
  for (const event of events) {
    const list = eventsByPage.get(event.landingPageId) ?? [];
    list.push(event);
    eventsByPage.set(event.landingPageId, list);
  }

  const joinsByPage = new Map<string, LandingPageJoin[]>();
  for (const join of joins) {
    const list = joinsByPage.get(join.landingPageId) ?? [];
    list.push(join);
    joinsByPage.set(join.landingPageId, list);
  }

  const porLandingPage = pages.map((page): LandingPageFunnelRow => {
    const pageEvents = eventsByPage.get(page.id) ?? [];
    const visits = new Set<string>();
    const submissions = new Set<string>();
    const clicks = new Set<string>();
    const clickPhoneKeys = new Set<string>();

    for (const event of pageEvents) {
      const key = eventPersonKey(event);
      if (event.eventType === "view") visits.add(key);
      if (event.eventType === "form_submit") submissions.add(key);
      if (event.eventType === "link_click") {
        clicks.add(key);
        const phoneKey = landingPagePhoneKey(event.phone);
        if (phoneKey) clickPhoneKeys.add(phoneKey);
      }
    }

    // Entrada so e conversao deste funil quando o mesmo telefone clicou no CTA desta pagina.
    const joinedPhoneKeys = new Set(
      (joinsByPage.get(page.id) ?? [])
        .map((join) => landingPagePhoneKey(join.phone))
        .filter((phoneKey) => phoneKey && clickPhoneKeys.has(phoneKey)),
    );

    const visitsCount = visits.size;
    const submissionsCount = submissions.size;
    const clicksCount = clicks.size;
    const joinsCount = joinedPhoneKeys.size;
    return {
      landingPageId: page.id,
      nome: page.nome,
      slug: page.slug,
      groupId: page.groupId,
      groupName: page.groupName,
      visits: visitsCount,
      submissions: submissionsCount,
      clicks: clicksCount,
      joins: joinsCount,
      abandoned: Math.max(0, clicksCount - joinsCount),
      accessToClickRate: rate(clicksCount, visitsCount),
      clickToJoinRate: rate(joinsCount, clicksCount),
      accessToJoinRate: rate(joinsCount, visitsCount),
    };
  });

  const aggregate = porLandingPage.reduce(
    (total, row) => ({
      visits: total.visits + row.visits,
      submissions: total.submissions + row.submissions,
      clicks: total.clicks + row.clicks,
      joins: total.joins + row.joins,
      abandoned: total.abandoned + row.abandoned,
    }),
    { visits: 0, submissions: 0, clicks: 0, joins: 0, abandoned: 0 },
  );

  return {
    totals: {
      ...aggregate,
      accessToClickRate: rate(aggregate.clicks, aggregate.visits),
      clickToJoinRate: rate(aggregate.joins, aggregate.clicks),
      accessToJoinRate: rate(aggregate.joins, aggregate.visits),
    },
    porLandingPage: porLandingPage.sort((a, b) => b.visits - a.visits || b.clicks - a.clicks),
  };
}
