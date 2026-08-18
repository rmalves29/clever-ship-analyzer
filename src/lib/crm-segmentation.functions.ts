import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getCustomersList = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        search: z.string().optional(),
        segmentId: z.string().uuid().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Buscar regras do segmento se aplicável
    let segmentRules: any = null;
    if (data.segmentId) {
      const { data: segment } = await supabaseAdmin
        .from("crm_segments")
        .select("regras")
        .eq("id", data.segmentId)
        .single();
      segmentRules = segment?.regras;
    }

    // 2. Buscar IDs de clientes que possuem pedidos (para filtros de Leads/Clientes)
    const { data: ordersData } = await supabaseAdmin
      .from("shopify_orders")
      .select("customer_id");
    const customersWithOrdersSet = new Set(ordersData?.map(o => String(o.customer_id)).filter(id => id && id !== 'null'));
    const customersWithOrdersList = Array.from(customersWithOrdersSet);

    // 3. Construir query base
    let query = supabaseAdmin
      .from("shopify_customers")
      .select("*", { count: "exact" }) as any;

    // 4. Aplicar filtros baseados em regras
    if (segmentRules?.groups) {
      for (const group of segmentRules.groups) {
        for (const condition of group.conditions) {
          const { field, operator, value } = condition;
          const val = value;

          if (field === "cidade") {
            if (operator === "eq") query = query.eq("city", val);
            else if (operator === "neq") query = query.neq("city", val);
            else if (operator === "contains") query = query.ilike("city", `%${val}%`);
          } else if (field === "estado") {
            if (operator === "eq") query = query.eq("province", val);
            else if (operator === "neq") query = query.neq("province", val);
          } else if (field === "customer_tag") {
            if (operator === "contains") query = query.contains("tags", [val]);
            else if (operator === "not_contains") query = query.not("tags", "cs", `{${val}}`);
            else if (operator === "eq") query = query.eq("tags", `{${val}}`);
          } else if (field === "status_pagamento") {
            // Filtrar clientes que possuem pelo menos um pedido com este status financeiro
            const { data: customersWithStatus } = await supabaseAdmin
              .from("shopify_orders")
              .select("customer_id")
              .eq("financial_status", val);
            
            const customerIds = Array.from(new Set(customersWithStatus?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));
            
            if (operator === "eq") {
              if (customerIds.length > 0) {
                query = query.in("id", customerIds);
              } else {
                // Se nenhum cliente tem esse status, a query não deve retornar nada para esse filtro 'eq'
                query = query.eq("id", "00000000-0000-0000-0000-000000000000");
              }
            } else if (operator === "neq") {
              if (customerIds.length > 0) {
                query = query.not("id", "in", `(${customerIds.join(",")})`);
              }
            }
          } else if (field === "total_pedidos" || field === "recorrencia") {
            const numVal = Number(val);
            // LEADS: total_pedidos == 0
            if (field === "total_pedidos" && operator === "eq" && numVal === 0) {
              if (customersWithOrdersList.length > 0) {
                query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
              }
            } 
            // CLIENTES COM PEDIDOS: total_pedidos > 0 ou recorrencia
            else if (
              (field === "total_pedidos" && (operator === "gt" || operator === "gte") && numVal >= 0) || 
              field === "recorrencia"
            ) {
              if (customersWithOrdersList.length > 0) {
                query = query.in("id", customersWithOrdersList);
              } else {
                return { customers: [], total: 0 };
              }
            }
          } else if (field === "rfm_segment") {
            if (operator === "eq") query = query.eq("rfm_segment", val);
            else if (operator === "neq") query = query.neq("rfm_segment", val);
          } else if (field === "perfil") {
            if (val === "carrinho") {
              if (operator === "eq") {
                query = query.or('tags.cs.{"Carrinho Abandonado"},tags.cs.{"Checkout"},tags.cs.{"CAR24"}');
              }
              else if (operator === "neq") {
                query = query.not("tags", "cs", "{\"Carrinho Abandonado\"}").not("tags", "cs", "{\"Checkout\"}");
              }
            } else if (val === "lead") {
            // Leads: clientes sem pedidos e que NÃO são carrinhos abandonados
              if (operator === "eq") {
                if (customersWithOrdersList.length > 0) {
                  query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
                }
                query = query.not("tags", "cs", "{\"Carrinho Abandonado\"}").not("tags", "cs", "{\"Checkout\"}").not("tags", "cs", "{\"CAR24\"}");
              }
            } else if (val === "primeira_compra") {
              // Clientes com exatamente 1 pedido
              const { data: customerOrderCounts } = await supabaseAdmin
                .from("shopify_orders")
                .select("customer_id");
              
              const counts: Record<string, number> = {};
              customerOrderCounts?.forEach(o => {
                const cid = String(o.customer_id);
                counts[cid] = (counts[cid] || 0) + 1;
              });
              
              const firstTimeBuyers = Object.keys(counts).filter(cid => counts[cid] === 1);
              
              if (operator === "eq") {
                if (firstTimeBuyers.length > 0) query = query.in("id", firstTimeBuyers);
                else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
              }
            } else if (val === "acesso_sem_compra") {
              // Leads (sem pedidos) que não são checkouts abandonados
              if (operator === "eq") {
                if (customersWithOrdersList.length > 0) {
                  query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
                }
                query = query.not("tags", "cs", "{\"Carrinho Abandonado\"}").not("tags", "cs", "{\"Checkout\"}").not("tags", "cs", "{\"CAR24\"}");
              }
            }
          } else if (field === "data_pedido_hoje") {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const { data: todaysOrders } = await supabaseAdmin
              .from("shopify_orders")
              .select("customer_id")
              .gte("processed_at", today.toISOString())
              .lt("processed_at", tomorrow.toISOString());
            
            const customerIds = Array.from(new Set(todaysOrders?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));
            
            if (val === "sim") {
              if (customerIds.length > 0) query = query.in("id", customerIds);
              else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
            }
          } else if (field === "data_pedido_24h") {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const { data: recentOrders } = await supabaseAdmin
              .from("shopify_orders")
              .select("customer_id")
              .gte("processed_at", twentyFourHoursAgo.toISOString());
            
            const customerIds = Array.from(new Set(recentOrders?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));
            
            if (val === "sim") {
              if (customerIds.length > 0) query = query.in("id", customerIds);
              else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
            }
          } else if (field === "data_envio_hoje") {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const { data: todaysFulfillments } = await supabaseAdmin
              .from("shopify_fulfillments")
              .select("order_id")
              .gte("created_at", today.toISOString())
              .lt("created_at", tomorrow.toISOString());
            
            const orderIds = todaysFulfillments?.map(f => f.order_id) || [];
            
            if (orderIds.length > 0) {
              const { data: ordersWithCustomers } = await supabaseAdmin
              .from("shopify_orders")
              .select("customer_id")
              .in("id", orderIds.filter((id): id is string => id !== null));
              
              const customerIds = Array.from(new Set(ordersWithCustomers?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));
              
              if (val === "sim") {
                if (customerIds.length > 0) query = query.in("id", customerIds);
                else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
              }
            } else if (val === "sim") {
              query = query.eq("id", "00000000-0000-0000-0000-000000000000");
            }
          } else if (field === "acesso_sem_compra") {
            if (operator === "eq") {
              if (customersWithOrdersList.length > 0) {
                query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
              }
              query = query.not("tags", "cs", "{\"Carrinho Abandonado\"}").not("tags", "cs", "{\"Checkout\"}").not("tags", "cs", "{\"CAR24\"}");
            }
          }
        }
      }
    }

    if (data.search) {
      query = query.or(`first_name.ilike.%${data.search}%,last_name.ilike.%${data.search}%,email.ilike.%${data.search}%,phone.ilike.%${data.search}%`);
    }

    const { data: customers, count, error } = await query
      .order("updated_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (error) throw error;

    const customerIds = (customers as any[])?.map((c: any) => c.id) || [];
    let customersWithOrders: any[] = ((customers as any[]) || []).map((c: any) => ({ ...c, shopify_orders: [] }));

    if (customerIds.length > 0) {
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from("shopify_orders")
        .select("customer_id, total_price, processed_at")
        .in("customer_id", customerIds);

      if (!ordersError && orders) {
        customersWithOrders = ((customers as any[]) || []).map((c: any) => ({
          ...c,
          shopify_orders: orders.filter(o => o.customer_id === c.id)
        }));
      }
    }

    // Processar KPIs básicos por cliente
    const processed = (customersWithOrders ?? []).map((c: any) => {
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
        rfmSegment: c.rfm_segment,
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
  
  // Contagem de leads e clientes de forma mais direta para evitar subqueries de agregação
  // Clientes: Pelo menos um pedido
  const { count: customersCount } = await supabaseAdmin
    .from("shopify_orders")
    .select("customer_id", { count: "exact", head: true });
    
  // Nota: A contagem exata de clientes únicos pode ser complexa sem subqueries, 
  // mas aqui o objetivo é o total de contatos que compraram.
  // Vamos usar uma abordagem mais segura:
  const { data: uniqueCustomers } = await supabaseAdmin
    .from("shopify_orders")
    .select("customer_id");
  
  const uniqueCustomerIds = new Set(uniqueCustomers?.map(o => String(o.customer_id)).filter(id => id && id !== 'null'));
  const customers = uniqueCustomerIds.size;

  // Leads que são na verdade carrinhos abandonados (com a tag específica)
  const { count: abandonedCount } = await supabaseAdmin
    .from("shopify_customers")
    .select("*", { count: "exact", head: true })
    .or('tags.cs.{"Carrinho Abandonado"},tags.cs.{"CAR24"}');


  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count: newContacts } = await supabaseAdmin
    .from("shopify_customers")
    .select("*", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo);

  return {
    total: total || 0,
    leads: Math.max(0, (total || 0) - (customers || 0) - (abandonedCount || 0)),
    customers: customers || 0,
    abandoned: abandonedCount || 0,
    newContacts: newContacts || 0,
  };
});

