import { landingPagePhoneKey, type LandingPageJoin } from "./landing-page-funnel";

const PAGE_SIZE = 1000;

type LandingPageContentLike = {
  hero?: { ctaUrl?: unknown };
  comoFunciona?: { ctaUrl?: unknown };
  integracoes?: { whatsappGroupId?: unknown };
};

export type ResolvedLandingPage = {
  id: string;
  nome: string;
  slug: string;
  groupId: string | null;
  groupName: string | null;
  groupInviteLink: string | null;
  groupJid: string | null;
  equivalentGroupIds: string[];
  currentParticipantPhones: string[];
};

export type LandingPageCustomerActivity = {
  landingPageId: string;
  landingPageName: string;
  slug: string;
  groupId: string | null;
  submittedAt: string;
  clickedAt: string | null;
  joinedAt: string | null;
};

type LiveGroup = { id: string; group_jid: string; group_name: string; invite_link: string | null };

function normalizedInviteLink(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return raw.toLowerCase().replace(/\/$/, "");
  }
}

function contentGroupId(content: unknown): string | null {
  const raw = (content as LandingPageContentLike | null)?.integracoes?.whatsappGroupId;
  const value = String(raw ?? "").trim();
  return value || null;
}

function contentCtaLinks(content: unknown): string[] {
  const c = (content ?? {}) as LandingPageContentLike;
  return [c.hero?.ctaUrl, c.comoFunciona?.ctaUrl]
    .map(normalizedInviteLink)
    .filter(Boolean);
}

async function loadLiveGroups(): Promise<LiveGroup[]> {
  const { getLiveLaunchpadAdmin, MANIA_DE_MULHER_TENANT_ID } = await import(
    "@/integrations/supabase/live-launchpad-client.server"
  );
  const live = await getLiveLaunchpadAdmin();
  const { data, error } = await (live.from("fe_groups" as any) as any)
    .select("id, group_jid, group_name, invite_link")
    .eq("tenant_id", MANIA_DE_MULHER_TENANT_ID);
  if (error) throw new Error(`Erro ao carregar os grupos do WhatsApp: ${error.message}`);
  return (data ?? []) as LiveGroup[];
}

/** Resolve o grupo configurado na landing page. Para paginas antigas, tenta conciliar o CTA
 *  com o invite_link salvo em Grupos, evitando perder o historico ate elas serem editadas. */
export async function loadResolvedLandingPages(landingPageId?: string): Promise<ResolvedLandingPage[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin.from("landing_pages").select("id, nome, slug, conteudo").order("criado_em", { ascending: false });
  if (landingPageId) query = query.eq("id", landingPageId);
  const [{ data: pageRows, error }, groups] = await Promise.all([query, loadLiveGroups()]);
  if (error) throw new Error(`Erro ao carregar landing pages: ${error.message}`);

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const groupByInvite = new Map(
    groups
      .map((group) => [normalizedInviteLink(group.invite_link), group] as const)
      .filter(([link]) => Boolean(link)),
  );

  const [{ canonicalWhatsappGroupJid, currentWhatsappGroupSnapshot, whatsappGroupSourceJid, whatsappParticipantPhone }, uazapi] =
    await Promise.all([import("./envio-group-sync"), import("./envio-uazapi.server")]);
  const groupsByJid = new Map<string, LiveGroup[]>();
  for (const group of groups) {
    const jid = canonicalWhatsappGroupJid(group.group_jid);
    if (jid) groupsByJid.set(jid, [...(groupsByJid.get(jid) ?? []), group]);
  }

  const basePages = ((pageRows ?? []) as Array<{ id: string; nome: string; slug: string; conteudo: unknown }>).map((page) => {
    const explicitId = contentGroupId(page.conteudo);
    const ctaLinks = contentCtaLinks(page.conteudo);
    const inferred = ctaLinks.map((link) => groupByInvite.get(link)).find(Boolean);
    const group = (explicitId ? groupById.get(explicitId) : null) ?? inferred ?? null;
    const groupId = explicitId ?? group?.id ?? null;
    return {
      id: page.id,
      nome: page.nome,
      slug: page.slug,
      groupId,
      groupName: group?.group_name ?? null,
      groupInviteLink: ctaLinks[0] ?? group?.invite_link ?? null,
      groupJid: group ? canonicalWhatsappGroupJid(group.group_jid) : null,
      equivalentGroupIds: group
        ? (groupsByJid.get(canonicalWhatsappGroupJid(group.group_jid)) ?? [group]).map((item) => item.id)
        : groupId
          ? [groupId]
          : [],
      currentParticipantPhones: [] as string[],
    };
  });

  const creds = await uazapi.loadUazapiCreds().catch(() => null);
  if (!creds) return basePages;

  const inviteInfoByLink = new Map<string, Promise<any>>();
  const getInviteInfo = (link: string) => {
    let request = inviteInfoByLink.get(link);
    if (!request) {
      request = uazapi.getGroupInviteInfo(creds, link);
      inviteInfoByLink.set(link, request);
    }
    return request;
  };

  return Promise.all(
    basePages.map(async (page) => {
      if (!page.groupInviteLink) return page;
      try {
        const info = await getInviteInfo(page.groupInviteLink);
        const snapshot = currentWhatsappGroupSnapshot(null, info);
        const resolvedJid = whatsappGroupSourceJid(info);
        const matchingGroups = resolvedJid ? groupsByJid.get(resolvedJid) ?? [] : [];
        const explicitStillMatches = matchingGroups.find((group) => group.id === page.groupId);
        const preferredGroup =
          explicitStillMatches ?? matchingGroups.find((group) => /@g\.us$/i.test(group.group_jid)) ?? matchingGroups[0];
        return {
          ...page,
          groupId: preferredGroup?.id ?? page.groupId,
          groupName: snapshot.name || page.groupName,
          groupJid: resolvedJid || page.groupJid,
          equivalentGroupIds: matchingGroups.length > 0 ? matchingGroups.map((group) => group.id) : page.equivalentGroupIds,
          currentParticipantPhones: snapshot.participants.map(whatsappParticipantPhone).filter(Boolean),
        };
      } catch (error) {
        console.error(`landing-page-funnel: falha ao resolver convite da landing ${page.id}`, error);
        return page;
      }
    }),
  );
}

