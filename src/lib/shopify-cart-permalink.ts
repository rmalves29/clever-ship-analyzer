/** Link direto pro checkout da Shopify (pula carrinho E a página "Comprar novamente" do
 *  statusPageUrl, que não sabe retomar um pagamento Pix/cartão pendente — só oferece refazer o
 *  pedido do zero). Formato nativo da Shopify: /cart/{variantId}:{quantidade},... — funciona com
 *  qualquer forma de pagamento habilitada na loja (Pix, cartão, etc.), sem precisar de nenhuma
 *  integração nova. */
export function buildDirectCheckoutUrl(
  storefrontDomain: string | null | undefined,
  items: { variantId: string | null | undefined; quantity: number }[],
): string | null {
  const domain = String(storefrontDomain ?? "").trim();
  if (!domain) return null;

  const parts = items
    .map((item) => {
      const numericId = String(item.variantId ?? "").trim().split("/").pop();
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      return numericId ? `${numericId}:${quantity}` : null;
    })
    .filter((part): part is string => Boolean(part));

  if (parts.length === 0) return null;
  return `https://${domain}/cart/${parts.join(",")}`;
}
