import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10 || cleaned.length === 11) {
    return `+55${cleaned}`;
  }
  if (cleaned.length > 11 && !phone.startsWith("+")) {
    return `+${cleaned}`;
  }
  return phone.startsWith("+") ? phone : `+${cleaned}`;
}


export const syncShopifyData = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ fullSync: z.boolean().optional().default(false) }).parse(data))
  .handler(async ({ data: { fullSync } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shopifyGraphQL, ORDERS_QUERY, CUSTOMERS_QUERY, ABANDONED_CHECKOUTS_QUERY } = await import("./shopify.server");

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
              phone: normalizePhone(
                customer.phone || 
                customer.defaultAddress?.phone || 
                customer.addresses?.find((a: any) => a.phone)?.phone
              ),
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
          console.error("Access denied error detail:", custErr.message);
          throw new Error(`PERMISSAO_NEGADA: O App da Shopify (Client ID: ${settings.shopify_client_id}) não tem permissão para ler Clientes (scope read_customers). Verifique no admin da Shopify em Settings -> Apps and sales channels -> [Seu App] -> Configuration -> Admin API integration -> Edit, e garanta que 'read_customers' esteja marcado.`);
        }
        // For other errors, we continue to orders which is more critical
      }

      // 2. Sync Orders
      cursor = null;
      hasNextPage = true;
      totalImported = 0;
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
            
            // Prioridade máxima para o telefone: 
            // 1. Telefone do endereço de entrega (addr?.phone) - costuma ser o mais atual
            // 2. Telefone do objeto principal do cliente (order.customer?.phone)
            // 3. Telefone padrão do cliente (order.customer?.defaultAddress?.phone)
            // 4. Telefone de qualquer endereço cadastrado
            // 5. Telefone do pedido (order.phone)
            const customerPhone = normalizePhone(
              addr?.phone ?? 
              order.customer?.phone ?? 
              order.customer?.defaultAddress?.phone ??
              order.customer?.addresses?.find((a: any) => a.phone)?.phone ??
              order.phone
            );
              
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

          // `cancelled_at` já existe no banco, mas o snapshot local de types.ts ainda está defasado.
          // O cast fica restrito a este upsert até os tipos Supabase serem regenerados.
          await (supabaseAdmin.from("shopify_orders") as any).upsert({
            id: order.id,
            order_number: order.name,
            customer_id: customerId,
            email,
            phone: order.phone,
            created_at: order.createdAt,
            processed_at: order.processedAt,
            updated_at: order.updatedAt,
            cancelled_at: order.cancelledAt ?? null,
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
              product_id: li.product?.id ?? null,
              variant_id: li.variant?.id ?? null,
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

      // 3. Sync Abandoned Checkouts
      cursor = null;
      hasNextPage = true;
      let totalAbandoned = 0;

      console.log("Starting checkouts sync (TAG: CAR24)...");
      while (hasNextPage) {
        try {
          const result: any = await shopifyGraphQL(ABANDONED_CHECKOUTS_QUERY, { cursor });
          if (!result?.abandonedCheckouts) {
            console.warn("No abandoned checkouts field in result:", result);
            break;
          }
          
          const abandonedConnection = result.abandonedCheckouts;
          console.log(`Processing ${abandonedConnection.edges.length} abandoned checkouts`);

          for (const edge of abandonedConnection.edges) {
            const checkout = edge.node;
            
            // Checkouts abandonados podem não ter um objeto customer associado (usuário não logado/novo)
            // Mas a Shopify ainda guarda o email e telefone no próprio checkout.
            const checkoutEmail = checkout.email?.toLowerCase();
            const customer = checkout.customer;
            const email = checkoutEmail || customer?.email?.toLowerCase();
            
            if (email || customer?.id) {
              const customerId = email ? `email:${email}` : `id:${customer.id.split('/').pop()}`;
              
              const customerPhone = normalizePhone(
                checkout.phone ??
                checkout.shippingAddress?.phone ??
                customer?.phone ?? 
                customer?.defaultAddress?.phone ??
                customer?.addresses?.find((a: any) => a.phone)?.phone
              );

              // Get existing tags to avoid overwriting
              const { data: existing } = await supabaseAdmin
                .from("shopify_customers")
                .select("tags, first_name, last_name, city, province, country")
                .eq("id", customerId)
                .maybeSingle();
              
              const currentTags = existing?.tags || [];
              const newTags = Array.from(new Set([...currentTags, "Carrinho Abandonado", "Checkout", "CAR24"]));

              // 1. Update/Upsert customer info and tag as abandoned
              await supabaseAdmin.from("shopify_customers").upsert({
                id: customerId,
                email: email || null,
                first_name: checkout.shippingAddress?.firstName || customer?.firstName || existing?.first_name || null,
                last_name: checkout.shippingAddress?.lastName || customer?.lastName || existing?.last_name || null,
                phone: customerPhone,
                city: checkout.shippingAddress?.city || customer?.defaultAddress?.city || existing?.city || null,
                province: checkout.shippingAddress?.province || customer?.defaultAddress?.province || existing?.province || null,
                country: checkout.shippingAddress?.country || customer?.defaultAddress?.country || existing?.country || null,
                tags: newTags,
                updated_at: new Date().toISOString(),
              });

              // 2. Insert individual abandoned checkout event for historical tracking
              // This allows identifying EACH abandonment as a separate event
              await supabaseAdmin.from("shopify_abandoned_checkouts").upsert({
                id: checkout.id,
                customer_id: customerId,
                email: email || null,
                phone: customerPhone,
                total_price: parseFloat(checkout.totalPriceSet?.presentmentMoney?.amount ?? "0"),
                checkout_url: checkout.abandonedCheckoutUrl || null,
                created_at: checkout.createdAt,
                updated_at: checkout.updatedAt,
                raw_data: checkout,
              });

              totalAbandoned++;
            }
          }

          hasNextPage = abandonedConnection.pageInfo.hasNextPage;
          cursor = abandonedConnection.pageInfo.endCursor;
          if (totalAbandoned > 5000) break; // Increased safety limit
        } catch (abandonedErr: any) {
          console.error("Abandoned checkout sync page failed:", abandonedErr);
          // If abandoned checkouts fail (e.g. scope missing), we don't want to crash the whole sync
          break;
        }
      }

      // O RFM só é considerado sincronizado depois que os dados da Shopify terminaram de entrar.
      // Se o recálculo falhar, a sincronização não é marcada como "connected"; o catch registra o erro.
      const { recalculateRFM } = await import("./crm-rfm.server");
      const rfmResult = await recalculateRFM();

      await supabaseAdmin
        .from("store_settings")
        .update({
          sync_status: "connected",
          last_sync_at: new Date().toISOString(),
          last_sync_error: null,
          total_orders_imported: totalImported,
          last_imported_order_at: lastUpdatedAt ?? settings.last_imported_order_at,
        })
        .eq("id", settings.id);

      return {
        success: true,
        totalImported,
        rfm: {
          updatedCustomers: rfmResult.count,
          historyDays: rfmResult.historyDays,
          classicMode: rfmResult.classicMode,
        },
      };
    } catch (error: any) {
      console.error("Sync failed:", error);
      await supabaseAdmin
        .from("store_settings")
        .update({ sync_status: "error", last_sync_error: error.message })
        .eq("id", settings.id);
      throw error;
    }
  });