export const getSegmentsList = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: segments, error } = await supabaseAdmin.from("crm_segments").select("*").order("criado_em", { ascending: false });
  if (error) throw error;

  const { data: ordersData } = await supabaseAdmin.from("shopify_orders").select("customer_id");
  const customersWithOrdersList = Array.from(new Set(ordersData?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));

  // Para cada segmento, calcular a contagem de membros
  const segmentsWithCount = await Promise.all((segments || []).map(async (seg) => {
    let query = supabaseAdmin.from("shopify_customers").select("*", { count: "exact", head: true });
    
    if (seg.regras) {
      const rules = seg.regras as any;
      if (rules.groups) {
        for (const group of rules.groups) {
          for (const condition of group.conditions) {
            const val = condition.value;
            const op = condition.operator;
            const field = condition.field;
            
            if (field === "cidade") {
              if (op === "eq") query = query.eq("city", val);
              else if (op === "neq") query = query.neq("city", val);
              else if (op === "contains") query = query.ilike("city", `%${val}%`);
            } else if (field === "estado") {
              if (op === "eq") query = query.eq("province", val);
              else if (op === "neq") query = query.neq("province", val);
            } else if (field === "status_pagamento") {
              const { data: customersWithStatus } = await supabaseAdmin
                .from("shopify_orders")
                .select("customer_id")
                .eq("financial_status", val);
              const customerIds = Array.from(new Set(customersWithStatus?.map(o => String(o.customer_id)).filter(Boolean)));
              if (op === "eq") {
                if (customerIds.length > 0) query = query.in("id", customerIds);
                else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
              } else if (op === "neq" && customerIds.length > 0) {
                query = query.not("id", "in", `(${customerIds.join(",")})`);
              }
            } else if (field === "total_pedidos" || field === "recorrencia") {
              const numVal = Number(val);
              if (field === "total_pedidos" && op === "eq" && numVal === 0) {
                if (customersWithOrdersList.length > 0) query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
              } else if (customersWithOrdersList.length > 0) {
                query = query.in("id", customersWithOrdersList);
              } else {
                query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // Nenhum cliente se não há pedidos
              }
            } else if (field === "rfm_segment") {
              if (op === "eq") query = query.eq("rfm_segment", val);
              else if (op === "neq") query = query.neq("rfm_segment", val);
            } else if (field === "perfil") {
              if (val === "carrinho") {
                if (op === "eq") query = query.or('tags.cs.{"Carrinho Abandonado"},tags.cs.{"Checkout"},tags.cs.{"CAR24"}');
                else if (op === "neq") query = query.not("tags", "cs", "{\"Carrinho Abandonado\"}").not("tags", "cs", "{\"Checkout\"}");
              } else if (val === "lead") {
                if (op === "eq") {
                  if (customersWithOrdersList.length > 0) query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
                  query = query.not("tags", "cs", "{\"Carrinho Abandonado\"}").not("tags", "cs", "{\"Checkout\"}").not("tags", "cs", "{\"CAR24\"}");
                }
              } else if (val === "primeira_compra") {
                const { data: customerOrderCounts } = await supabaseAdmin.from("shopify_orders").select("customer_id");
                const counts: Record<string, number> = {};
                customerOrderCounts?.forEach(o => { const cid = String(o.customer_id); counts[cid] = (counts[cid] || 0) + 1; });
                const firstTimeBuyers = Object.keys(counts).filter(cid => counts[cid] === 1);
                if (op === "eq") {
                  if (firstTimeBuyers.length > 0) query = query.in("id", firstTimeBuyers);
                  else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
                }
              } else if (val === "acesso_sem_compra") {
                if (op === "eq") {
                  if (customersWithOrdersList.length > 0) query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
                  query = query.not("tags", "cs", "{\"Carrinho Abandonado\"}").not("tags", "cs", "{\"Checkout\"}").not("tags", "cs", "{\"CAR24\"}");
                }
              }
            } else if (field === "data_pedido_hoje") {
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
              const { data: todaysOrders } = await supabaseAdmin.from("shopify_orders").select("customer_id").gte("processed_at", today.toISOString()).lt("processed_at", tomorrow.toISOString());
              const customerIds = Array.from(new Set(todaysOrders?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));
              if (val === "sim") {
                if (customerIds.length > 0) query = query.in("id", customerIds);
                else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
              }
            } else if (field === "data_pedido_24h") {
              const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
              const { data: recentOrders } = await supabaseAdmin.from("shopify_orders").select("customer_id").gte("processed_at", twentyFourHoursAgo.toISOString());
              const customerIds = Array.from(new Set(recentOrders?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));
              if (val === "sim") {
                if (customerIds.length > 0) query = query.in("id", customerIds);
                else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
              }
            } else if (field === "data_envio_hoje") {
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
              const { data: todaysFulfillments } = await supabaseAdmin.from("shopify_fulfillments").select("order_id").gte("created_at", today.toISOString()).lt("created_at", tomorrow.toISOString());
              const orderIds = todaysFulfillments?.map(f => f.order_id) || [];
              if (orderIds.length > 0) {
                const { data: ordersWithCustomers } = await supabaseAdmin.from("shopify_orders").select("customer_id").in("id", orderIds.filter((id): id is string => id !== null));
                const customerIds = Array.from(new Set(ordersWithCustomers?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));
                if (val === "sim") {
                  if (customerIds.length > 0) query = query.in("id", customerIds);
                  else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
                }
              } else if (val === "sim") {
                query = query.eq("id", "00000000-0000-0000-0000-000000000000");
              }
            } else if (field === "acesso_sem_compra") {
              if (customersWithOrdersList.length > 0) query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
              query = query.not("tags", "cs", "{\"Carrinho Abandonado\"}").not("tags", "cs", "{\"Checkout\"}").not("tags", "cs", "{\"CAR24\"}");
            }
          }
        }
      }
    }
    
    const { count } = await query;
    return { ...seg, memberCount: count || 0 };
  }));

  return segmentsWithCount;
});

