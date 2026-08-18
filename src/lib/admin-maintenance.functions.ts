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
