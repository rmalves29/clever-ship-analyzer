import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { validateSegmentRulesPayload } from "./crm-filter-catalog";
import { buildPurchaseMetricsIndex, customerMatchesSearch, type SegmentRules } from "./crm-segmentation-shared";
import { matchesAdvancedSegmentRules } from "./crm-product-segmentation";
import { CRM_SEGMENT_TEMPLATES, buildPersistedRulesFromTemplate } from "./crm-segment-templates";

async function getSegmentRules(segmentId?: string): Promise<SegmentRules | null> {
  if (!segmentId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("crm_segments").select("regras").eq("id", segmentId).single();
  if (error) throw error;
  return (data?.regras as SegmentRules | null) ?? null;
}

async function getListMemberIds(listId?: string): Promise<Set<string> | null> {
  if (!listId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("crm_list_members").select("customer_id").eq("lista_id", listId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.customer_id));
}

function updatedAtTime(value: string | null | undefined): number {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

const segmentRulesSchema = z.unknown().superRefine((value, ctx) => {
  const validation = validateSegmentRulesPayload(value);
  validation.errors.forEach((message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message }));
});

async function createRecommendedSegmentsInDatabase() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing, error: existingError } = await supabaseAdmin.from("crm_segments").select("nome");
  if (existingError) throw new Error(`Não foi possível verificar os segmentos existentes: ${existingError.message}`);

  const existingNames = new Set((existing ?? []).map((row) => String(row.nome).trim().toLocaleLowerCase("pt-BR")));
  const now = new Date().toISOString();
  const missing = CRM_SEGMENT_TEMPLATES.filter((template) => !existingNames.has(template.name.trim().toLocaleLowerCase("pt-BR")));

  if (missing.length === 0) {
    return { created: 0, skipped: CRM_SEGMENT_TEMPLATES.length, names: [] as string[] };
  }

  const rows = missing.map((template) => ({
    nome: template.name,
    descricao: template.description,
    regras: buildPersistedRulesFromTemplate(template),
    criado_em: now,
    atualizado_em: now,
  }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("crm_segments")
    .insert(rows as never)
    .select("id, nome");

  if (insertError) throw new Error(`Não foi possível criar os segmentos recomendados: ${insertError.message}`);

  return {
    created: inserted?.length ?? rows.length,
    skipped: CRM_SEGMENT_TEMPLATES.length - (inserted?.length ?? rows.length),
    names: (inserted ?? []).map((row) => String(row.nome)),
  };
}

async function getPaginatedBaseCustomers(data: {
  search?: string;
  limit: number;
  offset: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("shopify_customers")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(data.offset, data.offset + data.limit - 1);

  const search = data.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_\\]/g, (value) => `\\${value}`);
    query = query.or(
      [`first_name.ilike.%${escaped}%`, `last_name.ilike.%${escaped}%`, `email.ilike.%${escaped}%`, `phone.ilike.%${escaped}%`, `city.ilike.%${escaped}%`, `province.ilike.%${escaped}%`].join(","),
    );
  }

  const { data: customers, error, count } = await query;
  if (error) throw new Error(`Erro ao buscar contatos do CRM: ${error.message}`);

  const customerRows = (customers ?? []) as any[];
  const customerIds = customerRows.map((customer) => String(customer.id));
  const metricsByCustomer = new Map<string, ReturnType<typeof buildPurchaseMetricsIndex> extends Map<string, infer T> ? T : never>();

  if (customerIds.length > 0) {
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("shopify_orders")
      .select("id, customer_id, total_price, processed_at, created_at, financial_status, cancelled_at")
      .in("customer_id", customerIds);

    if (ordersError) throw new Error(`Erro ao buscar métricas dos contatos do CRM: ${ordersError.message}`);

    const orderRows = (orders ?? []).map((row: any) => ({
      id: String(row.id),
      customerId: String(row.customer_id),
      totalPrice: Number(row.total_price ?? 0),
      processedAt: String(row.processed_at ?? row.created_at ?? ""),
      financialStatus: row.financial_status,
      cancelledAt: row.cancelled_at,
    }));
    const built = buildPurchaseMetricsIndex(orderRows);
    for (const [customerId, metrics] of built) metricsByCustomer.set(customerId, metrics);
  }

  const mapped = customerRows.map((customer) => {
    const metrics = metricsByCustomer.get(String(customer.id)) ?? {
      validOrderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
    };
    return {
      id: customer.id,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Cliente sem nome",
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      city: customer.city ?? null,
      province: customer.province ?? null,
      rfmSegment: customer.rfm_segment ?? null,
      totalOrders: metrics.validOrderCount,
      totalSpent: metrics.totalSpent,
      lastOrderAt: metrics.lastOrderAt,
      tagsCustom: customer.tags_custom ?? [],
      updatedAt: customer.updated_at ?? null,
    };
  });

  return { customers: mapped, total: count ?? 0 };
}

