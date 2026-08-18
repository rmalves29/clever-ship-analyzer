import { createServerFn } from "@tanstack/react-start";

/**
 * Script to identify and fix "Leads" that actually have abandoned checkouts or pending payments.
 * It cross-references customers with their orders and updates their tags/profile.
 */
export const identifyAbandonedCheckouts = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // 1. Find all customers with EXPIRED, VOIDED or PENDING orders (common for abandoned/failed checkouts)
    const { data: expiredOrders, error: orderError } = await supabaseAdmin
      .from("shopify_orders")
      .select("customer_id, financial_status, phone")
      .in("financial_status", ["EXPIRED", "VOIDED", "PENDING", "AUTHORIZED"]);
      
    if (orderError) throw orderError;
    
    const customerIdsWithExpired = Array.from(new Set(expiredOrders?.map(o => o.customer_id).filter(Boolean) as string[]));
    
    if (customerIdsWithExpired.length === 0) {
      return { success: true, updatedCount: 0, message: "Nenhum carrinho abandonado (EXPIRED) encontrado." };
    }

    // 2. Fetch customer data for these IDs
    const { data: customers, error: custError } = await (supabaseAdmin
      .from("shopify_customers")
      .select("id, tags, phone") as any)
      .in("id", customerIdsWithExpired);

    if (custError) throw custError;

    let updatedCount = 0;
    const tagToAdd = "Carrinho Abandonado";

    for (const customer of (customers || [])) {
      const currentTags = Array.isArray(customer.tags) ? customer.tags : [];
      const hasTag = currentTags.includes(tagToAdd);
      
      // Also check if we can fix the phone number while we are at it
      let newPhone = customer.phone;
      if (!newPhone || newPhone === "") {
        const orderWithPhone = expiredOrders.find(o => o.customer_id === customer.id && o.phone);
        if (orderWithPhone?.phone) {
          const raw = orderWithPhone.phone;
          const cleaned = raw.replace(/\D/g, "");
          if (cleaned.length === 10 || cleaned.length === 11) {
            newPhone = `+55${cleaned}`;
          } else if (cleaned.length > 11) {
            newPhone = `+${cleaned}`;
          } else {
            newPhone = raw;
          }
        }
      }

      if (!hasTag || (newPhone && newPhone !== customer.phone)) {
        const updateData: any = {
          updated_at: new Date().toISOString()
        };
        
        if (!hasTag) {
          updateData.tags = [...currentTags, tagToAdd];
        }
        
        if (newPhone && newPhone !== customer.phone) {
          updateData.phone = newPhone;
        }

        await supabaseAdmin
          .from("shopify_customers")
          .update(updateData)
          .eq("id", customer.id);
          
        updatedCount++;
      }
    }
    
    return { 
      success: true, 
      updatedCount, 
      message: `${updatedCount} perfis atualizados para 'Carrinho Abandonado' e telefones corrigidos.` 
    };
  });
