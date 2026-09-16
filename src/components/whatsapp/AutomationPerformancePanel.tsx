import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, RefreshCw } from "lucide-react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { getAutomationPerformance } from "@/lib/whatsapp-automation-performance.functions";
import type {
  AutomationPerformanceMetrics,
  AutomationPerformanceStep,
} from "@/lib/whatsapp-automation-performance";

function money(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rate(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function roas(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
}

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "primary";
}) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor:
          tone === "success" ? "success.light" : tone === "primary" ? "primary.light" : "divider",
        bgcolor:
          tone === "success"
            ? "success.50"
            : tone === "primary"
              ? "primary.50"
              : "background.paper",
        borderRadius: 2.5,
        p: 1.75,
        minWidth: 0,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", fontWeight: 600 }}
      >
        {label}
      </Typography>
      <Typography variant="h6" sx={{ mt: 0.25, fontWeight: 700, lineHeight: 1.25 }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

function performanceSummary(metrics: AutomationPerformanceMetrics): string {
  return [
    `${metrics.sent.toLocaleString("pt-BR")} enviadas`,
    `${metrics.orders.toLocaleString("pt-BR")} vendas`,
    money(metrics.revenue),
    `ROAS ${roas(metrics.roas)}`,
  ].join(" · ");
}

function StepRow({ step }: { step: AutomationPerformanceStep }) {
  return (
    <TableRow hover>
      <TableCell sx={{ minWidth: 230 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Etapa {step.order}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {step.label}
        </Typography>
      </TableCell>
      <TableCell sx={{ minWidth: 190 }}>
        <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
          {step.templateName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {step.messageType === "utility" ? "Utilidade" : "Marketing"}
        </Typography>
      </TableCell>
      <TableCell align="right">{step.sent.toLocaleString("pt-BR")}</TableCell>
      <TableCell align="right">
        <Typography variant="body2">{step.delivered.toLocaleString("pt-BR")}</Typography>
        <Typography variant="caption" color="text.secondary">
          {rate(step.delivered, step.sent)}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2">{step.read.toLocaleString("pt-BR")}</Typography>
        <Typography variant="caption" color="text.secondary">
          {rate(step.read, step.delivered)}
        </Typography>
      </TableCell>
      <TableCell align="right">{money(step.cost)}</TableCell>
      <TableCell align="right">{step.orders.toLocaleString("pt-BR")}</TableCell>
      <TableCell
        align="right"
        sx={{ color: step.revenue > 0 ? "success.main" : "text.primary", fontWeight: 600 }}
      >
        {money(step.revenue)}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: 600 }}>
        {roas(step.roas)}
      </TableCell>
    </TableRow>
  );
}

export function AutomationPerformancePanel() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["whatsapp-automation-performance"],
    queryFn: () => getAutomationPerformance(),
    refetchInterval: 20_000,
  });

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <BarChart3 size={19} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Desempenho das automações
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Somente mensagens enviadas pelas réguas. Campanhas manuais não entram nestes números.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={isFetching ? <CircularProgress size={14} /> : <RefreshCw size={14} />}
          disabled={isFetching}
          onClick={() => refetch()}
        >
          Atualizar dados
        </Button>
      </Stack>

      {isLoading && (
        <Box sx={{ py: 5, textAlign: "center" }}>
          <CircularProgress size={28} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Carregando resultados...
          </Typography>
        </Box>
      )}

      {error && (
        <Box
          sx={{
            border: "1px solid",
            borderColor: "error.light",
            bgcolor: "error.50",
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography variant="body2" color="error.main">
            Não foi possível carregar o desempenho:{" "}
            {error instanceof Error ? error.message : "erro desconhecido"}
          </Typography>
        </Box>
      )}

      {data && (
        <>
          <Box
            sx={{
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: {
                xs: "repeat(2, 1fr)",
                md: "repeat(4, 1fr)",
                xl: "repeat(7, 1fr)",
              },
            }}
          >
            <MetricCard label="Enviadas" value={data.totals.sent.toLocaleString("pt-BR")} />
            <MetricCard
              label="Entregues"
              value={data.totals.delivered.toLocaleString("pt-BR")}
              hint={`${rate(data.totals.delivered, data.totals.sent)} das enviadas`}
            />
            <MetricCard
              label="Lidas"
              value={data.totals.read.toLocaleString("pt-BR")}
              hint={`${rate(data.totals.read, data.totals.delivered)} das entregues`}
            />
            <MetricCard
              label="Valor gasto"
              value={money(data.totals.cost)}
              hint="estimado pela tarifa configurada"
            />
            <MetricCard
              label="Vendas"
              value={data.totals.orders.toLocaleString("pt-BR")}
              tone="success"
            />
            <MetricCard label="Receita" value={money(data.totals.revenue)} tone="success" />
            <MetricCard label="ROAS" value={roas(data.totals.roas)} tone="primary" />
          </Box>

          <Typography variant="caption" color="text.secondary">
            Vendas atribuídas ao primeiro envio de WhatsApp anterior à compra, dentro da janela de{" "}
            {data.attributionWindowDays} dias. O valor gasto é uma estimativa baseada nas tarifas
            configuradas.
          </Typography>

          <Stack spacing={1}>
            {data.automations.map((automation) => (
              <Accordion
                key={automation.automationId}
                disableGutters
                elevation={0}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: "12px !important",
                  overflow: "hidden",
                  "&:before": { display: "none" },
                }}
              >
                <AccordionSummary expandIcon={<ChevronDown size={18} />} sx={{ px: 2, py: 0.5 }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={{ xs: 0.5, md: 2 }}
                    sx={{ width: "100%", pr: 1, alignItems: { md: "center" } }}
                  >
                    <Box sx={{ minWidth: 220, flex: 1 }}>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{ alignItems: "center", flexWrap: "wrap" }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {automation.name}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={automation.active ? "success" : "default"}
                          label={automation.active ? "Ativa" : "Pausada"}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {automation.steps.length} etapa{automation.steps.length === 1 ? "" : "s"}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ textAlign: { md: "right" } }}
                    >
                      {performanceSummary(automation)}
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0, pt: 0, pb: 0 }}>
                  <TableContainer sx={{ borderTop: "1px solid", borderColor: "divider" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: "action.hover" }}>
                          <TableCell>Etapa / momento</TableCell>
                          <TableCell>Modelo</TableCell>
                          <TableCell align="right">Enviadas</TableCell>
                          <TableCell align="right">Entregues</TableCell>
                          <TableCell align="right">Lidas</TableCell>
                          <TableCell align="right">Gasto</TableCell>
                          <TableCell align="right">Vendas</TableCell>
                          <TableCell align="right">Receita</TableCell>
                          <TableCell align="right">ROAS</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {automation.steps.map((step) => (
                          <StepRow key={step.stepId} step={step} />
                        ))}
                        {automation.steps.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={9}
                              align="center"
                              sx={{ py: 3, color: "text.secondary" }}
                            >
                              Esta automação ainda não possui etapa de envio.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}