export async function loadLandingPageGroupJoins(
  pages: ResolvedLandingPage[],
  options?: { since?: string; until?: string; phones?: string[] },
): Promise<LandingPageJoin[]> {
  const groupIds = [
    ...new Set(
      pages.flatMap((page) => page.equivalentGroupIds.length > 0 ? page.equivalentGroupIds : page.groupId ? [page.groupId] : []),
    ),
  ];

  const { getLiveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
  const { canonicalWhatsappGroupJid } = await import("./envio-group-sync");
  const live = await getLiveLaunchpadAdmin();
  const events: Array<{ group_id: string; group_jid: string | null; phone: string; created_at: string }> = [];

  const groupJids = [...new Set(pages.map((page) => page.groupJid ? canonicalWhatsappGroupJid(page.groupJid) : "").filter(Boolean))];

  for (let pageNumber = 0; groupIds.length > 0 || groupJids.length > 0; pageNumber++) {
      let query = (live.from("fe_group_events" as any) as any)
        .select("group_id, group_jid, phone, created_at")
        .eq("event_type", "join")
        .or([groupIds.length ? "group_id.in.(" + groupIds.join(",") + ")" : "", groupJids.length ? "group_jid.in.(" + groupJids.join(",") + ")" : ""].filter(Boolean).join(","))
        .not("phone", "is", null)
        .order("created_at", { ascending: true })
        .range(pageNumber * PAGE_SIZE, pageNumber * PAGE_SIZE + PAGE_SIZE - 1);
      if (options?.since) query = query.gte("created_at", options.since);
      if (options?.until) query = query.lte("created_at", options.until);

      const { data, error } = await query;
      if (error) throw new Error(`Erro ao carregar entradas nos grupos: ${error.message}`);
      const rows = (data ?? []) as typeof events;
      events.push(...rows);
      if (rows.length < PAGE_SIZE) break;
  }

  const pagesByGroup = new Map<string, ResolvedLandingPage[]>();
  const pagesByGroupJid = new Map<string, ResolvedLandingPage[]>();

  for (const page of pages) {
    const ids = page.equivalentGroupIds.length > 0 ? page.equivalentGroupIds : page.groupId ? [page.groupId] : [];
    for (const id of ids) {
      const list = pagesByGroup.get(id) ?? [];
      list.push(page);
      pagesByGroup.set(id, list);
    }

    const jid = page.groupJid ? canonicalWhatsappGroupJid(page.groupJid) : "";
    if (jid) {
      const list = pagesByGroupJid.get(jid) ?? [];
      list.push(page);
      pagesByGroupJid.set(jid, list);
    }
  }

  const joins: LandingPageJoin[] = [];
  const phonesWithEvent = new Set<string>();
  const allowedPhoneKeys = options?.phones?.length
    ? new Set(options.phones.map(landingPagePhoneKey).filter(Boolean))
    : null;

  for (const event of events) {
    const phoneKey = landingPagePhoneKey(event.phone);
    if (!phoneKey || (allowedPhoneKeys && !allowedPhoneKeys.has(phoneKey))) continue;
    const eventJid = event.group_jid ? canonicalWhatsappGroupJid(event.group_jid) : "";
    const matchedPages = new Map<string, ResolvedLandingPage>();
    for (const page of pagesByGroup.get(event.group_id) ?? []) matchedPages.set(page.id, page);
    for (const page of pagesByGroupJid.get(eventJid) ?? []) matchedPages.set(page.id, page);

    for (const page of matchedPages.values()) {
      phonesWithEvent.add(`${page.id}|${phoneKey}`);
      joins.push({
        landingPageId: page.id,
        phone: event.phone,
        joinedAt: event.created_at,
        groupId: event.group_id,
        groupName: page.groupName ?? "Grupo do WhatsApp",
        detectionSource: "event",
      });
    }
  }

  const detectedAt = new Date().toISOString();
  for (const page of pages) {
    for (const phone of page.currentParticipantPhones) {
      const phoneKey = landingPagePhoneKey(phone);
      if (!phoneKey || (allowedPhoneKeys && !allowedPhoneKeys.has(phoneKey))) continue;
      if (phonesWithEvent.has(`${page.id}|${phoneKey}`)) continue;
      joins.push({
        landingPageId: page.id,
        phone,
        joinedAt: detectedAt,
        groupId: page.groupId ?? page.groupJid ?? "whatsapp-group",
        groupName: page.groupName ?? "Grupo do WhatsApp",
        detectionSource: "current_member",
      });
    }
  }
  return joins;
}

/** Dados usados pelo motor de segmentos. O join e por customer_id quando disponivel e cai para
 *  telefone nos leads legados, mantendo as capturas feitas antes da integracao com o CRM. */
export async function loadLandingPageActivitiesByCustomer(
  customers: Array<{ id: string; phone?: string | null }>,
): Promise<Map<string, LandingPageCustomerActivity[]>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const leads: Array<{
    landing_page_id: string;
    customer_id: string | null;
    phone: string;
    criado_em: string;
    clicked_at: string | null;
  }> = [];

  for (let page = 0; ; page++) {
    const { data, error } = await (supabaseAdmin.from("landing_page_leads") as any)
      .select("landing_page_id, customer_id, phone, criado_em, clicked_at")
      .order("criado_em", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao carregar contatos das landing pages: ${error.message}`);
    const rows = (data ?? []) as typeof leads;
    leads.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  if (leads.length === 0) return new Map();

  const pages = await loadResolvedLandingPages();
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const joins = await loadLandingPageGroupJoins(pages);
  const firstJoinByPagePhone = new Map<string, string>();
  for (const join of joins) {
    const phoneKey = landingPagePhoneKey(join.phone);
    if (!phoneKey) continue;
    const key = `${join.landingPageId}|${phoneKey}`;
    const current = firstJoinByPagePhone.get(key);
    if (!current || join.joinedAt < current) firstJoinByPagePhone.set(key, join.joinedAt);
  }

  const customerIdByPhone = new Map<string, string>();
  for (const customer of customers) {
    const key = landingPagePhoneKey(customer.phone);
    if (key && !customerIdByPhone.has(key)) customerIdByPhone.set(key, customer.id);
  }

  const activityByCustomerAndPage = new Map<string, LandingPageCustomerActivity>();
  for (const lead of leads) {
    const phoneKey = landingPagePhoneKey(lead.phone);
    const customerId = lead.customer_id || customerIdByPhone.get(phoneKey);
    const page = pageById.get(lead.landing_page_id);
    if (!customerId || !page) continue;
    const key = `${customerId}|${page.id}`;
    const joinedAt = firstJoinByPagePhone.get(`${page.id}|${phoneKey}`) ?? null;
    const current = activityByCustomerAndPage.get(key);
    if (!current) {
      activityByCustomerAndPage.set(key, {
        landingPageId: page.id,
        landingPageName: page.nome,
        slug: page.slug,
        groupId: page.groupId,
        submittedAt: lead.criado_em,
        clickedAt: lead.clicked_at,
        joinedAt,
      });
      continue;
    }
    if (lead.criado_em < current.submittedAt) current.submittedAt = lead.criado_em;
    if (lead.clicked_at && (!current.clickedAt || lead.clicked_at < current.clickedAt)) current.clickedAt = lead.clicked_at;
    if (joinedAt && (!current.joinedAt || joinedAt < current.joinedAt)) current.joinedAt = joinedAt;
  }

  const result = new Map<string, LandingPageCustomerActivity[]>();
  for (const [key, activity] of activityByCustomerAndPage) {
    const customerId = key.slice(0, key.lastIndexOf("|"));
    const list = result.get(customerId) ?? [];
    list.push(activity);
    result.set(customerId, list);
  }
  return result;
}
