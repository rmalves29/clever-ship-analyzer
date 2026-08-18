
import { createServerFn } from "@tanstack/react-start";

/**
 * Script de manutenção para normalizar todos os telefones no CRM
 * e tentar recuperar telefones ausentes a partir dos metadados dos pedidos.
 */
export const normalizeAllPhones = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // 1. Buscar todos os clientes
    const { data: customers, error: custError } = await supabaseAdmin
      .from("shopify_customers")
      .select("id, email, phone");
      
    if (custError) throw custError;
    
    console.log(`Iniciando normalização de ${customers?.length} clientes...`);
    
    let fixedCount = 0;
    
    for (const customer of (customers || [])) {
      let currentPhone = customer.phone;
      let newPhone = null;

      // Se já tem telefone, normaliza para E.164
      if (currentPhone) {
        let cleaned = currentPhone.replace(/\D/g, '');
        if (cleaned.length === 10 || cleaned.length === 11) {
          newPhone = `+55${cleaned}`;
        } else if (cleaned.length > 11 && !currentPhone.startsWith('+')) {
          newPhone = `+${cleaned}`;
        } else {
          newPhone = currentPhone;
        }
      } 
      
      // Se NÃO tem telefone, tenta buscar em shopify_orders
      if (!newPhone && customer.email) {
        const { data: orders } = await supabaseAdmin
          .from("shopify_orders")
          .select("phone, raw_data")
          .eq("email", customer.email.toLowerCase())
          .order("created_at", { ascending: false });
          
        if (orders && orders.length > 0) {
          for (const order of orders) {
            // Tenta o campo direto, depois shipping_address no raw_data
            let found = order.phone || (order.raw_data as any)?.shippingAddress?.phone;
            if (found) {
              let cleaned = found.replace(/\D/g, '');
              if (cleaned.length === 10 || cleaned.length === 11) {
                newPhone = `+55${cleaned}`;
              } else if (cleaned.length > 11) {
                newPhone = `+${cleaned}`;
              } else {
                newPhone = found;
              }
              break;
            }
          }
        }
      }

      if (newPhone && newPhone !== currentPhone) {
        await supabaseAdmin
          .from("shopify_customers")
          .update({ phone: newPhone })
          .eq("id", customer.id);
        fixedCount++;
      }
    }
    
    return { success: true, fixedCount };
  });
