import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  CASHBACK_REMINDER_MIN_AMOUNT,
  formatCashbackScheduleLabel,
  parseCashbackSendSchedule,
} from "@/lib/cashback-automation-schedule";

type Step = { id?: string; type?: string; templateName?: string; schedule?: unknown };

/** Resumo, no card da régua de cashback, de QUANDO cada mensagem sai e de QUAIS regras o envio segue. */
export function CashbackRulesSummary({ steps }: { steps: Step[] }) {
  const sendSteps = (steps ?? []).filter((step) => step?.type === "send");
  const money = CASHBACK_REMINDER_MIN_AMOUNT.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Box sx={{ flexBasis: "100%", borderTop: "1px solid", borderColor: "divider", pt: 1.5, mt: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5 }}>
        Quando cada mensagem sai
      </Typography>
      {sendSteps.map((step, index) => (
        <Typography key={step.id ?? index} variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {index + 1}. {formatCashbackScheduleLabel(parseCashbackSendSchedule(step.schedule))}
          {step.templateName ? ` · modelo ${step.templateName}` : ""}
        </Typography>
      ))}
      <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mt: 1, mb: 0.5 }}>
        Regras do envio
      </Typography>
      {[
        "Só envia entre 08:00 e 20:30 (Brasília). O que vencer fora desse horário sai quando a janela abrir.",
        "Cada cliente recebe um lembrete por vez, mesmo que tenha mais de um cashback.",
        "Para sozinha quando o cashback é usado, cancelado ou vence.",
        `Cashback abaixo de ${money} não recebe lembrete.`,
        "Ao ligar a régua, não despeja lembretes atrasados: só entra o que venceu nas últimas 6 horas e o que ainda está por vir.",
      ].map((rule) => (
        <Typography key={rule} variant="caption" color="text.secondary" sx={{ display: "block" }}>
          • {rule}
        </Typography>
      ))}
    </Box>
  );
}
