import {
  buildAutomationContextKey,
  type AutomationEventContext,
} from "./whatsapp-automation-context";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function discountCode(rawData: any): string | null {
  const snake = rawData?.discount_codes?.[0];
  if (typeof snake === "string") return snake;
  if (snake?.code) return String(snake.code);
  const camel = rawData?.discountCodes?.[0];
  if (typeof camel === "string") return camel;
  if (camel?.code) return String(camel.code);
  return null;
}

function shippingTitle(rawData: any): string | null {
  return (
    rawData?.shipping_lines?.[0]?.title ||
    rawData?.shippingLine?.title ||
    rawData?.shippingLines?.edges?.[0]?.node?.title ||
    null
  );
}

export async function captureAutomationEventContext(customerId: string): Promise<{
  context: AutomationEventContext;
  contextKey: string;
}> {
  const db = await admin();
  const capturedAt = new Date().toISOString();

  const [{ data: orderRow }, { data: checkoutRow }] = await Promise.all([
    db
      .from("shopify_orders")
      .select("id, order_number, total_price, financial_status, fulfillment_status, raw_data, processed_at, created_at")
      .eq("customer_id", customerId)
      .order("processed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("shopify_abandoned_checkouts")
      .select("id, checkout_url, total_price, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let items: NonNullable<AutomationEventContext["items"]> = [];
  let fulfillment: NonNullable<AutomationEventContext["fulfillment"]> | null = null;
  if (orderRow?.id) {
    const [{ data: itemRows }, { data: fulfillmentRow }] = await Promise.all([
      db
        .from("shopify_order_items")
        .select("title, variant_title, quantity")
        .eq("order_id", orderRow.id),
      db
        .from("shopify_fulfillments")
        .select("tracking_number, tracking_url, status, updated_at")
        .eq("order_id", orderRow.id)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);
    items = (itemRows ?? []).map((item: any) => ({
      title: String(item.title ?? "Produto"),
      variantTitle: item.variant_title ? String(item.variant_title) : null,
      quantity: Math.max(1, Number(item.quantity ?? 1)),
    }));
    if (fulfillmentRow) {
      fulfillment = {
        trackingNumber: fulfillmentRow.tracking_number ?? null,
        trackingUrl: fulfillmentRow.tracking_url ?? null,
        status: fulfillmentRow.status ?? null,
      };
    }
  }

  const rawData = orderRow?.raw_data ?? null;
  const context: AutomationEventContext = {
    capturedAt,
    order: orderRow
      ? {
          id: String(orderRow.id),
          orderNumber: String(orderRow.order_number ?? orderRow.id),
          totalPrice: Number(orderRow.total_price ?? 0),
          financialStatus: orderRow.financial_status ?? null,
          fulfillmentStatus: orderRow.fulfillment_status ?? null,
          discountCode: discountCode(rawData),
          shippingTitle: shippingTitle(rawData),
        }
      : null,
    items,
    fulfillment,
    checkout: checkoutRow
      ? {
          id: String(checkoutRow.id),
          checkoutUrl: checkoutRow.checkout_url ?? null,
          totalPrice: checkoutRow.total_price == null ? null : Number(checkoutRow.total_price),
          createdAt: checkoutRow.created_at ?? null,
        }
      : null,
  };

  return { context, contextKey: buildAutomationContextKey(context, customerId) };
}

export async function loadAutomationContextsForCampaign(
  campaignId: string,
): Promise<Map<string, AutomationEventContext>> {
  const db = await admin();
  const { data, error } = await db
    .from("whatsapp_automation_runs")
    .select("customer_id, event_context")
    .eq("campaign_id", campaignId);
  if (error) throw new Error(`Erro ao carregar contexto congelado da automação: ${error.message}`);

  const result = new Map<string, AutomationEventContext>();
  for (const row of data ?? []) {
    if (!row.customer_id || !row.event_context || typeof row.event_context !== "object") continue;
    result.set(String(row.customer_id), row.event_context as AutomationEventContext);
  }
  return result;
}
