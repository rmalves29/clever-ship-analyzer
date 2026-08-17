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
