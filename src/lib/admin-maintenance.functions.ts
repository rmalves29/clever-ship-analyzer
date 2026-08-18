import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Funções administrativas para correção de dados e manutenção
 */

export const fixCustomerPhone = createServerFn({ method: "POST" })
  .validator((data: unknown) => 
    z.object({ 
      email: z.string().email(),
      phone: z.string()
    }).parse(data)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    console.log(`Fixing phone for customer ${data.email} to ${data.phone}`);
    
    // 1. Update in shopify_customers
    const { error: custError } = await supabaseAdmin
      .from("shopify_customers")
      .update({ phone: data.phone })
      .eq("email", data.email.toLowerCase());
      
    if (custError) {
      console.error("Error updating customer phone:", custError);
    }
    
    // 2. Update in shopify_orders (for consistency)
    const { error: orderError } = await supabaseAdmin
      .from("shopify_orders")
      .update({ phone: data.phone })
      .eq("email", data.email.toLowerCase());

    if (orderError) {
      console.error("Error updating orders phone:", orderError);
    }
    
    return { 
      success: !custError, 
      error: custError?.message || orderError?.message 
    };
  });

export const deepSyncCustomer = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ customerId: z.string() }).parse(data))
  .handler(async ({ data: { customerId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shopifyGraphQL } = await import("./shopify.server");

    // Fetch deep details for a specific customer
    const query = `
      query getCustomer($id: ID!) {
        customer(id: $id) {
          id email firstName lastName phone
          defaultAddress { phone }
          addresses(first: 10) { phone }
        }
      }
    `;

    try {
      // Shopify IDs usually look like gid://shopify/Customer/123456
      const fullShopifyId = customerId.includes('gid://') ? customerId : `gid://shopify/Customer/${customerId}`;
      const result = await shopifyGraphQL(query, { id: fullShopifyId });
      
      if (!result?.customer) return { success: false, error: "Customer not found in Shopify" };
      
      const c = result.customer;
      const phone = c.phone || 
                    c.defaultAddress?.phone || 
                    c.addresses?.find((a: any) => a.phone)?.phone || 
                    null;
      
      const email = c.email?.toLowerCase();
      const internalId = email ? `email:${email}` : `id:${c.id.split('/').pop()}`;

      await supabaseAdmin.from("shopify_customers").upsert({
        id: internalId,
        email,
        first_name: c.firstName,
        last_name: c.lastName,
        phone,
        updated_at: new Date().toISOString()
      });

      return { success: true, phone };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

export const checkSpecificAbandonedCheckout = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ query: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shopifyGraphQL } = await import("./shopify.server");

    // 1. Search Shopify for orders/checkouts by name or email
    const shopifyQuery = `
      query ($query: String) {
        orders(first: 5, query: $query) {
          edges {
            node {
              id
              name
              displayFinancialStatus
              displayFulfillmentStatus
              createdAt
              updatedAt
              email
              phone
              shippingAddress { phone firstName lastName city province country }
              customer { id email firstName lastName phone }
            }
          }
        }
      }
    `;

    try {
      const result = await shopifyGraphQL(shopifyQuery, { query: data.query });
      const orders = result?.orders?.edges?.map((e: any) => e.node) || [];
      
      if (orders.length === 0) {
        return { success: false, message: "Nenhum pedido/checkout encontrado na Shopify para esta busca." };
      }

      let updatedCount = 0;
      for (const order of orders) {
        const email = order.email?.toLowerCase();
        const customerId = email ? `email:${email}` : (order.customer?.id ? `id:${order.customer.id.split('/').pop()}` : null);
        
        if (!customerId) continue;

        const phone = order.phone || order.shippingAddress?.phone || order.customer?.phone || null;
        const financialStatus = order.displayFinancialStatus;
        
        // Upsert customer first
        const { data: existingCust } = await supabaseAdmin
          .from("shopify_customers")
          .select("tags, phone")
          .eq("id", customerId)
          .maybeSingle();

        const currentTags = existingCust?.tags || [];
        const isAbandoned = ["EXPIRED", "VOIDED", "PENDING", "AUTHORIZED"].includes(financialStatus);
        
        const newTags = new Set([...currentTags]);
        if (isAbandoned) {
          newTags.add("Carrinho Abandonado");
          newTags.add("Checkout");
        }

        await supabaseAdmin.from("shopify_customers").upsert({
          id: customerId,
          email,
          first_name: order.shippingAddress?.firstName || order.customer?.firstName || null,
          last_name: order.shippingAddress?.lastName || order.customer?.lastName || null,
          phone: phone,
          tags: Array.from(newTags),
          updated_at: new Date().toISOString()
        });

        // Upsert order
        await supabaseAdmin.from("shopify_orders").upsert({
          id: order.id,
          order_number: order.name,
          customer_id: customerId,
          email,
          phone: order.phone,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
          financial_status: financialStatus,
          fulfillment_status: order.displayFulfillmentStatus,
          city: order.shippingAddress?.city,
          province: order.shippingAddress?.province,
          country: order.shippingAddress?.country,
          raw_data: order
        });
        
        updatedCount++;
      }

      return { success: true, message: `Sincronizados ${updatedCount} registros para '${data.query}'.` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
