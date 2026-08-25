export type AutomationDeliveryOutcome = "sent" | "retry" | "failed";
export type AutomationDeliveryAction = "advance" | "wait" | "fail";

/**
 * Regra central para o motor: enfileirar não conclui a etapa.
 * Só um envio confirmado pelo provider autoriza avançar a automação.
 */
export function automationDeliveryAction(outcome: AutomationDeliveryOutcome): AutomationDeliveryAction {
  if (outcome === "sent") return "advance";
  if (outcome === "failed") return "fail";
  return "wait";
}
