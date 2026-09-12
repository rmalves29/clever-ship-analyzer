import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart } from "@mui/x-charts/BarChart";
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
} from "lucide-react";
import { toast } from "sonner";
import { getRFMStats, calculateRFMSegments } from "@/lib/crm-rfm.functions";
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
        <Button
          variant="contained"
          startIcon={calculateMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <Sparkles size={16} />}
          onClick={() => calculateMutation.mutate()}
          disabled={calculateMutation.isPending}
        >
          {calculateMutation.isPending ? "Recalculando..." : "Recalcular Análise RFM"}
        </Button>
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

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 3 }}>Clientes por Segmento</Typography>
            <BarChart
              height={300}
              layout="horizontal"
              yAxis={[{
                scaleType: "band",
                data: chartData.map((d) => d.name),
                colorMap: { type: "ordinal", values: chartData.map((d) => d.name), colors: chartData.map((d) => d.color) },
              }]}
              series={[{ data: chartData.map((d) => d.clientes) }]}
              grid={{ vertical: true }}
              margin={{ left: 140 }}
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 3 }}>Clientes por Frequência de Compra</Typography>
            <BarChart
              height={300}
              xAxis={[{ scaleType: "band", data: freqData.map((f) => f.faixa) }]}
              series={[{ data: freqData.map((f) => f.clientes), color: "#3b82f6" }]}
              grid={{ horizontal: true }}
            />
          </Box>
        </Grid>
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
                <TableCell align="right">Receita / Cliente</TableCell>
                <TableCell align="right">Tempo de Base</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.totalClientes ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4, color: "text.secondary" }}>Nenhum cliente disponível para análise RFM.</TableCell>
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
  );
}
