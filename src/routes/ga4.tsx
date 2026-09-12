import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gauge,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { LineChart } from "@mui/x-charts/LineChart";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  getGa4HistoricalReport,
  getGa4RealtimeReport,
  getGa4Status,
  removeGa4Connection,
  saveGa4Connection,
  testGa4Connection,
} from "@/lib/google-analytics.functions";
import {
  todayInSaoPaulo,
  type Ga4DateRange,
} from "@/lib/google-analytics.shared";

export const Route = createFileRoute("/ga4")({
  component: GoogleAnalyticsPage,
  head: () => ({
    meta: [
      { title: "Google Analytics 4 | CRM Analytics" },
      {
        name: "description",
        content:
          "Relatórios GA4 em tempo real e históricos para analisar tráfego, conteúdo e vendas.",
      },
    ],
  }),
});

const TREND_SERIES = [
  { key: "sessions" as const, label: "Sessões", color: "#7367F0" },
  { key: "screenPageViews" as const, label: "Visualizações", color: "#00CFE8" },
  { key: "activeUsers" as const, label: "Usuários ativos", color: "#28C76F" },
];

function isoDaysAgo(days: number, endDate = todayInSaoPaulo()) {
  const date = new Date(`${endDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function number(value: unknown) {
  return Number(value ?? 0);
}

function integer(value: unknown) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    number(value),
  );
}

function decimal(value: unknown, digits = 1) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number(value));
}

function percent(value: unknown) {
  return `${decimal(number(value) * 100, 1)}%`;
}

function currency(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(number(value));
}

function duration(value: unknown) {
  const seconds = Math.max(0, Math.round(number(value)));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}min ${seconds % 60}s` : `${seconds}s`;
}

function ChangeBadge({ value }: { value: number | null | undefined }) {
  if (value == null)
    return (
      <Typography variant="caption" color="text.secondary">
        sem base anterior
      </Typography>
    );
  const positive = value >= 0;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: positive ? "success.main" : "error.main" }}>
      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {positive ? "+" : ""}
        {decimal(value * 100, 1)}%
      </Typography>
    </Stack>
  );
}

