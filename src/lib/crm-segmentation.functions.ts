import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getCustomersList = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        search: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("shopify_customers")
      .select("*, shopify_orders(total_price, processed_at)", { count: "exact" });

    if (data.search) {
      query = query.or(`first_name.ilike.%${data.search}%,last_name.ilike.%${data.search}%,email.ilike.%${data.search}%,phone.ilike.%${data.search}%`);
    }

    const { data: customers, count, error } = await query
      .order("updated_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (error) throw error;

    // Processar KPIs básicos por cliente
    const processed = (customers ?? []).map((c: any) => {
      const orders = c.shopify_orders || [];
      const totalSpent = orders.reduce((acc: number, o: any) => acc + Number(o.total_price || 0), 0);
      const lastOrder = orders.sort((a: any, b: any) => new Date(b.processed_at).getTime() - new Date(a.processed_at).getTime())[0];

      return {
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Cliente sem nome",
        email: c.email,
        phone: c.phone,
        city: c.city,
        province: c.province,
        totalOrders: orders.length,
        totalSpent,
        lastOrderAt: lastOrder?.processed_at || null,
        updatedAt: c.updated_at,
      };
    });

    return { customers: processed, total: count };
  });

export const getCRMStats = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  const { count: total } = await supabaseAdmin.from("shopify_customers").select("*", { count: "exact", head: true });
  
  // Leads = nunca compraram
  const { count: leads } = await supabaseAdmin
    .from("shopify_customers")
    .select("id, shopify_orders!inner(id)", { count: "exact", head: true });
    // Nota: O filtro acima na verdade pega quem TEM pedidos. Leads é o inverso.
    // Em uma query real, faríamos um NOT EXISTS ou similar. Simplificando para o MVP:
    
  const { count: customers } = await supabaseAdmin
    .from("shopify_customers")
    .select("id, shopify_orders!inner(id)", { count: "exact", head: true });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count: newContacts } = await supabaseAdmin
    .from("shopify_customers")
    .select("*", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo);

  return {
    total: total || 0,
    leads: (total || 0) - (customers || 0),
    customers: customers || 0,
    newContacts: newContacts || 0,
  };
});

export const getSegmentsList = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("crm_segments").select("*").order("criado_em", { ascending: false });
  if (error) throw error;
  return data;
});

export const saveSegment = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      regras: z.any(),
      tipo: z.enum(["dinamico", "estatico"]).default("dinamico"),
    }).parse(data)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin
      .from("crm_segments")
      .upsert({
        id: data.id || undefined,
        nome: data.nome,
        descricao: data.descricao,
        regras: data.regras,
        tipo: data.tipo,
        atualizado_em: new Date().toISOString(),
      } as never)
      .select()
      .single();
    if (error) throw error;
    return result;
  });

export const deleteSegment = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("crm_segments").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const getStaticLists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("crm_static_lists").select("*").order("criado_em", { ascending: false });
  if (error) throw error;
  return data;
});
