import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createLink } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LineChart } from "@mui/x-charts/LineChart";
import { BarChart3, Bot, RefreshCw, Search } from "lucide-react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getWhatsappCampaignReport } from "@/lib/whatsapp-campaign-reports.functions";
import type {
  CampaignReportMessageType,
  CampaignReportMetrics,
  CampaignReportPeriod,
} from "@/lib/whatsapp-campaign-reports";

const LinkButton = createLink(Button);

const PERIODS: Array<{ value: CampaignReportPeriod; label: string }> = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
];

const STATUS_LABEL: Record<string, string> = {
  aguardando_aprovacao: "Aguardando aprovação",
  rejeitada: "Rejeitada",
  enviando: "Enviando",
  agendada: "Agendada",
  finalizada: "Finalizada",
  erro: "Erro",
  cancelada: "Cancelada",
};

function money(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function integer(value: number): string {
  return value.toLocaleString("pt-BR");
}

function percentage(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function roas(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chartDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "primary" | "success" | "error";
}) {
  const borderColor =
    tone === "primary"
      ? "primary.light"
      : tone === "success"
        ? "success.light"
        : tone === "error"
          ? "error.light"
          : "divider";
  const background =
    tone === "primary"
      ? "primary.50"
      : tone === "success"
        ? "success.50"
        : tone === "error"
          ? "error.50"
          : "background.paper";

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor,
        bgcolor: background,
        borderRadius: 3,
        p: 2,
        minWidth: 0,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
        {hint}
      </Typography>
    </Box>
  );
}

function FunnelRow({
  label,
  value,
  rate,
  color,
}: {
  label: string;
  value: number;
  rate: number;
  color: string;
}) {
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {integer(value)}{" "}
          <Typography component="span" variant="caption" color="text.secondary">
            {percentage(rate)}
          </Typography>
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, rate))}
        sx={{
          mt: 0.75,
          height: 8,
          borderRadius: 4,
          bgcolor: "action.hover",
          "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 4 },
        }}
      />
    </Box>
  );
}

function TypeBreakdown({ label, metrics }: { label: string; metrics: CampaignReportMetrics }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 1.75 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {metrics.campaigns} campanha{metrics.campaigns === 1 ? "" : "s"} ·{" "}
            {integer(metrics.sent)} enviadas
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 700, color: "success.main" }}>
          {money(metrics.revenue)}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt: 1.25, flexWrap: "wrap" }}>
        <Typography variant="caption" color="text.secondary">
          Entrega <strong>{percentage(metrics.deliveryRate)}</strong>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Vendas <strong>{integer(metrics.orders)}</strong>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          ROAS <strong>{roas(metrics.roas)}</strong>
        </Typography>
      </Stack>
    </Box>
  );
}

