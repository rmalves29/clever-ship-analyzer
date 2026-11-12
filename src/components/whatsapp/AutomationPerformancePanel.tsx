import { useQuery } from "@tanstack/react-query";
import { createLink } from "@tanstack/react-router";
import { Archive, ArchiveRestore, BarChart3, ChevronDown, MessageSquareText, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
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

const LinkButton = createLink(Button);

export type PainelSituacao = "ativa" | "pausada" | "inativa";
export type PainelFiltro = "todas" | PainelSituacao;

/** Ações de cada régua, executadas pela página (que já sabe editar, pausar, inativar e apagar). */
export type PainelAcoes = {
  onEditar: (id: string) => void;
  onPausarOuAtivar: (id: string, ativar: boolean) => void;
  onInativarOuReativar: (id: string, inativar: boolean) => void;
  onApagar: (id: string) => void;
  /** Id da régua que está sendo alterada agora (desabilita os botões dela). */
  ocupadoId?: string | null;
};

const SITUACAO_LABEL: Record<PainelSituacao, string> = { ativa: "Ativa", pausada: "Pausada", inativa: "Inativa" };
const SITUACAO_COR: Record<PainelSituacao, "success" | "warning" | "default"> = {
  ativa: "success",
  pausada: "warning",
  inativa: "default",
};

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

function dataHora(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export function AutomationPerformancePanel({
  filtro = "ativa",
  situacaoPorId = {},
  acoes,
}: {
  /** Botões de editar, pausar, inativar e apagar dentro de cada régua. */
  acoes?: PainelAcoes;
  /** Quais réguas aparecem (e entram nos totais). Padrão: só as ativas. */
  filtro?: PainelFiltro;
  /** Situação de cada régua pelo id (ativa, pausada ou inativa). */
  situacaoPorId?: Record<string, PainelSituacao>;
}) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["whatsapp-automation-performance"],
    queryFn: () => getAutomationPerformance(),
    refetchInterval: 20_000,
  });

  const situacaoDe = (automation: { automationId: string; active: boolean }): PainelSituacao =>
    situacaoPorId[automation.automationId] ?? (automation.active ? "ativa" : "pausada");
  const visiveis = (data?.automations ?? []).filter((a) => filtro === "todas" || situacaoDe(a) === filtro);
  // Os cards somam só o que está na lista, para os números baterem com o que aparece abaixo.
  const totais = visiveis.reduce(
    (acc, a) => ({
      sent: acc.sent + a.sent,
      delivered: acc.delivered + a.delivered,
      read: acc.read + a.read,
      failed: acc.failed + a.failed,
      orders: acc.orders + a.orders,
      revenue: acc.revenue + a.revenue,
      cost: acc.cost + a.cost,
    }),
    { sent: 0, delivered: 0, read: 0, failed: 0, orders: 0, revenue: 0, cost: 0 },
  );
  const totaisRoas = totais.cost > 0 ? totais.revenue / totais.cost : null;

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
            <MetricCard label="Enviadas" value={totais.sent.toLocaleString("pt-BR")} />
            <MetricCard
              label="Entregues"
              value={totais.delivered.toLocaleString("pt-BR")}
              hint={`${rate(totais.delivered, totais.sent)} das enviadas`}
            />
            <MetricCard
              label="Lidas"
              value={totais.read.toLocaleString("pt-BR")}
              hint={`${rate(totais.read, totais.delivered)} das entregues`}
            />
            <MetricCard
              label="Valor gasto"
              value={money(totais.cost)}
              hint="estimado pela tarifa configurada"
            />
            <MetricCard
              label="Vendas"
              value={totais.orders.toLocaleString("pt-BR")}
              tone="success"
            />
            <MetricCard label="Receita" value={money(totais.revenue)} tone="success" />
            <MetricCard label="ROAS" value={roas(totaisRoas)} tone="primary" />
          </Box>

          <Typography variant="caption" color="text.secondary">
            Vendas atribuídas ao primeiro envio de WhatsApp anterior à compra, dentro da janela de{" "}
            {data.attributionWindowDays} dias. O valor gasto é uma estimativa baseada nas tarifas
            configuradas.
          </Typography>

          <Stack spacing={1}>
            {visiveis.map((automation) => (
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
                          color={SITUACAO_COR[situacaoDe(automation)]}
                          label={SITUACAO_LABEL[situacaoDe(automation)]}
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
                  {acoes && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ flexWrap: "wrap", rowGap: 1, px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}
                    >
                      {(() => {
                        const situacao = situacaoDe(automation);
                        const ocupado = acoes.ocupadoId === automation.automationId;
                        return (
                          <>
                            {automation.latestCampaignId && (
                              <LinkButton
                                size="small"
                                variant="contained"
                                startIcon={<MessageSquareText size={14} />}
                                to="/whatsapp/$campaignId"
                                params={{ campaignId: automation.latestCampaignId }}
                              >
                                Mensagens enviadas
                              </LinkButton>
                            )}
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<Pencil size={14} />}
                              onClick={() => acoes.onEditar(automation.automationId)}
                            >
                              Ver / editar
                            </Button>
                            {situacao !== "inativa" &&
                              (situacao === "ativa" ? (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  startIcon={<Pause size={14} />}
                                  disabled={ocupado}
                                  onClick={() => acoes.onPausarOuAtivar(automation.automationId, false)}
                                >
                                  Pausar
                                </Button>
                              ) : (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="success"
                                  startIcon={<Play size={14} />}
                                  disabled={ocupado}
                                  onClick={() => acoes.onPausarOuAtivar(automation.automationId, true)}
                                >
                                  Ativar
                                </Button>
                              ))}
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={situacao === "inativa" ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                              disabled={ocupado}
                              onClick={() => acoes.onInativarOuReativar(automation.automationId, situacao !== "inativa")}
                            >
                              {situacao === "inativa" ? "Reativar" : "Inativar"}
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<Trash2 size={14} />}
                              disabled={ocupado}
                              onClick={() => acoes.onApagar(automation.automationId)}
                            >
                              Excluir
                            </Button>
                          </>
                        );
                      })()}
                    </Stack>
                  )}
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
                  <Box sx={{ borderTop: "1px solid", borderColor: "divider", px: 2, py: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                      Envios recentes
                    </Typography>
                    {automation.recentSends.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        Esta régua ainda não enviou nenhuma mensagem.
                      </Typography>
                    ) : (
                      <Stack spacing={0.5}>
                        {automation.recentSends.map((send) => (
                          <Stack
                            key={send.campaignId}
                            direction="row"
                            spacing={2}
                            sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}
                          >
                            <Typography variant="body2" sx={{ minWidth: 110 }}>
                              {dataHora(send.createdAt)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 220 }}>
                              {send.sent.toLocaleString("pt-BR")} enviadas · {send.delivered.toLocaleString("pt-BR")} entregues ·{" "}
                              {send.read.toLocaleString("pt-BR")} lidas
                              {send.failed > 0 ? ` · ${send.failed.toLocaleString("pt-BR")} falhas` : ""}
                            </Typography>
                            <LinkButton
                              size="small"
                              variant="text"
                              to="/whatsapp/$campaignId"
                              params={{ campaignId: send.campaignId }}
                            >
                              Ver destinatários
                            </LinkButton>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
            {visiveis.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                Nenhuma régua nesta situação.
              </Typography>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}