export const saveSegment = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      regras: z.any(),
      // 'tipo' column doesn't exist in DB, it's inferred or we skip it for now
    }).parse(data)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const payload: any = {
      nome: data.nome,
      descricao: data.descricao || null,
      regras: data.regras,
      atualizado_em: new Date().toISOString(),
    };

    if (data.id) {
      payload.id = data.id;
    } else {
      payload.criado_em = new Date().toISOString();
    }

    const { data: result, error } = await supabaseAdmin
      .from("crm_segments")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error("Error saving segment:", error);
      throw error;
    }
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

export const exportSegmentCustomers = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        segmentId: z.string().uuid().optional(),
        search: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let segmentRules: any = null;
    if (data.segmentId) {
      const { data: segment } = await supabaseAdmin
        .from("crm_segments")
        .select("regras")
        .eq("id", data.segmentId)
        .single();
      segmentRules = segment?.regras;
    }

    const { data: ordersData } = await supabaseAdmin
      .from("shopify_orders")
      .select("customer_id");
    const customersWithOrdersList = Array.from(new Set(ordersData?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));

    let query = supabaseAdmin.from("shopify_customers").select("*") as any;

    if (segmentRules?.groups) {
      for (const group of segmentRules.groups) {
        for (const condition of group.conditions) {
          const { field, operator, value } = condition;
          if (field === "cidade") {
            if (operator === "eq") query = query.eq("city", value);
            else if (operator === "neq") query = query.neq("city", value);
            else if (operator === "contains") query = query.ilike("city", `%${value}%`);
          } else if (field === "estado") {
            if (operator === "eq") query = query.eq("province", value);
            else if (operator === "neq") query = query.neq("province", value);
          } else if (field === "status_pagamento") {
            const { data: customersWithStatus } = await supabaseAdmin
              .from("shopify_orders")
              .select("customer_id")
              .eq("financial_status", value);
            const customerIds = Array.from(new Set(customersWithStatus?.map(o => String(o.customer_id)).filter(id => id && id !== 'null')));
            if (operator === "eq") {
              if (customerIds.length > 0) query = query.in("id", customerIds);
              else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
            } else if (operator === "neq" && customerIds.length > 0) {
              query = query.not("id", "in", `(${customerIds.join(",")})`);
            }
          } else if (field === "customer_tag") {
            if (operator === "contains") query = query.contains("tags", [value]);
          } else if (field === "total_pedidos" || field === "recorrencia") {
            const numVal = Number(value);
            if (field === "total_pedidos" && operator === "eq" && numVal === 0) {
              if (customersWithOrdersList.length > 0) query = query.not("id", "in", `(${customersWithOrdersList.join(",")})`);
            } else if (customersWithOrdersList.length > 0) {
              query = query.in("id", customersWithOrdersList);
            }
          } else if (field === "rfm_segment") {
            if (operator === "eq") query = query.eq("rfm_segment", value);
            else if (operator === "neq") query = query.neq("rfm_segment", value);
          }
        }
      }
    }

    if (data.search) {
      query = query.or(`first_name.ilike.%${data.search}%,last_name.ilike.%${data.search}%,email.ilike.%${data.search}%,phone.ilike.%${data.search}%`);
    }

    const { data: customers, error } = await query;
    if (error) throw error;

    // Buscar todos os pedidos para calcular totalSpent e totalOrders
    const customerIds = (customers as any[])?.map((c: any) => c.id) || [];
    let ordersMap: Record<string, any[]> = {};
    
    if (customerIds.length > 0) {
      const { data: allOrders } = await supabaseAdmin
        .from("shopify_orders")
        .select("customer_id, total_price")
        .in("customer_id", customerIds);
      
      (allOrders || []).forEach(o => {
        const cid = String(o.customer_id);
        if (cid && cid !== 'null') {
          if (!ordersMap[cid]) ordersMap[cid] = [];
          ordersMap[cid].push(o);
        }
      });
    }

    const rows = ((customers as any[]) || []).map((c: any) => {
      const cid = c.id ? String(c.id) : '';
      const orders = cid ? (ordersMap[cid] || []) : [];
      const totalSpent = orders.reduce((acc, o) => acc + Number(o.total_price || 0), 0);
      return {
        Nome: `${c.first_name || ""} ${c.last_name || ""}`.trim(),
        Email: c.email || "",
        Telefone: c.phone || "",
        Cidade: c.city || "",
        Estado: c.province || "",
        Pedidos: orders.length,
        TotalGasto: totalSpent.toFixed(2),
        DataCriacao: c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : ""
      };
    });

    if (rows.length === 0) return { csv: "" };

    const firstRow = rows[0];
    if (!firstRow) return { csv: "" };

    const headers = Object.keys(firstRow);
    const csvContent = [
      headers.join(","),
      ...rows.map((row: any) => headers.map(h => `"${String(row[h as keyof typeof row] || "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    return { csv: csvContent };
  });
