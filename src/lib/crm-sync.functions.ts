import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


export const syncShopifyData = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ fullSync: z.boolean().optional().default(false) }).parse(data))
  .handler(async ({ data: { fullSync } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shopifyGraphQL, ORDERS_QUERY, CUSTOMERS_QUERY } = await import("./shopify.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings) throw new Error("Store settings not found");

    await supabaseAdmin
      .from("store_settings")
      .update({ sync_status: "syncing", last_sync_error: null })
      .eq("id", settings.id);

    try {
      let cursor: string | null = null;
      let hasNextPage = true;
      let totalImported = 0;
      let lastUpdatedAt: string | null = null;

      // 1. Sync Customers
      cursor = null;
      hasNextPage = true;
      totalImported = 0;

      console.log("Starting customer sync...");
      try {
        while (hasNextPage) {
          console.log(`Fetching customers page with cursor: ${cursor}`);
          const result: any = await shopifyGraphQL(CUSTOMERS_QUERY, { cursor });
          
          if (!result?.customers) {
            console.warn("No customers found in response:", JSON.stringify(result));
            break;
          }
          
          const customersConnection = result.customers;
          console.log(`Processing ${customersConnection.edges.length} customers`);

          for (const edge of customersConnection.edges) {
            const customer = edge.node;
            const email = customer.email?.toLowerCase();
            // Use Shopify ID as primary if possible to avoid collisions, fall back to email
            const customerId = email ? `email:${email}` : `id:${customer.id.split('/').pop()}`;

            const { error: upsertError } = await supabaseAdmin.from("shopify_customers").upsert({
              id: customerId,
              email: customer.email || null,
              first_name: customer.firstName || null,
              last_name: customer.lastName || null,
              phone: customer.phone || null,
              city: customer.defaultAddress?.city || null,
              province: customer.defaultAddress?.province || null,
              country: customer.defaultAddress?.country || null,
              updated_at: customer.updatedAt || new Date().toISOString(),
              created_at: customer.createdAt || new Date().toISOString(),
            });

            if (upsertError) {
              console.error(`Error upserting customer ${customerId}:`, upsertError);
            }
          }
          
          hasNextPage = customersConnection.pageInfo.hasNextPage;
          cursor = customersConnection.pageInfo.endCursor;
          
          totalImported += customersConnection.edges.length;
          if (totalImported > 10000) break; // Safety
        }
      } catch (custErr: any) {
        console.error("Customer sync failed:", custErr);
        // We log and re-throw if it's the specific access denied error to inform the user
        if (custErr.message?.includes("Access denied")) {
          throw new Error(`PERMISSAO_NEGADA: O App da Shopify não tem permissão para ler Clientes (scope read_customers). Verifique as configurações do App na Shopify.`);
        }
        // For other errors, we continue to orders which is more critical
      }

      // 2. Sync Orders
      cursor = null;
      hasNextPage = true;
      const orderSearchQuery =
        !fullSync && settings.last_sync_at
          ? `updated_at:>='${new Date(settings.last_sync_at).toISOString()}'`
          : null;

      while (hasNextPage) {
        const result: any = await shopifyGraphQL(ORDERS_QUERY, { cursor, query: orderSearchQuery });
        const ordersConnection = result.orders;

        for (const edge of ordersConnection.edges) {
          const order = edge.node;
          const addr = order.shippingAddress;
          const email: string | null = order.email || order.customer?.email || null;
          const customerId = email ? `email:${email.toLowerCase()}` : (order.customer?.id ? `id:${order.customer.id.split('/').pop()}` : null);

          if (customerId) {
            const fullName =
              addr?.name || [addr?.firstName, addr?.lastName].filter(Boolean).join(" ") || 
              [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ") || null;
            
            // Prioridade para o telefone: 
            // 1. Telefone do cliente no objeto principal (order.customer?.phone)
            // 2. Telefone do pedido (order.phone)
            // 3. Endereço de entrega (addr?.phone)
            // Nota: addr.phone às vezes é o telefone de entrega, que pode ser diferente, 
            // mas geralmente é o melhor dado disponível se os outros falharem.
            const customerPhone = order.customer?.phone ?? order.phone ?? addr?.phone ?? null;
              
            await supabaseAdmin.from("shopify_customers").upsert({
              id: customerId,
              email,
              first_name: addr?.firstName ?? order.customer?.firstName ?? fullName?.split(" ")[0] ?? null,
              last_name: addr?.lastName ?? order.customer?.lastName ?? fullName?.split(" ").slice(1).join(" ") ?? null,
              phone: customerPhone,
              city: addr?.city ?? null,
              province: addr?.province ?? null,
              country: addr?.country ?? null,
              updated_at: new Date().toISOString(),
            });
          }

          await supabaseAdmin.from("shopify_orders").upsert({
            id: order.id,
            order_number: order.name,
            customer_id: customerId,
            email,
            phone: order.phone,
            created_at: order.createdAt,
            processed_at: order.processedAt,
            updated_at: order.updatedAt,
            financial_status: order.displayFinancialStatus,
            fulfillment_status: order.displayFulfillmentStatus,
            currency_code: order.currencyCode,
            subtotal_price: parseFloat(order.subtotalPriceSet?.presentmentMoney?.amount ?? "0"),
            total_discounts: parseFloat(order.totalDiscountsSet?.presentmentMoney?.amount ?? "0"),
            total_shipping_price: parseFloat(order.totalShippingPriceSet?.presentmentMoney?.amount ?? "0"),
            total_tax: parseFloat(order.totalTaxSet?.presentmentMoney?.amount ?? "0"),
            total_price: parseFloat(order.totalPriceSet?.presentmentMoney?.amount ?? "0"),
            source_name: order.sourceName,
            landing_site: null,
            referring_site: null,
            city: addr?.city ?? null,
            province: addr?.province ?? null,
            country: addr?.country ?? null,
            raw_data: order,
          });

          for (const liEdge of order.lineItems.edges) {
            const li = liEdge.node;
            await supabaseAdmin.from("shopify_order_items").upsert({
              id: li.id,
              order_id: order.id,
              product_id: null,
              variant_id: null,
              title: li.title,
              variant_title: li.variantTitle,
              sku: li.sku,
              quantity: li.quantity,
              price: parseFloat(li.discountedUnitPriceSet?.presentmentMoney?.amount ?? "0"),
              total_discount: parseFloat(li.totalDiscountSet?.presentmentMoney?.amount ?? "0"),
            });
          }

          for (const f of order.fulfillments ?? []) {
            await supabaseAdmin.from("shopify_fulfillments").upsert({
              id: f.id,
              order_id: order.id,
              status: f.status,
              created_at: f.createdAt,
              updated_at: f.updatedAt,
              tracking_company: f.trackingInfo?.[0]?.company ?? null,
              tracking_number: f.trackingInfo?.[0]?.number ?? null,
              tracking_url: f.trackingInfo?.[0]?.url ?? null,
              raw_data: f,
            });
          }

          lastUpdatedAt = order.updatedAt;
          totalImported++;
        }

        hasNextPage = ordersConnection.pageInfo.hasNextPage;
        cursor = ordersConnection.pageInfo.endCursor;

        if (totalImported > 5000) break;
      }

      await supabaseAdmin
        .from("store_settings")
        .update({
          sync_status: "connected",
          last_sync_at: new Date().toISOString(),
          last_sync_error: null,
          total_orders_imported: totalImported,
          last_imported_order_at: lastUpdatedAt,
        })
        .eq("id", settings.id);

      return { success: true, totalImported };
    } catch (error: any) {
      console.error("Sync failed:", error);
      await supabaseAdmin
        .from("store_settings")
        .update({ sync_status: "error", last_sync_error: error.message })
        .eq("id", settings.id);
      throw error;
    }
  });