function StatCard({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: number | null | undefined;
  hint?: string;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          {label}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-end", mt: 0.5 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
          {change !== undefined && <ChangeBadge value={change} />}
        </Stack>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {hint}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyRows() {
  return (
    <TableRow>
      <TableCell colSpan={10} align="center" sx={{ height: 96, color: "text.secondary" }}>
        Nenhum dado retornado para este período.
      </TableCell>
    </TableRow>
  );
}

function ConnectionPanel({ connected }: { connected: boolean }) {
  const queryClient = useQueryClient();
  const saveConnection = useServerFn(saveGa4Connection);
  const testConnection = useServerFn(testGa4Connection);
  const disconnect = useServerFn(removeGa4Connection);
  const [propertyId, setPropertyId] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [connectionFeedback, setConnectionFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const canSave = Boolean(propertyId.trim() && serviceAccountJson.trim());

  const saveMutation = useMutation({
    mutationFn: () =>
      saveConnection({ data: { propertyId, serviceAccountJson } }),
    onMutate: () => setConnectionFeedback(null),
    onSuccess: () => {
      setConnectionFeedback({
        type: "success",
        message: "Conexão salva e testada com sucesso.",
      });
      toast.success("GA4 conectado e testado com sucesso.");
      setServiceAccountJson("");
      queryClient.invalidateQueries({ queryKey: ["ga4"] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Falha ao conectar o GA4.";
      setConnectionFeedback({ type: "error", message });
      toast.error(message);
    },
  });
  const testMutation = useMutation({
    mutationFn: () => testConnection(),
    onSuccess: (result) => {
      if (result.success) toast.success("Conexão com o GA4 funcionando.");
      else toast.error(result.error);
      queryClient.invalidateQueries({ queryKey: ["ga4", "status"] });
    },
  });
  const disconnectMutation = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Conexão GA4 removida.");
      queryClient.removeQueries({ queryKey: ["ga4"] });
      queryClient.invalidateQueries({ queryKey: ["ga4", "status"] });
    },
  });

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 7 }}>
        <Card variant="outlined" sx={{ height: "100%" }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {connected ? "Alterar conexão" : "Conectar propriedade GA4"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              A conta de serviço permite que os relatórios e as automações
              consultem o GA4 sem depender de login manual.
            </Typography>

            <Stack spacing={2}>
              <Box>
                <TextField
                  fullWidth
                  label="ID numérico da propriedade"
                  inputMode="numeric"
                  placeholder="123456789"
                  value={propertyId}
                  onChange={(event) => setPropertyId(event.target.value)}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  Administração → Detalhes da propriedade → ID da propriedade.
                </Typography>
              </Box>
              <Box>
                <TextField
                  fullWidth
                  multiline
                  rows={7}
                  label="JSON da conta de serviço"
                  placeholder={
                    '{\n  "type": "service_account",\n  "client_email": "...",\n  "private_key": "..."\n}'
                  }
                  value={serviceAccountJson}
                  onChange={(event) => setServiceAccountJson(event.target.value)}
                  sx={{ "& textarea": { fontFamily: "monospace", fontSize: 12 } }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  A chave é processada e armazenada somente no servidor.
                </Typography>
              </Box>

              {connectionFeedback && (
                <Alert severity={connectionFeedback.type === "error" ? "error" : "success"}>
                  <AlertTitle>
                    {connectionFeedback.type === "error"
                      ? "Não foi possível conectar"
                      : "Conexão concluída"}
                  </AlertTitle>
                  {connectionFeedback.message}
                </Alert>
              )}

              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />}
                  onClick={() => saveMutation.mutate()}
                  disabled={!canSave || saveMutation.isPending}
                >
                  Salvar e testar
                </Button>
                {connected && (
                  <>
                    <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                      Testar conexão
                    </Button>
                    <Button variant="destructive" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                      Desconectar
                    </Button>
                  </>
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {!canSave
                  ? "Preencha o ID da propriedade e o JSON para liberar o botão."
                  : saveMutation.isPending
                    ? "Testando o acesso no Google Analytics..."
                    : "O teste pode levar alguns segundos e o resultado aparecerá aqui."}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 5 }}>
        <Card variant="outlined" sx={{ height: "100%" }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Como liberar o acesso
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Passos necessários uma única vez no Google.
            </Typography>
            <Stack spacing={1.5}>
              <Typography variant="body2">
                <strong>1.</strong> Ative a Google Analytics Data API no seu projeto do Google Cloud.
              </Typography>
              <Typography variant="body2">
                <strong>2.</strong> Crie uma conta de serviço e gere uma chave no formato JSON.
              </Typography>
              <Typography variant="body2">
                <strong>3.</strong> Copie o <code>client_email</code> do JSON.
              </Typography>
              <Typography variant="body2">
                <strong>4.</strong> No GA4, adicione esse e-mail em Gerenciamento de acesso à propriedade com função de Leitor.
              </Typography>
              <Typography variant="body2">
                <strong>5.</strong> Informe o ID numérico da propriedade e cole o JSON ao lado.
              </Typography>
            </Stack>
            <Link
              href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
              target="_blank"
              rel="noreferrer"
              underline="hover"
              sx={{ mt: 3, display: "inline-flex", alignItems: "center", gap: 0.75, fontWeight: 500 }}
            >
              Abrir Google Cloud <ExternalLink size={14} />
            </Link>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

function RealtimePanel({ enabled }: { enabled: boolean }) {
  const runRealtime = useServerFn(getGa4RealtimeReport);
  const query = useQuery({
    queryKey: ["ga4", "realtime"],
    queryFn: () => runRealtime(),
    enabled,
    refetchInterval: 60_000,
  });
  const data = query.data;

  if (query.isLoading)
    return (
      <Box sx={{ display: "flex", height: 256, alignItems: "center", justifyContent: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  if (query.error)
    return (
      <Alert severity="error">
        <AlertTitle>Falha no tempo real</AlertTitle>
        {query.error.message}
      </Alert>
    );
  if (!data) return null;

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Últimos 30 minutos · atualização automática a cada minuto
        </Typography>
        <Button
          variant="outline"
          size="small"
          startIcon={<RefreshCw size={14} className={query.isFetching ? "animate-spin" : undefined} />}
          onClick={() => query.refetch()}
        >
          Atualizar
        </Button>
      </Stack>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, xl: 3 }}>
          <StatCard label="Usuários ativos agora" value={integer(data.summary.activeUsers)} hint="Usuários distintos nos últimos 30 minutos" />
        </Grid>
        <Grid size={{ xs: 6, xl: 3 }}>
          <StatCard label="Visualizações online" value={integer(data.summary.screenPageViews)} />
        </Grid>
        <Grid size={{ xs: 6, xl: 3 }}>
          <StatCard label="Eventos online" value={integer(data.summary.eventCount)} />
        </Grid>
        <Grid size={{ xs: 6, xl: 3 }}>
          <StatCard label="Conversões online" value={integer(data.summary.keyEvents)} hint="Eventos marcados como principais" />
        </Grid>
      </Grid>

      {data.warnings.map((warning) => (
        <Alert key={warning} severity="info">
          {warning}
        </Alert>
      ))}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Páginas visualizadas agora
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Títulos das páginas com usuários ativos.
              </Typography>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Página</TableCell>
                      <TableCell align="right">Usuários</TableCell>
                      <TableCell align="right">Views</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.pages.length ? (
                      data.pages.map((row, index) => (
                        <TableRow key={`${row.unifiedScreenName}-${index}`}>
                          <TableCell sx={{ maxWidth: 320, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.unifiedScreenName || "Sem título"}
                          </TableCell>
                          <TableCell align="right">{integer(row.activeUsers)}</TableCell>
                          <TableCell align="right">{integer(row.screenPageViews)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyRows />
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Dispositivos online
                </Typography>
                <Stack spacing={1}>
                  {data.devices.map((row) => (
                    <Stack
                      key={String(row.deviceCategory)}
                      direction="row"
                      sx={{ justifyContent: "space-between", pb: 1, borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { border: "none", pb: 0 } }}
                    >
                      <Typography variant="body2" sx={{ textTransform: "capitalize" }}>
                        {row.deviceCategory}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {integer(row.activeUsers)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Países online
                </Typography>
                <Stack spacing={1}>
                  {data.countries.slice(0, 10).map((row) => (
                    <Stack
                      key={String(row.country)}
                      direction="row"
                      sx={{ justifyContent: "space-between", pb: 1, borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { border: "none", pb: 0 } }}
                    >
                      <Typography variant="body2">{row.country}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {integer(row.activeUsers)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Eventos acontecendo agora
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Ajuda a conferir navegação, carrinho, checkout e compras em tempo real.
          </Typography>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Evento</TableCell>
                  <TableCell align="right">Ocorrências</TableCell>
                  <TableCell align="right">Usuários</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.events.length ? (
                  data.events.map((row) => (
                    <TableRow key={String(row.eventName)}>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{row.eventName}</TableCell>
                      <TableCell align="right">{integer(row.eventCount)}</TableCell>
                      <TableCell align="right">{integer(row.activeUsers)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyRows />
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Stack>
  );
}

function HistoricalPanel({ enabled }: { enabled: boolean }) {
  const today = todayInSaoPaulo();
  const runHistorical = useServerFn(getGa4HistoricalReport);
  const [startDate, setStartDate] = useState(isoDaysAgo(29, today));
  const [endDate, setEndDate] = useState(today);
  const [appliedRange, setAppliedRange] = useState<Ga4DateRange>({
    startDate,
    endDate,
  });

  const query = useQuery({
    queryKey: ["ga4", "historical", appliedRange],
    queryFn: () => runHistorical({ data: appliedRange }),
    enabled,
  });
  const data = query.data;

  const applyPreset = (days: number | "all") => {
    const nextStart =
      days === "all" ? "2020-10-14" : isoDaysAgo(days - 1, today);
    setStartDate(nextStart);
    setEndDate(today);
    setAppliedRange({ startDate: nextStart, endDate: today });
  };

  const observations = useMemo(() => {
    if (!data) return [];
    const keys = [
      ["sessions", "Sessões"],
      ["screenPageViews", "Visualizações"],
      ["activeUsers", "Usuários ativos"],
      ["engagementRate", "Taxa de engajamento"],
      ["purchaseRevenue", "Receita de compras"],
    ] as const;
    return keys
      .map(([key, label]) => ({ key, label, value: data.changes[key] }))
      .filter((item) => item.value != null)
      .sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0))
      .slice(0, 4);
  }, [data]);

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", alignItems: "flex-end" }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <Button variant="outline" size="small" onClick={() => applyPreset(1)}>Hoje</Button>
              <Button variant="outline" size="small" onClick={() => applyPreset(7)}>7 dias</Button>
              <Button variant="outline" size="small" onClick={() => applyPreset(30)}>30 dias</Button>
              <Button variant="outline" size="small" onClick={() => applyPreset(90)}>90 dias</Button>
              <Button variant="outline" size="small" onClick={() => applyPreset(365)}>12 meses</Button>
              <Button variant="outline" size="small" onClick={() => applyPreset("all")}>Todo período</Button>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ ml: "auto", flexWrap: "wrap", alignItems: "flex-end" }}>
              <TextField
                size="small"
                type="date"
                label="De"
                value={startDate}
                slotProps={{ htmlInput: { max: endDate }, inputLabel: { shrink: true } }}
                onChange={(event) => setStartDate(event.target.value)}
              />
              <TextField
                size="small"
                type="date"
                label="Até"
                value={endDate}
                slotProps={{ htmlInput: { min: startDate, max: today }, inputLabel: { shrink: true } }}
                onChange={(event) => setEndDate(event.target.value)}
              />
              <Button
                variant="contained"
                onClick={() => setAppliedRange({ startDate, endDate })}
                disabled={!startDate || !endDate || startDate > endDate}
              >
                Aplicar
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {query.isLoading && (
        <Box sx={{ display: "flex", height: 288, alignItems: "center", justifyContent: "center" }}>
          <CircularProgress size={32} />
        </Box>
      )}
      {query.error && (
        <Alert severity="error">
          <AlertTitle>Não foi possível carregar o relatório</AlertTitle>
          {query.error.message}
        </Alert>
      )}
      {data && (
        <>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Usuários" value={integer(data.summary.totalUsers)} change={data.changes.totalUsers} />
            </Grid>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Sessões" value={integer(data.summary.sessions)} change={data.changes.sessions} />
            </Grid>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Visualizações" value={integer(data.summary.screenPageViews)} change={data.changes.screenPageViews} />
            </Grid>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Engajamento" value={percent(data.summary.engagementRate)} change={data.changes.engagementRate} />
            </Grid>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Receita GA4" value={currency(data.summary.purchaseRevenue)} change={data.changes.purchaseRevenue} />
            </Grid>
          </Grid>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Novos usuários" value={integer(data.summary.newUsers)} change={data.changes.newUsers} />
            </Grid>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Usuários ativos" value={integer(data.summary.activeUsers)} change={data.changes.activeUsers} />
            </Grid>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Tempo médio" value={duration(data.summary.averageSessionDuration)} change={data.changes.averageSessionDuration} />
            </Grid>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Conversões" value={integer(data.summary.keyEvents)} change={data.changes.keyEvents} />
            </Grid>
            <Grid size={{ xs: 6, xl: 12 / 5 }}>
              <StatCard label="Compras" value={integer(data.summary.ecommercePurchases)} change={data.changes.ecommercePurchases} />
            </Grid>
          </Grid>

          {data.warnings.map((warning) => (
            <Alert key={warning} severity="info">
              {warning}
            </Alert>
          ))}

          {observations.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Pontos de evolução e retração
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Comparação automática com o período anterior de mesma duração.
                </Typography>
                <Grid container spacing={1.5}>
                  {observations.map((item) => {
                    const positive = (item.value || 0) >= 0;
                    return (
                      <Grid key={item.key} size={{ xs: 12, md: 6, xl: 3 }}>
                        <Box
                          sx={{
                            border: "1px solid",
                            borderColor: positive ? "success.main" : "error.main",
                            bgcolor: positive ? "success.50" : "error.50",
                            borderRadius: 2,
                            p: 1.5,
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {item.label}
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: positive ? "success.main" : "error.main" }}>
                            {positive ? "+" : ""}
                            {decimal((item.value || 0) * 100, 1)}%
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            vs. período anterior
                          </Typography>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              </CardContent>
            </Card>
          )}

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Evolução diária
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Sessões, visualizações e usuários ativos ao longo do período.
              </Typography>
              <LineChart
                height={320}
                xAxis={[
                  {
                    data: data.trend.map((d) => String(d.date)),
                    scaleType: "point",
                    valueFormatter: (v: string) => `${v.slice(6, 8)}/${v.slice(4, 6)}`,
                  },
                ]}
                series={TREND_SERIES.map((s) => ({
                  data: data.trend.map((d) => Number((d as MetricRow)[s.key] ?? 0)),
                  label: s.label,
                  color: s.color,
                  showMark: false,
                }))}
                grid={{ horizontal: true }}
                margin={{ left: 48, right: 16, top: 24, bottom: 32 }}
              />
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Páginas mais visualizadas
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Todas as pageviews, inclusive quando a página não foi a entrada da sessão.
              </Typography>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Página</TableCell>
                      <TableCell align="right">Views</TableCell>
                      <TableCell align="right">Usuários</TableCell>
                      <TableCell align="right">Engajamento</TableCell>
                      <TableCell align="right">Tempo médio</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.pages.length ? (
                      data.pages.map((row, index) => (
                        <TableRow key={`${row.pagePathPlusQueryString}-${index}`}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {row.pageTitle || "Sem título"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {row.pagePathPlusQueryString}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{integer(row.screenPageViews)}</TableCell>
                          <TableCell align="right">{integer(row.activeUsers)}</TableCell>
                          <TableCell align="right">{percent(row.engagementRate)}</TableCell>
                          <TableCell align="right">{duration(row.averageSessionDuration)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyRows />
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Produtos mais visualizados
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Funil do evento view_item até a compra; estes dados alimentarão os criativos automáticos.
              </Typography>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Produto</TableCell>
                      <TableCell align="right">Vistos</TableCell>
                      <TableCell align="right">Carrinho</TableCell>
                      <TableCell align="right">Checkout</TableCell>
                      <TableCell align="right">Comprados</TableCell>
                      <TableCell align="right">Receita</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.products.length ? (
                      data.products.map((row, index) => (
                        <TableRow key={`${row.itemId}-${index}`}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {row.itemName || "Produto sem nome"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {row.itemId}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{integer(row.itemsViewed)}</TableCell>
                          <TableCell align="right">{integer(row.itemsAddedToCart)}</TableCell>
                          <TableCell align="right">{integer(row.itemsCheckedOut)}</TableCell>
                          <TableCell align="right">{integer(row.itemsPurchased)}</TableCell>
                          <TableCell align="right">{currency(row.itemRevenue)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyRows />
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, xl: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                    Canais de aquisição
                  </Typography>
                  <TableContainer sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Canal</TableCell>
                          <TableCell align="right">Sessões</TableCell>
                          <TableCell align="right">Receita</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.channels.length ? (
                          data.channels.map((row) => (
                            <TableRow key={String(row.sessionDefaultChannelGroup)}>
                              <TableCell>{row.sessionDefaultChannelGroup}</TableCell>
                              <TableCell align="right">{integer(row.sessions)}</TableCell>
                              <TableCell align="right">{currency(row.purchaseRevenue)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <EmptyRows />
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, xl: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                    Origens e mídias
                  </Typography>
                  <TableContainer sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Origem / mídia</TableCell>
                          <TableCell align="right">Sessões</TableCell>
                          <TableCell align="right">Conversões</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.sources.length ? (
                          data.sources.slice(0, 20).map((row) => (
                            <TableRow key={String(row.sessionSourceMedium)}>
                              <TableCell>{row.sessionSourceMedium}</TableCell>
                              <TableCell align="right">{integer(row.sessions)}</TableCell>
                              <TableCell align="right">{integer(row.keyEvents)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <EmptyRows />
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, xl: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                    Campanhas
                  </Typography>
                  <TableContainer sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Campanha</TableCell>
                          <TableCell align="right">Sessões</TableCell>
                          <TableCell align="right">Receita</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.campaigns.length ? (
                          data.campaigns.slice(0, 20).map((row, index) => (
                            <TableRow key={`${row.sessionCampaignName}-${index}`}>
                              <TableCell>
                                <Typography variant="body2">{row.sessionCampaignName}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {row.sessionSourceMedium}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">{integer(row.sessions)}</TableCell>
                              <TableCell align="right">{currency(row.purchaseRevenue)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <EmptyRows />
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, xl: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                    Dispositivos
                  </Typography>
                  <TableContainer sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Dispositivo</TableCell>
                          <TableCell>Navegador / SO</TableCell>
                          <TableCell align="right">Sessões</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.devices.length ? (
                          data.devices.slice(0, 20).map((row, index) => (
                            <TableRow key={`${row.deviceCategory}-${index}`}>
                              <TableCell sx={{ textTransform: "capitalize" }}>{row.deviceCategory}</TableCell>
                              <TableCell>
                                {row.browser} / {row.operatingSystem}
                              </TableCell>
                              <TableCell align="right">{integer(row.sessions)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <EmptyRows />
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Localização dos acessos
              </Typography>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>País</TableCell>
                      <TableCell>Estado / região</TableCell>
                      <TableCell>Cidade</TableCell>
                      <TableCell align="right">Usuários</TableCell>
                      <TableCell align="right">Sessões</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.geography.length ? (
                      data.geography.map((row, index) => (
                        <TableRow key={`${row.country}-${row.region}-${row.city}-${index}`}>
                          <TableCell>{row.country}</TableCell>
                          <TableCell>{row.region}</TableCell>
                          <TableCell>{row.city}</TableCell>
                          <TableCell align="right">{integer(row.activeUsers)}</TableCell>
                          <TableCell align="right">{integer(row.sessions)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyRows />
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

type MetricRow = Record<string, string | number>;

function GoogleAnalyticsPage() {
  const getStatus = useServerFn(getGa4Status);
  const [tab, setTab] = useState("historical");
  const statusQuery = useQuery({
    queryKey: ["ga4", "status"],
    queryFn: () => getStatus(),
  });
  const status = statusQuery.data;

  return (
    <Box sx={{ maxWidth: 1700, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 3,
              bgcolor: "warning.50",
              color: "warning.main",
            }}
          >
            <BarChart3 size={20} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Google Analytics 4
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tempo real, histórico e oportunidades de melhoria do site.
            </Typography>
          </Box>
        </Stack>
        {statusQuery.isLoading ? (
          <Chip label="Verificando..." />
        ) : status?.connected ? (
          <Chip color="success" icon={<CheckCircle2 size={14} />} label={`Conectado · ${status.propertyId}`} />
        ) : (
          <Chip label="Não conectado" />
        )}
      </Stack>

      {!statusQuery.isLoading && !status?.connected ? (
        <ConnectionPanel connected={false} />
      ) : status?.connected ? (
        <>
          <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab value="historical" icon={<Gauge size={16} />} iconPosition="start" label="Histórico" sx={{ minHeight: 40 }} />
              <Tab value="realtime" icon={<Activity size={16} />} iconPosition="start" label="Tempo real" sx={{ minHeight: 40 }} />
              <Tab value="settings" icon={<Settings size={16} />} iconPosition="start" label="Configuração" sx={{ minHeight: 40 }} />
            </Tabs>
          </Box>
          {tab === "historical" && <HistoricalPanel enabled={tab === "historical"} />}
          {tab === "realtime" && <RealtimePanel enabled={tab === "realtime"} />}
          {tab === "settings" && (
            <Stack spacing={2}>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <StatCard label="Propriedade" value={status.propertyId} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <StatCard label="Conta de serviço" value="Ativa" hint={status.serviceAccountEmail} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <StatCard
                    label="Último teste"
                    value={status.lastTestedAt ? new Date(status.lastTestedAt).toLocaleDateString("pt-BR") : "—"}
                    hint={status.lastError || "Sem erro registrado"}
                  />
                </Grid>
              </Grid>
              <ConnectionPanel connected />
            </Stack>
          )}
        </>
      ) : null}

      <Alert severity="info" icon={<Clock3 size={18} />} sx={{ mt: 3 }}>
        <AlertTitle>Sobre o histórico máximo</AlertTitle>
        O filtro aceita qualquer intervalo desde o início do GA4. O relatório
        exibirá somente dados realmente existentes e disponíveis na
        propriedade; datas anteriores à instalação da tag não podem ser
        recuperadas.
      </Alert>
    </Box>
  );
}