export const getCustomersList = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({
    search: z.string().optional(),
    segmentId: z.string().uuid().optional(),
    listId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }).parse(data))
  .handler(async ({ data }) => {
    // Caminho comum do CRM: paginação real no banco. Segmentação avançada/listas continuam
    // usando o contexto analítico completo porque suas regras dependem de histórico e índices.
    if (!data.segmentId && !data.listId) {
      return getPaginatedBaseCustomers(data);
    }

    const { loadCRMSegmentationContext } = await import("./crm-segmentation.server");
    const [contexts, rules, listMemberIds] = await Promise.all([
      loadCRMSegmentationContext(),
      getSegmentRules(data.segmentId),
      getListMemberIds(data.listId),
    ]);
    const filtered = contexts
      .filter((context) => (listMemberIds ? listMemberIds.has(context.customer.id) : matchesAdvancedSegmentRules(context, rules)))
      .filter((context) => customerMatchesSearch(context, data.search))
      .sort((a, b) => updatedAtTime(b.customer.updated_at) - updatedAtTime(a.customer.updated_at));
    const total = filtered.length;
    const page = filtered.slice(data.offset, data.offset + data.limit);
    const customers = page.map(({ customer, metrics }) => ({
      id: customer.id,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Cliente sem nome",
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      city: customer.city ?? null,
      province: customer.province ?? null,
      rfmSegment: customer.rfm_segment ?? null,
      totalOrders: metrics.validOrderCount,
      totalSpent: metrics.totalSpent,
      lastOrderAt: metrics.lastOrderAt,
      tagsCustom: customer.tags_custom ?? [],
      updatedAt: customer.updated_at ?? null,
    }));
    return { customers, total };
  });

export const getCRMStats = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { loadCRMSegmentationContext } = await import("./crm-segmentation.server");
    const contexts = await loadCRMSegmentationContext();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86_400_000;
    const customers = contexts.filter((context) => context.metrics.validOrderCount > 0).length;
    const abandoned = contexts.filter((context) => context.abandonedCheckout).length;
    const leads = contexts.filter((context) => context.metrics.validOrderCount === 0 && !context.abandonedCheckout).length;
    const newContacts = contexts.filter((context) => {
      const created = context.customer.created_at ? new Date(context.customer.created_at).getTime() : 0;
      return Number.isFinite(created) && created >= thirtyDaysAgo && created <= now;
    }).length;
    return { total: contexts.length, leads, customers, abandoned, newContacts };
  });

export const getCRMFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCRMProductFilterOptionsBundle } = await import("./crm-segmentation.server");
    const PAGE_SIZE = 1000;
    const cities = new Set<string>();
    const customerTags = new Set<string>();
    const customTags = new Set<string>();
    const productOptionsPromise = loadCRMProductFilterOptionsBundle();

    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin
        .from("shopify_customers")
        .select("city, tags, tags_custom")
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const customer of data) {
        if (customer.city?.trim()) cities.add(customer.city.trim());
        for (const tag of customer.tags ?? []) if (tag?.trim()) customerTags.add(tag.trim());
        for (const tag of customer.tags_custom ?? []) if (tag?.trim()) customTags.add(tag.trim());
      }
      if (data.length < PAGE_SIZE) break;
    }

    const campaigns: Array<{ id: string; name: string }> = [];
    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_campaigns")
        .select("id, nome")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data as any[]) campaigns.push({ id: String(row.id), name: String(row.nome ?? "Campanha") });
      if (data.length < PAGE_SIZE) break;
    }

    const automations: Array<{ id: string; name: string }> = [];
    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_automations")
        .select("id, nome")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data as any[]) automations.push({ id: String(row.id), name: String(row.nome ?? "Automação") });
      if (data.length < PAGE_SIZE) break;
    }

    const productOptions = await productOptionsPromise;
    const { data: landingPageRows, error: landingPagesError } = await supabaseAdmin
      .from("landing_pages")
      .select("id, nome, slug")
      .order("criado_em", { ascending: false });
    if (landingPagesError) throw landingPagesError;
    const sortPt = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      cities: sortPt(cities),
      customerTags: sortPt(customerTags),
      customTags: sortPt(customTags),
      products: productOptions.products,
      productTypes: productOptions.productTypes,
      collections: productOptions.collections,
      campaigns,
      automations,
      landingPages: (landingPageRows ?? []).map((row) => ({ id: row.id, name: `${row.nome} · /lp/${row.slug}` })),
    };
  });

