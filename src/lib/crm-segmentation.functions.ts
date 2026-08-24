import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { validateSegmentRulesPayload } from "./crm-filter-catalog";
import { customerMatchesSearch, type SegmentRules } from "./crm-segmentation-shared";
import { matchesAdvancedSegmentRules } from "./crm-product-segmentation";

async function getSegmentRules(segmentId?: string): Promise<SegmentRules | null> {
  if (!segmentId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("crm_segments")
    .select("regras")
    .eq("id", segmentId)
    .single();
  if (error) throw error;
  return (data?.regras as SegmentRules | null) ?? null;
}

function updatedAtTime(value: string | null | undefined): number {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

const segmentRulesSchema = z.unknown().superRefine((value, ctx) => {
  const validation = validateSegmentRulesPayload(value);
  validation.errors.forEach((message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message }));
});

export const getCustomersList = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({
      search: z.string().optional(),
      segmentId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { loadCRMSegmentationContext } = await import("./crm-segmentation.server");
    const [contexts, rules] = await Promise.all([
      loadCRMSegmentationContext(),
      getSegmentRules(data.segmentId),
    ]);

    const filtered = contexts
      .filter((context) => matchesAdvancedSegmentRules(context, rules))
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
    const leads = contexts.filter(
      (context) => context.metrics.validOrderCount === 0 && !context.abandonedCheckout,
    ).length;
    const newContacts = contexts.filter((context) => {
      const created = context.customer.created_at ? new Date(context.customer.created_at).getTime() : 0;
      return Number.isFinite(created) && created >= thirtyDaysAgo && created <= now;
    }).length;

    return {
      total: contexts.length,
      leads,
      customers,
      abandoned,
      newContacts,
    };
  });

export const getCRMFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCRMProductFilterOptions } = await import("./crm-segmentation.server");
    const PAGE_SIZE = 1000;
    const cities = new Set<string>();
    const customerTags = new Set<string>();
    const customTags = new Set<string>();
    const productsPromise = loadCRMProductFilterOptions();

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

    const products = await productsPromise;
    const sortPt = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      cities: sortPt(cities),
      customerTags: sortPt(customerTags),
      customTags: sortPt(customTags),
      products,
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
      memberCount: contexts.filter((context) =>
        matchesAdvancedSegmentRules(context, segment.regras as SegmentRules),
      ).length,
    }));
  });

export const saveSegment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nome: z.string().trim().min(1),
      descricao: z.string().optional(),
      regras: segmentRulesSchema,
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = {
      nome: data.nome,
      descricao: data.descricao || null,
      regras: data.regras,
      atualizado_em: new Date().toISOString(),
    };

    if (data.id) payload.id = data.id;
    else payload.criado_em = new Date().toISOString();

    const { data: result, error } = await supabaseAdmin
      .from("crm_segments")
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
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

export const getStaticLists = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("crm_static_lists")
      .select("*")
      .order("criado_em", { ascending: false });
    if (error) throw error;
    return data;
  });

export const exportSegmentCustomers = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({
      segmentId: z.string().uuid().optional(),
      search: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { loadCRMSegmentationContext } = await import("./crm-segmentation.server");
    const [contexts, rules] = await Promise.all([
      loadCRMSegmentationContext(),
      getSegmentRules(data.segmentId),
    ]);

    const rows = contexts
      .filter((context) => matchesAdvancedSegmentRules(context, rules))
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
      ...rows.map((row: any) =>
        headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    return { csv: csvContent };
  });