import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import {
  RefreshCw,
  Info,
  Users,
  ShoppingBag,
  TrendingUp,
  Sparkles,
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  WalletCards,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { getRFMStats, calculateRFMSegments, generateRFMAnalysis } from "@/lib/crm-rfm.functions";
import { RFM_SEGMENTS_CONFIG, CLASSIC_MODE_MIN_HISTORY_DAYS, type RFMSegment } from "@/lib/crm-rfm-shared";
import { brl } from "@/lib/crm-mock";

const segColor = (name: string) => RFM_SEGMENTS_CONFIG[name as RFMSegment]?.color ?? "#94a3b8";

const RFM_SEGMENT_ORDER: RFMSegment[] = [
  "Campeões",
  "Leais",
  "Potencialmente Leais",
  "Novos",
  "Precisa de atenção",
  "Quase hibernando",
  "Em risco",
  "Hibernando",
  "Não pode perder",
  "Perdidos",
  "Sem compra",
];

const segmentOrder = (segment: RFMSegment) => RFM_SEGMENT_ORDER.indexOf(segment);

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Falha desconhecida ao carregar os dados RFM.";
}

function StatCard({ icon: Icon, iconColor, iconBg, label, value, hint }: any) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Box sx={{ borderRadius: 2, bgcolor: iconBg, color: iconColor, p: 1, display: "flex" }}>
          <Icon size={20} />
        </Box>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 500, textTransform: "uppercase", color: "text.secondary" }}>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              {hint}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