export const previewSegmentAudience = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({
    regras: segmentRulesSchema,
    sampleSize: z.number().int().min(0).max(10).default(5),
  }).parse(data))
  .handler(async ({ data }) => {
    const { loadCRMSegmentationContext } = await import("./crm-segmentation.server");
    const contexts = await loadCRMSegmentationContext();
    const rules = data.regras as SegmentRules;
    const included = contexts.filter((context) => matchesAdvancedSegmentRules(context, { ...rules, excludeGroups: [] }));
    const matched = included.filter((context) => matchesAdvancedSegmentRules(context, rules));
    const sample = matched.slice(0, data.sampleSize).map(({ customer }) => ({
      id: customer.id,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Cliente sem nome",
      email: customer.email ?? null,
    }));
    return {
      count: matched.length,
      includedCount: included.length,
      excludedCount: included.length - matched.length,
      totalContacts: contexts.length,
      sample,
    };
  });

export const getSegmentsList = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCRMSegmentationContext } = await import("./crm-segmentation.server");
    const [{ data: segments, error }, contexts] = await Promise.all([
      supabaseAdmin.from("crm_segments").select("*").order("criado_em", { ascending: false }),
      loadCRMSegmentationContext(),
    ]);
    if (error) throw error;
    return (segments ?? []).map((segment) => ({
      ...segment,
      memberCount: contexts.filter((context) => matchesAdvancedSegmentRules(context, segment.regras as SegmentRules)).length,
    }));
  });

/** Lista leve (id + nome) para seletores. Não calcula memberCount, que é caro e fazia os
 *  seletores de automação/campanha ficarem eternamente vazios. */
export const getSegmentOptions = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("crm_segments")
      .select("id, nome")
      .order("criado_em", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; nome: string }>;
  });



export const createRecommendedSegments = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => createRecommendedSegmentsInDatabase());

export const saveSegment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({
    id: z.string().uuid().optional(),
    nome: z.string().trim().min(1),
    descricao: z.string().optional(),
    regras: segmentRulesSchema,
    tipo: z.string().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    // Compatibilidade com o botão legado "Criar Segmentos Sugeridos" da tela de CRM.
    // Ele chama saveSegment várias vezes com tipo="dinamico". Em vez de persistir a lista
    // antiga, a primeira chamada cria a biblioteca comercial atual inteira de forma idempotente;
    // as chamadas seguintes apenas detectam que os modelos já existem.
    if (!data.id && data.tipo === "dinamico") {
      return createRecommendedSegmentsInDatabase();
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    if (data.id) {
      const { data: result, error } = await supabaseAdmin
        .from("crm_segments")
        .update({
          nome: data.nome,
          descricao: data.descricao || null,
          regras: data.regras,
          atualizado_em: now,
        } as never)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(`Não foi possível atualizar o segmento: ${error.message}`);
      if (!result) throw new Error("O segmento não foi encontrado após a atualização.");
      return result;
    }

    const { data: result, error } = await supabaseAdmin
      .from("crm_segments")
      .insert({
        nome: data.nome,
        descricao: data.descricao || null,
        regras: data.regras,
        criado_em: now,
        atualizado_em: now,
      } as never)
      .select()
      .single();

    if (error) throw new Error(`Não foi possível criar o segmento: ${error.message}`);
    if (!result) throw new Error("O segmento não foi retornado pelo banco após a criação.");
    return result;
  });

export const deleteSegment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("crm_segments").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const exportSegmentCustomers = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({
    segmentId: z.string().uuid().optional(),
    listId: z.string().uuid().optional(),
    search: z.string().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { loadCRMSegmentationContext } = await import("./crm-segmentation.server");
    const [contexts, rules, listMemberIds] = await Promise.all([
      loadCRMSegmentationContext(),
      getSegmentRules(data.segmentId),
      getListMemberIds(data.listId),
    ]);
    const rows = contexts
      .filter((context) => (listMemberIds ? listMemberIds.has(context.customer.id) : matchesAdvancedSegmentRules(context, rules)))
      .filter((context) => customerMatchesSearch(context, data.search))
      .sort((a, b) => updatedAtTime(b.customer.updated_at) - updatedAtTime(a.customer.updated_at))
      .map(({ customer, metrics }) => ({
        Nome: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
        Email: customer.email || "",
        Telefone: customer.phone || "",
        Cidade: customer.city || "",
        Estado: customer.province || "",
        PedidosValidos: metrics.validOrderCount,
        TotalGastoValido: metrics.totalSpent.toFixed(2),
        TicketMedioValido: metrics.averageTicket.toFixed(2),
        PrimeiraCompraValida: metrics.firstOrderAt ? new Date(metrics.firstOrderAt).toLocaleDateString("pt-BR") : "",
        UltimaCompraValida: metrics.lastOrderAt ? new Date(metrics.lastOrderAt).toLocaleDateString("pt-BR") : "",
        DataCriacao: customer.created_at ? new Date(customer.created_at).toLocaleDateString("pt-BR") : "",
      }));
    if (rows.length === 0) return { csv: "" };
    const headers = Object.keys(rows[0]!);
    const csvContent = [
      headers.join(","),
      ...rows.map((row: any) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    return { csv: csvContent };
  });
