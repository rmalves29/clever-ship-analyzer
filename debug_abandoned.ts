
import { supabase } from "./src/integrations/supabase/client";

/**
 * Script to verify if abandoned checkouts are being synced.
 */
async function debugAbandoned() {
  console.log("Checking shopify_orders for EXPIRED/VOIDED...");
  const { data: orders, error: ordersError } = await supabase
    .from("shopify_orders")
    .select("financial_status, customer_id")
    .in("financial_status", ["EXPIRED", "VOIDED", "PENDING"]);
  
  if (ordersError) console.error("Orders Error:", ordersError);
  else console.log(`Found ${orders?.length || 0} potential abandoned orders.`);

  console.log("Checking shopify_customers for tags...");
  const { data: customers, error: custError } = await supabase
    .from("shopify_customers")
    .select("id, tags")
    .contains("tags", ["Carrinho Abandonado"]);

  if (custError) console.error("Customers Error:", custError);
  else console.log(`Found ${customers?.length || 0} customers with 'Carrinho Abandonado' tag.`);
}

// Just for thought process, I'll use psql instead to be faster