export function RFMAnalysis() {
  const queryClient = useQueryClient();
  const fetchStats = useServerFn(getRFMStats);
  const runCalculate = useServerFn(calculateRFMSegments);
  const runGenerateAI = useServerFn(generateRFMAnalysis);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["rfm-stats"],
    queryFn: () => fetchStats(),
    retry: 1,
  });

  const aiMutation = useMutation({
    mutationFn: () => runGenerateAI(),
    onError: (err: unknown) => toast.error("Erro ao gerar análise com IA: " + errorMessage(err)),
  });

  const calculateMutation = useMutation({
    mutationFn: () => runCalculate(),
    onSuccess: async (result) => {
      if (result.count > 0) {
        toast.success(`RFM recalculado: ${result.count} cliente(s) atualizado(s) de ${result.evaluatedCustomers} analisados.`);
      } else if (result.evaluatedCustomers > 0) {
        toast.success(`RFM conferido: ${result.evaluatedCustomers} cliente(s) analisados e a classificação já estava atualizada.`);
      } else {
        toast.warning("O cálculo RFM foi executado, mas não encontrou clientes na base da Shopify.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rfm-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-customers"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-segments"] }),
      ]);
    },
    onError: (err: unknown) => {
      toast.error("Erro ao calcular RFM: " + errorMessage(err));
    },
  });

  if (isLoading) {
    return (
      <Stack spacing={2} sx={{ minHeight: 400, alignItems: "center", justifyContent: "center" }}>
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary">Processando análise RFM...</Typography>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Stack direction="row" spacing={1.5} sx={{ mx: "auto", maxWidth: 640, border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "error.main", borderRadius: 2, p: 3, alignItems: "flex-start" }}>
        <AlertTriangle size={20} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-error-main, #EA5455)" />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>Não foi possível calcular a análise RFM</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{errorMessage(error)}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            A tela não vai mais esconder falhas como se fossem valores zerados. Corrija a origem indicada acima e tente novamente.
          </Typography>
          <Button
            variant="outline"
            startIcon={<RefreshCw size={16} className={isFetching ? "animate-spin" : undefined} />}
            sx={{ mt: 2 }}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Tentar novamente
          </Button>
        </Box>
      </Stack>
    );
  }

  const summary = data?.summary ?? [];
  const activeSegments = RFM_SEGMENT_ORDER;

  const chartData = summary
    .map((s) => ({ name: s.name, clientes: s.clientes, receita: s.receita, color: segColor(s.name) }))
    .sort((a, b) => segmentOrder(a.name) - segmentOrder(b.name));

  const freqData = (data?.frequencia ?? []).filter((f) => f.faixa !== "0x");
  const hasSourceCustomers = (data?.sourceCustomers ?? 0) > 0;
  const hasSourceOrders = (data?.sourceOrders ?? 0) > 0;
  const hasValidOrders = (data?.validOrders ?? 0) > 0;

  return (
    <>
      <Stack spacing={4} sx={{ pb: 6 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Análise RFM</Typography>
          <Typography variant="body2" color="text.secondary">
            Recência, Frequência e Valor — considerando apenas pedidos pagos (reembolsados, expirados,
            anulados e não pagos ficam de fora).
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            Fonte lida: {new Intl.NumberFormat().format(data?.sourceCustomers ?? 0)} clientes · {new Intl.NumberFormat().format(data?.sourceOrders ?? 0)} pedidos importados · {new Intl.NumberFormat().format(data?.validOrders ?? 0)} pedidos válidos para RFM
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button
            variant="outlined"
            startIcon={aiMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <Sparkles size={16} />}
            onClick={() => aiMutation.mutate()}
            disabled={aiMutation.isPending}
          >
            {aiMutation.isPending ? "Analisando..." : "Analisar com IA"}
          </Button>
          <Button
            variant="contained"
            startIcon={calculateMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />}
            onClick={() => calculateMutation.mutate()}
            disabled={calculateMutation.isPending}
          >
            {calculateMutation.isPending ? "Recalculando..." : "Recalcular Análise RFM"}
          </Button>
        </Stack>
      </Stack>

      {!hasSourceCustomers && (
        <Stack direction="row" spacing={1.5} sx={{ border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "error.main", borderRadius: 2, p: 2 }}>
          <AlertTriangle size={20} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-error-main, #EA5455)" />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Nenhum cliente da Shopify disponível para o RFM</Typography>
            <Typography variant="body2" color="text.secondary">Sincronize a Shopify antes de recalcular. Sem clientes importados não existe base para classificar.</Typography>
          </Box>
        </Stack>
      )}

      {hasSourceCustomers && hasSourceOrders && !hasValidOrders && (
        <Stack direction="row" spacing={1.5} sx={{ border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "warning.main", borderRadius: 2, p: 2 }}>
          <AlertTriangle size={20} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-warning-main, #FF9F43)" />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Há pedidos importados, mas nenhum pedido válido para o RFM</Typography>
            <Typography variant="body2" color="text.secondary">Confira os status financeiros sincronizados. O RFM considera PAID e PARTIALLY_PAID sem cancelamento.</Typography>
          </Box>
        </Stack>
      )}

      <Stack direction="row" spacing={1.5} sx={{ border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "primary.main", borderRadius: 2, p: 2 }}>
        <Sparkles size={20} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-primary-main, #7367F0)" />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Matriz RFM completa ativa</Typography>
          <Typography variant="body2" color="text.secondary">
            Todos os segmentos são avaliados desde já, sem bloqueio por idade da base. Há {data?.historyDays ?? 0} dias
            de histórico pago; as faixas de recência usam o ciclo real de recompra da loja.{" "}
            {!data?.ltvDisponivel && <><strong>LTV projetado continua indisponível</strong> até completar {CLASSIC_MODE_MIN_HISTORY_DAYS} dias.</>}
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            icon={Users}
            iconColor="#3b82f6"
            iconBg="rgba(59,130,246,0.1)"
            label="Base Total"
            value={new Intl.NumberFormat().format(data?.totalClientes ?? 0)}
            hint={`${new Intl.NumberFormat().format(data?.compradores ?? 0)} com compra paga`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            icon={ShoppingBag}
            iconColor="#10b981"
            iconBg="rgba(16,185,129,0.1)"
            label="Receita Válida"
            value={brl(data?.totalReceita ?? 0)}
            hint={`${new Intl.NumberFormat().format(data?.totalPedidos ?? 0)} pedidos pagos`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard icon={TrendingUp} iconColor="#7367F0" iconBg="rgba(115,103,240,0.1)" label="AOV Real" value={brl(data?.aovGeral ?? 0)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            icon={AlertTriangle}
            iconColor="#f59e0b"
            iconBg="rgba(245,158,11,0.1)"
            label="Excluído do RFM"
            value={brl(data?.receitaExcluida ?? 0)}
            hint={`${data?.pedidosExcluidos ?? 0} pedidos não pagos/reembolsados`}
          />
        </Grid>
      </Grid>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: { xs: 2, md: 3 } }}>
        <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, mb: 3, gap: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Distribuição da base RFM</Typography>
            <Typography variant="caption" color="text.secondary">
              Comparação da participação de cada segmento entre {data?.comparisonPeriod?.previousMonth ?? "mês passado"} e {data?.comparisonPeriod?.currentMonth ?? "este mês"}.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip size="small" variant="outlined" label={`Anterior · ${data?.comparisonPeriod?.previousMonth ?? "mês passado"}`} />
            <Chip size="small" color="primary" variant="outlined" label={`Atual · ${data?.comparisonPeriod?.currentMonth ?? "este mês"}`} />
          </Stack>
        </Stack>

        <Stack spacing={2}>
          {chartData.map((item) => {
            const comparison = data?.monthlyComparison?.find((row) => row.name === item.name);
            const currentPct = comparison?.currentPct ?? 0;
            const previousPct = comparison?.previousPct ?? 0;
            const delta = comparison?.deltaPp ?? 0;
            const deltaLabel = `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`;
            return (
              <Box key={item.name}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.75, sm: 2 }} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
                  <Box sx={{ width: { xs: "100%", sm: 190 }, flexShrink: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: item.color, flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.name}</Typography>
                    </Stack>
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box sx={{ flex: 1, height: 10, borderRadius: 999, bgcolor: "action.hover", overflow: "hidden" }}>
                        <Box sx={{ height: "100%", width: `${Math.min(100, currentPct)}%`, bgcolor: item.color, borderRadius: 999 }} />
                      </Box>
                      <Typography variant="body2" sx={{ width: 58, textAlign: "right", fontWeight: 800 }}>{currentPct.toFixed(1)}%</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5 }}>
                      <Box sx={{ flex: 1, height: 5, borderRadius: 999, bgcolor: "divider", overflow: "hidden" }}>
                        <Box sx={{ height: "100%", width: `${Math.min(100, previousPct)}%`, bgcolor: "text.disabled", borderRadius: 999 }} />
                      </Box>
                      <Typography variant="caption" sx={{ width: 58, textAlign: "right", color: "text.secondary" }}>{previousPct.toFixed(1)}%</Typography>
                    </Stack>
                  </Box>

                  <Box sx={{ width: { xs: "100%", sm: 105 }, textAlign: { xs: "left", sm: "right" } }}>
                    <Typography variant="caption" color="text.secondary">Variação</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: delta > 0 ? "success.main" : delta < 0 ? "error.main" : "text.secondary" }}>
                      {deltaLabel}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          })}
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mt: 3, pt: 2, borderTop: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 18, height: 8, borderRadius: 99, bgcolor: "primary.main" }} />
            <Typography variant="caption" color="text.secondary">Atual</Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 18, height: 5, borderRadius: 99, bgcolor: "text.disabled" }} />
            <Typography variant="caption" color="text.secondary">Mês anterior</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">A variação é em pontos percentuais (pp), não em crescimento relativo.</Typography>
        </Stack>
      </Box>

      <Grid container spacing={2}>
        {[
          { icon: <Crown size={18} />, label: "Segmento em destaque", value: chartData[0]?.name ?? "—", hint: "Primeiro segmento da matriz" },
          { icon: <WalletCards size={18} />, label: "Receita por cliente", value: brl(data?.totalClientes ? (data?.totalReceita ?? 0) / data.totalClientes : 0), hint: "Média sobre toda a base" },
          { icon: <Clock3 size={18} />, label: "Histórico disponível", value: String(data?.historyDays ?? 0) + " dias", hint: data?.classicMode ? "Histórico suficiente para LTV" : "LTV ainda não projetado" },
          { icon: <ArrowUpRight size={18} />, label: "Compradores ativos", value: new Intl.NumberFormat().format(data?.compradores ?? 0), hint: data?.totalClientes ? ((data.compradores / data.totalClientes) * 100).toFixed(1) + "% da base" : "0% da base" },
        ].map((item) => (
          <Grid key={item.label} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: "action.hover", color: "primary.main", display: "flex" }}>{item.icon}</Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.hint}</Typography>
                </Box>
              </Stack>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider", p: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Resumo dos Segmentos</Typography>
          <Typography variant="body2" color="text.secondary">
            Métricas reais observadas. Sem projeção de LTV — {data?.ltvDisponivel ? "histórico suficiente" : "LTV indisponível por histórico insuficiente"}.
          </Typography>
        </Box>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 200 }}>Segmento</TableCell>
                <TableCell align="right">Clientes</TableCell>
                <TableCell align="right">% Base</TableCell>
                <TableCell align="right">Pedidos Pagos</TableCell>
                <TableCell align="right">Freq. Média</TableCell>
                <TableCell align="right">Receita Válida</TableCell>
                <TableCell align="right">% Receita</TableCell>
                <TableCell align="right">AOV</TableCell>
                <TableCell align="right">Recência</TableCell>
                <TableCell align="right">Receita / Cliente</TableCell>
                <TableCell align="right">Tempo de Base</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.totalClientes ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4, color: "text.secondary" }}>Nenhum cliente disponível para análise RFM.</TableCell>
                </TableRow>
              ) : (
                [...summary]
                  .sort((a, b) => segmentOrder(a.name) - segmentOrder(b.name))
                  .map((s) => (
                    <TableRow key={s.name} hover>
                      <TableCell sx={{ fontWeight: 500 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: segColor(s.name) }} />
                          {s.name}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{new Intl.NumberFormat().format(s.clientes)}</TableCell>
                      <TableCell align="right"><Chip size="small" label={`${s.pctBase.toFixed(1)}%`} /></TableCell>
                      <TableCell align="right">{new Intl.NumberFormat().format(s.pedidos)}</TableCell>
                      <TableCell align="right">{s.frequenciaMedia.toFixed(2)}x</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: "success.main" }}>{brl(s.receita)}</TableCell>
                      <TableCell align="right">
                        <Box sx={{ mt: 0.5, height: 6, width: "100%", overflow: "hidden", borderRadius: 999, bgcolor: "action.hover" }}>
                          <Box sx={{ height: "100%", bgcolor: "success.main", width: `${s.pctReceita}%` }} />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontSize: 10 }}>{s.pctReceita.toFixed(1)}%</Typography>
                      </TableCell>
                      <TableCell align="right">{brl(s.aov)}</TableCell>
                      <TableCell align="right" sx={{ color: "text.secondary" }}>
                        {s.recenciaMediaDias === null ? "—" : `${Math.round(s.recenciaMediaDias)}d`}
                        {s.recenciaMedianaDias !== null && <Typography component="span" variant="caption" sx={{ display: "block" }}>med. {Math.round(s.recenciaMedianaDias)}d</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ color: "info.main" }}>{brl(s.receitaPorCliente)}</TableCell>
                      <TableCell align="right" sx={{ color: "text.secondary" }}>{s.tenureMedioDias === null ? "—" : `${Math.round(s.tenureMedioDias)}d`}</TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Grid container spacing={2}>
        {activeSegments.map((name) => (
          <Grid key={name} size={{ xs: 12, md: 6, lg: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: RFM_SEGMENTS_CONFIG[name].color, borderRadius: 3, p: 2.5 }}>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography sx={{ fontWeight: 700 }}>{name}</Typography>
                <Info size={16} color="var(--mui-palette-text-secondary)" />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, lineHeight: 1.6 }}>
                {RFM_SEGMENTS_CONFIG[name].description}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Stack>

      <Dialog
        open={aiMutation.isPending || Boolean(aiMutation.data)}
        onClose={() => { if (!aiMutation.isPending) aiMutation.reset(); }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Box sx={{ p: 1, borderRadius: 2, bgcolor: "primary.50", color: "primary.main", display: "flex" }}>
              <Sparkles size={20} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Análise RFM por IA</Typography>
              <Typography variant="caption" color="text.secondary">
                Diagnóstico baseado nos dados atuais, na comparação mensal e nos dias de recência.
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {aiMutation.isPending ? (
            <Stack spacing={2} sx={{ minHeight: 300, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <CircularProgress size={36} />
              <Box>
                <Typography sx={{ fontWeight: 700 }}>Lendo sua matriz RFM...</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  A IA está cruzando recência em dias, frequência, receita e movimentação entre os segmentos.
                </Typography>
              </Box>
            </Stack>
          ) : aiMutation.data ? (
            <Stack spacing={3}>
              <Box sx={{ borderRadius: 3, p: 2.5, bgcolor: "action.hover", border: "1px solid", borderColor: "divider" }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>Diagnóstico executivo</Typography>
                <Typography variant="body1" sx={{ mt: 0.5, lineHeight: 1.7 }}>{aiMutation.data.executiveSummary}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Como está a base hoje</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{aiMutation.data.currentSituation}</Typography>
              </Box>

              <Grid container spacing={2}>
                {aiMutation.data.metricHighlights?.map((item: any) => (
                  <Grid key={item.metric} size={{ xs: 12, sm: 6 }}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                      <Typography variant="caption" color="text.secondary">{item.metric}</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.25 }}>{item.value}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, lineHeight: 1.5 }}>{item.interpretation}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Box sx={{ height: "100%", border: "1px solid", borderColor: "success.200", borderRadius: 3, p: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Sinais positivos</Typography>
                    <Stack spacing={1}>
                      {(aiMutation.data.positiveSignals ?? []).map((item: string, i: number) => <Typography key={i} variant="body2" sx={{ lineHeight: 1.55 }}>• {item}</Typography>)}
                    </Stack>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Box sx={{ height: "100%", border: "1px solid", borderColor: "warning.200", borderRadius: 3, p: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Pontos de atenção</Typography>
                    <Stack spacing={1}>
                      {(aiMutation.data.attentionPoints ?? []).map((item: string, i: number) => <Typography key={i} variant="body2" sx={{ lineHeight: 1.55 }}>• {item}</Typography>)}
                    </Stack>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Box sx={{ height: "100%", border: "1px solid", borderColor: "info.200", borderRadius: 3, p: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Oportunidades</Typography>
                    <Stack spacing={1}>
                      {(aiMutation.data.opportunities ?? []).map((item: string, i: number) => <Typography key={i} variant="body2" sx={{ lineHeight: 1.55 }}>• {item}</Typography>)}
                    </Stack>
                  </Box>
                </Grid>
              </Grid>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5 }}>Plano de ação sugerido</Typography>
                <Stack spacing={1.25}>
                  {(aiMutation.data.actionPlan ?? []).map((item: any, i: number) => (
                    <Box key={i} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 2 }}>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between" }}>
                        <Box>
                          <Chip size="small" label={item.horizon} sx={{ mb: 0.75 }} />
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.title}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>{item.action}</Typography>
                        </Box>
                        <Box sx={{ minWidth: { sm: 210 } }}>
                          <Typography variant="caption" color="text.secondary">Alvo</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.target}</Typography>
                        </Box>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>

              {(aiMutation.data.caveats ?? []).length > 0 && (
                <Box sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
                  <Typography variant="caption" color="text.secondary">
                    <strong>Cuidados:</strong> {aiMutation.data.caveats.join(" ")}
                  </Typography>
                </Box>
              )}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => aiMutation.reset()}>{aiMutation.data ? "Fechar" : "Cancelar"}</Button>
          {aiMutation.data && (
            <Button variant="outlined" startIcon={<Sparkles size={16} />} onClick={() => aiMutation.mutate()}>
              Gerar nova análise
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
