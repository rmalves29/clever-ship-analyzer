import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const updateCustomerTags = createServerFn({ method: "POST" })
  .validator((data: unknown) => 
    z.object({ 
      customerId: z.string(),
      tags: z.array(z.string())
    }).parse(data)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { error } = await supabaseAdmin
      .from("shopify_customers")
      .update({ tags_custom: data.tags } as any)
      .eq("id", data.customerId);

      
    if (error) throw error;
    
    return { success: true };
  });