export function ReportsTab() {
  const [period, setPeriod] = useState<CampaignReportPeriod>("30d");
  const [messageType, setMessageType] = useState<CampaignReportMessageType>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const runReport = useServerFn(getWhatsappCampaignReport);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["whatsapp-campaign-report", period, messageType],
    queryFn: () => runReport({ data: { period, messageType } }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return data?.rows ?? [];
    return (data?.rows ?? []).filter((row) =>
      [row.name, row.audienceLabel, row.templateName, STATUS_LABEL[row.status] ?? row.status]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(query)),
    );
  }, [data?.rows, search]);

  useEffect(() => setPage(0), [search, period, messageType]);

  const visibleRows = filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const trend = (data?.trend ?? []).map((point) => ({ ...point, label: chartDate(point.date) }));
  const marketing = data?.byMessageType.find((item) => item.messageType === "marketing");
  const utility = data?.byMessageType.find((item) => item.messageType === "utility");

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}
      >
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <BarChart3 size={21} />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Relatórios de campanhas
            </Typography>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label="Somente campanhas manuais"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Entrega, leitura, gasto, vendas e retorno das campanhas enviadas manualmente.
          </Typography>
        </Box>
        <LinkButton
          to="/whatsapp/automacoes"
          variant="outlined"
          size="small"
          startIcon={<Bot size={15} />}
        >
          Ver relatório das automações
        </LinkButton>
      </Stack>

      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={1}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          p: 1.25,
          alignItems: { lg: "center" },
        }}
      >
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
          {PERIODS.map((option) => (
            <Button
              key={option.value}
              size="small"
              variant={period === option.value ? "contained" : "text"}
              color={period === option.value ? "primary" : "inherit"}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </Stack>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="report-message-type-label">Tipo de mensagem</InputLabel>
          <Select
            labelId="report-message-type-label"
            label="Tipo de mensagem"
            value={messageType}
            onChange={(event) => setMessageType(event.target.value as CampaignReportMessageType)}
          >
            <MenuItem value="all">Todos os tipos</MenuItem>
            <MenuItem value="marketing">Marketing</MenuItem>
            <MenuItem value="utility">Utilidade</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        {data && (
          <Typography variant="caption" color="text.secondary">
            Atualizado em {dateTime(data.generatedAt)}
          </Typography>
        )}
        <Button
          size="small"
          variant="outlined"
          startIcon={isFetching ? <CircularProgress size={14} /> : <RefreshCw size={14} />}
          disabled={isFetching}
          onClick={() => refetch()}
        >
          Atualizar
        </Button>
      </Stack>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível carregar o relatório:{" "}
          {error instanceof Error ? error.message : "erro desconhecido"}
        </Alert>
      )}

      {isLoading && !data && (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Atualizando o relatório com os dados mais recentes…
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
                xs: "repeat(2, minmax(0, 1fr))",
                md: "repeat(4, minmax(0, 1fr))",
                xl: "repeat(8, minmax(0, 1fr))",
              },
            }}
          >
            <MetricCard
              label="Enviadas"
              value={integer(data.totals.sent)}
              hint={`${data.totals.campaigns} campanhas no período`}
            />
            <MetricCard
              label="Entregues"
              value={integer(data.totals.delivered)}
              hint={`${percentage(data.totals.deliveryRate)} das enviadas`}
            />
            <MetricCard
              label="Lidas"
              value={integer(data.totals.read)}
              hint={`${percentage(data.totals.readRate)} das entregues`}
              tone="primary"
            />
            <MetricCard
              label="Falhas"
              value={integer(data.totals.failed)}
              hint={`${percentage(data.totals.failureRate)} das tentativas`}
              tone={data.totals.failed > 0 ? "error" : "default"}
            />
            <MetricCard
              label="Gasto estimado"
              value={money(data.totals.cost)}
              hint="Tarifas configuradas no sistema"
            />
            <MetricCard
              label="Vendas"
              value={integer(data.totals.orders)}
              hint={`${percentage(data.totals.conversionRate)} por mensagem enviada`}
              tone="success"
            />
            <MetricCard
              label="Receita"
              value={money(data.totals.revenue)}
              hint={`Ticket médio ${money(data.totals.averageTicket)}`}
              tone="success"
            />
            <MetricCard
              label="ROAS"
              value={roas(data.totals.roas)}
              hint="Receita ÷ gasto estimado"
              tone="primary"
            />
          </Box>

          <Alert severity="info" variant="outlined">
            <strong>Regra de atribuição:</strong> pedidos pagos são atribuídos ao primeiro envio de
            WhatsApp feito para o telefone da cliente nos {data.attributionWindowDays} dias
            anteriores à compra. Pedidos cancelados ou reembolsados não entram, e cada pedido é
            contado uma única vez. As automações permanecem fora deste relatório.
          </Alert>

          {data.totals.campaigns === 0 ? (
            <Box
              sx={{
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: 3,
                py: 7,
                px: 2,
                textAlign: "center",
              }}
            >
              <Typography sx={{ fontWeight: 700 }}>
                Nenhuma campanha enviada neste período.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Troque o período ou o tipo de mensagem para consultar outros resultados.
              </Typography>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: { xs: "1fr", lg: "minmax(320px, 0.8fr) minmax(0, 1.7fr)" },
                }}
              >
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>Funil de mensagens</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Evolução até a compra atribuída.
                  </Typography>
                  <Stack spacing={2.25} sx={{ mt: 2.5 }}>
                    <FunnelRow
                      label="Enviadas"
                      value={data.totals.sent}
                      rate={data.totals.sent > 0 ? 100 : 0}
                      color="#2A2E42"
                    />
                    <FunnelRow
                      label="Entregues"
                      value={data.totals.delivered}
                      rate={data.totals.deliveryRate}
                      color="#7367F0"
                    />
                    <FunnelRow
                      label="Lidas"
                      value={data.totals.read}
                      rate={data.totals.sent > 0 ? (data.totals.read / data.totals.sent) * 100 : 0}
                      color="#00CFE8"
                    />
                    <FunnelRow
                      label="Vendas"
                      value={data.totals.orders}
                      rate={data.totals.conversionRate}
                      color="#28C76F"
                    />
                  </Stack>
                  <Box
                    sx={{
                      mt: 2.5,
                      display: "grid",
                      gap: 1,
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    }}
                  >
                    <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 1.25 }}>
                      <Typography variant="caption" color="text.secondary">
                        Ticket médio
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {money(data.totals.averageTicket)}
                      </Typography>
                    </Box>
                    <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 1.25 }}>
                      <Typography variant="caption" color="text.secondary">
                        Receita / mil envios
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {money(data.totals.revenuePerThousand)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>Evolução diária</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Mensagens enviadas, entregues e lidas agrupadas por dia.
                  </Typography>
                  <Box sx={{ mt: 1.5, height: 280 }}>
                    <LineChart
                      dataset={trend}
                      xAxis={[{ dataKey: "label", scaleType: "point" }]}
                      series={[
                        { dataKey: "sent", label: "Enviadas", color: "#7367F0", showMark: false },
                        {
                          dataKey: "delivered",
                          label: "Entregues",
                          color: "#28C76F",
                          showMark: false,
                        },
                        { dataKey: "read", label: "Lidas", color: "#00CFE8", showMark: false },
                      ]}
                      height={280}
                      margin={{ left: 48, right: 16, top: 24, bottom: 32 }}
                    />
                  </Box>
                </Box>
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
                }}
              >
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>Resultado por tipo</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Marketing e Utilidade permanecem identificados separadamente.
                  </Typography>
                  <Stack spacing={1.25} sx={{ mt: 2 }}>
                    {marketing && <TypeBreakdown label="Marketing" metrics={marketing.metrics} />}
                    {utility && <TypeBreakdown label="Utilidade" metrics={utility.metrics} />}
                  </Stack>
                </Box>

                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>Principais falhas</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Motivos reais devolvidos pela Meta somente para estas campanhas.
                  </Typography>
                  <Stack spacing={1.25} sx={{ mt: 2 }}>
                    {data.failures.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Nenhuma falha registrada neste período.
                      </Typography>
                    )}
                    {data.failures.slice(0, 6).map((failure) => (
                      <Box key={failure.reason}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ justifyContent: "space-between", alignItems: "baseline" }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {failure.reason}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
                          >
                            {failure.count}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={failure.percentage}
                          sx={{
                            mt: 0.75,
                            height: 6,
                            borderRadius: 3,
                            bgcolor: "action.hover",
                            "& .MuiLinearProgress-bar": { bgcolor: "error.main", borderRadius: 3 },
                          }}
                        />
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Box>

              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.5}
                  sx={{ p: 2, justifyContent: "space-between", alignItems: { md: "center" } }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>Desempenho por campanha</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Compare resultado e retorno sem misturar envios automáticos.
                    </Typography>
                  </Box>
                  <TextField
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    size="small"
                    placeholder="Buscar nesta tabela…"
                    sx={{ minWidth: { md: 260 } }}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Search size={16} />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Stack>
                <TableContainer sx={{ borderTop: "1px solid", borderColor: "divider" }}>
                  <Table size="small" sx={{ minWidth: 1_150 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "action.hover" }}>
                        <TableCell>Campanha</TableCell>
                        <TableCell>Tipo</TableCell>
                        <TableCell align="right">Enviadas</TableCell>
                        <TableCell align="right">Entregues</TableCell>
                        <TableCell align="right">Lidas</TableCell>
                        <TableCell align="right">Falhas</TableCell>
                        <TableCell align="right">Gasto</TableCell>
                        <TableCell align="right">Vendas</TableCell>
                        <TableCell align="right">Receita</TableCell>
                        <TableCell align="right">ROAS</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleRows.map((row) => (
                        <TableRow key={row.id} hover>
                          <TableCell sx={{ minWidth: 240 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {row.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block" }}
                            >
                              {dateTime(row.sentAt ?? row.createdAt)} ·{" "}
                              {STATUS_LABEL[row.status] ?? row.status}
                            </Typography>
                            {row.audienceLabel && (
                              <Typography variant="caption" color="text.secondary">
                                {row.audienceLabel}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              variant="outlined"
                              label={row.messageType === "utility" ? "Utilidade" : "Marketing"}
                            />
                          </TableCell>
                          <TableCell align="right">{integer(row.sent)}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{integer(row.delivered)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {row.sent > 0 ? percentage((row.delivered / row.sent) * 100) : "—"}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{integer(row.read)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {row.delivered > 0
                                ? percentage((row.read / row.delivered) * 100)
                                : "—"}
                            </Typography>
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ color: row.failed > 0 ? "error.main" : "text.primary" }}
                          >
                            {integer(row.failed)}
                          </TableCell>
                          <TableCell align="right">{money(row.cost)}</TableCell>
                          <TableCell align="right">{integer(row.orders)}</TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              color: row.revenue > 0 ? "success.main" : "text.primary",
                            }}
                          >
                            {money(row.revenue)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {roas(row.roas)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {visibleRows.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={10}
                            align="center"
                            sx={{ py: 4, color: "text.secondary" }}
                          >
                            Nenhuma campanha corresponde à busca.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={filteredRows.length}
                  page={Math.min(
                    page,
                    Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1),
                  )}
                  onPageChange={(_, nextPage) => setPage(nextPage)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(event) => {
                    setRowsPerPage(Number(event.target.value));
                    setPage(0);
                  }}
                  rowsPerPageOptions={[10, 25, 50]}
                  labelRowsPerPage="Campanhas por página"
                  labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
                />
              </Box>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
