
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const addTagToCustomers = createServerFn({ method: "POST" })
  .validator((data: unknown) => 
    z.object({
      customerIds: z.array(z.string()),
      tag: z.string().min(1)
    }).parse(data)
  )
  .handler(async ({ data: { customerIds, tag } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Buscar clientes para pegar tags atuais
    const { data: customers } = await supabaseAdmin
      .from("shopify_customers")
      .select("id, tags")
      .in("id", customerIds);
      
    if (!customers) return { success: false, error: "Clientes não encontrados" };

    const updates = customers.map(c => {
      const currentTags = Array.isArray(c.tags) ? c.tags : [];
      if (currentTags.includes(tag)) return null;
      return {
        id: c.id,
        tags: [...currentTags, tag],
        updated_at: new Date().toISOString()
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      const { error } = await supabaseAdmin
        .from("shopify_customers")
        .upsert(updates as any);
      
      if (error) throw error;
    }

    return { success: true, count: updates.length };
  });
