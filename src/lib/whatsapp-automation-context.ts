export type AutomationEventContext = {
  capturedAt: string;
  order?: {
    id: string;
    orderNumber: string;
    totalPrice: number;
    financialStatus?: string | null;
    fulfillmentStatus?: string | null;
    discountCode?: string | null;
    shippingTitle?: string | null;
  } | null;
  items?: Array<{ title: string; variantTitle?: string | null; quantity: number }>;
  fulfillment?: {
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    status?: string | null;
  } | null;
  checkout?: {
    id: string;
    checkoutUrl?: string | null;
    totalPrice?: number | null;
    createdAt?: string | null;
  } | null;
};

type AutomationRecipientPreview = {
  firstName?: string | null | undefined;
  checkoutUrl?: string | null | undefined;
};

export function buildAutomationContextKey(context: AutomationEventContext, customerId: string): string {
  if (context.order?.id) return `order:${context.order.id}`;
  if (context.checkout?.id) return `checkout:${context.checkout.id}`;
  return `customer:${customerId}:${context.capturedAt}`;
}

export function formatAutomationPurchasedItems(items: AutomationEventContext["items"]): string {
  const rows = items ?? [];
  if (rows.length === 0) return "—";
  const visible = rows.slice(0, 4).map((item) => {
    const quantity = Math.max(1, Number(item.quantity ?? 1));
    const title = String(item.title || "Produto").trim();
    const variant = String(item.variantTitle ?? "").trim();
    return `${quantity}x ${title}${variant ? ` (${variant})` : ""}`;
  });
  const remaining = rows.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} + ${remaining} item(ns)` : visible.join(", ");
}

export function buildAutomationTokenReplacements(
  context: AutomationEventContext,
  recipient: AutomationRecipientPreview,
): Record<string, string> {
  const order = context.order;
  const fulfillment = context.fulfillment;
  const trackingNumber = fulfillment?.trackingNumber || "—";
  const trackingUrl = fulfillment?.trackingUrl || "—";
  const fulfillmentStatus = String(fulfillment?.status ?? order?.fulfillmentStatus ?? "").toLowerCase();
  const isSent = Boolean(fulfillment?.trackingNumber) || ["success", "fulfilled", "in_transit"].includes(fulfillmentStatus);
  const checkoutUrl = context.checkout?.checkoutUrl || recipient.checkoutUrl || "—";

  return {
    "{{NOME_CLIENTE}}": recipient.firstName || "Cliente",
    "{{NUMERO_PEDIDO}}": order?.orderNumber || "—",
    "{{VALOR_TOTAL}}": order
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(order.totalPrice || 0))
      : "—",
    "{{ITENS_COMPRADOS}}": formatAutomationPurchasedItems(context.items),
    "{{CUPOM_DESCONTO}}": order?.discountCode || "—",
    "{{FRETE_ESCOLHIDO}}": order?.shippingTitle || "—",
    "{{RASTREIO}}": trackingNumber,
    "{{LINK_RASTREIO}}": trackingUrl,
    "{{STATUS_PEDIDO}}": isSent ? "Enviado" : "Processando",
    "{{LINK_CHECKOUT}}": checkoutUrl,
  };
}

export function resolveAutomationBodyParams(
  bodyParams: string[],
  context: AutomationEventContext,
  recipient: AutomationRecipientPreview,
): string[] {
  const replacements = buildAutomationTokenReplacements(context, recipient);
  return bodyParams.map((param) => {
    let text = param;
    for (const [token, value] of Object.entries(replacements)) text = text.split(token).join(value);
    return text;
  });
}
