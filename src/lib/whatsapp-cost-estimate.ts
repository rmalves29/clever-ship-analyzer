export type EstimatedSendCost = {
  /** Categoria cobrada pela Meta para este modelo. */
  type: "marketing" | "utility";
  perMessage: number;
  total: number;
};

/**
 * Custo estimado de um disparo: destinatários x custo por mensagem da categoria do modelo (UTILITY é mais barata
 * que MARKETING). Usa os valores cadastrados em Configurações; sem valor cadastrado devolve null (a tela avisa).
 * É estimativa: a Meta cobra por mensagem entregue, então o valor real pode ser menor.
 */
export function estimateSendCost(
  category: string | null | undefined,
  recipients: number,
  costs: { marketing?: number | string | null | undefined; utility?: number | string | null | undefined },
): EstimatedSendCost | null {
  const type = String(category ?? "").toUpperCase() === "UTILITY" ? "utility" : "marketing";
  const perMessage = Number(costs[type]);
  if (!Number.isFinite(perMessage) || perMessage <= 0) return null;
  const count = Math.max(0, Math.floor(recipients));
  return { type, perMessage, total: Math.round(count * perMessage * 100) / 100 };
}

export const formatBRL = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
