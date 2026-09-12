import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import { PieChart } from "@mui/x-charts/PieChart";
import { Maximize2 } from "lucide-react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { DashboardData, PanelBadge } from "@/lib/crm-mock";
import { brlCents } from "@/lib/crm-mock";

type ChipColor = "success" | "warning" | "error" | "default";

const BADGE_COLOR: Record<PanelBadge, ChipColor> = {
  meta: "success",
  regular: "warning",
  critico: "error",
  "sem-dados": "default",
};
const BADGE_LABEL: Record<PanelBadge, string> = {
  meta: "na meta",
  regular: "regular",
  critico: "crítico",
  "sem-dados": "sem dados",
};

const CHART = ["#7367F0", "#00CFE8", "#FF9F43", "#28C76F"];

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Stack sx={{ height: "100%", alignItems: "center", justifyContent: "center", border: "1px dashed", borderColor: "divider", borderRadius: 2, p: 2, textAlign: "center" }}>
      <Typography variant="caption" color="text.secondary">{children}</Typography>
    </Stack>
  );
}

function PanelHeader({ index, title, status }: { index: string; title: string; status?: PanelBadge }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
      <Typography variant="caption" sx={{ mt: 0.25, fontFamily: "monospace", color: "text.secondary" }}>{index}</Typography>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      </Box>
      {status && <Chip size="small" color={BADGE_COLOR[status]} label={BADGE_LABEL[status]} sx={{ textTransform: "uppercase", fontSize: 10, fontWeight: 700 }} />}
      <Maximize2 size={16} color="var(--mui-palette-text-secondary, #6f6b7d)" />
    </Stack>
  );
}

function Panel({
  index,
  title,
  description,
  status,
  footnote,
  empty,
  children,
}: {
  index: string;
  title: string;
  description: string;
  status: PanelBadge;
  /** Tamanho da amostra / ressalva metodológica exibida abaixo do gráfico. */
  footnote?: string;
  /** Mensagem exibida no lugar do gráfico quando não há amostra suficiente. */
  empty?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
      <PanelHeader index={index} title={title} status={status} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>{description}</Typography>
      <Box sx={{ mt: 2, height: 240 }}>{empty ? <EmptyState>{empty}</EmptyState> : children}</Box>
      {footnote && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block", fontSize: 11 }}>{footnote}</Typography>}
    </Box>
  );
}

export function AnalysisGrid({ data }: { data: DashboardData }) {
  return (
    <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
      <Panel
        index="01"
        title="Frequência de compra por cliente"
        description="% de clientes por número de pedidos PAGOS no histórico da base."
        status={data.panelStatus.recompra}
        footnote={`Base: ${data.meta.totalClientesBase} cliente(s) com pedido pago.`}
        empty={data.frequencia.length ? null : "Sem clientes com pedido pago para este período."}
      >
        <PieChart
          series={[{
            data: data.frequencia.map((f, i) => ({ id: i, value: f.value, label: f.name, color: CHART[i % CHART.length] as string })),
            innerRadius: 62,
            outerRadius: 92,
            paddingAngle: 2,
            valueFormatter: (v) => `${v.value}%`,
          }]}
          height={240}
          margin={{ right: 120 }}
        />
      </Panel>

      <Panel
        index="02"
        title="Valor acumulado por cliente"
        description="Média do valor já gasto (pedidos pagos) por faixa de recorrência. Não é LTV previsto."
        status={data.panelStatus.clv}
        footnote="Valor observado até hoje — nenhuma projeção de vida útil é aplicada."
        empty={data.clv.length ? null : "Sem clientes com pedido pago para este período."}
      >
        <BarChart
          dataset={data.clv}
          xAxis={[{ dataKey: "name", scaleType: "band" }]}
          series={[{ dataKey: "value", color: "#00CFE8", valueFormatter: (v) => brlCents(v ?? 0) }]}
          height={240}
          margin={{ left: 56, right: 10, top: 10, bottom: 30 }}
        />
      </Panel>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <PanelHeader index="03" title="Ticket médio x recorrência" status={data.panelStatus.ticketRecorrencia} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>
          Relação entre o valor gasto por pedido e a maturidade do cliente.
        </Typography>
        <Stack spacing={2} sx={{ mt: 2 }}>
          {data.ticketRecorrencia.map((r) => (
            <Box key={r.label}>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {r.label} <Typography component="span" variant="caption" color="text.secondary">· {r.clientes} clientes</Typography>
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{brlCents(r.ticket)}</Typography>
                  {r.delta !== null && (
                    <Chip size="small" color={r.delta >= 0 ? "success" : "error"} label={`${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)}%`} sx={{ height: 20, fontSize: 11 }} />
                  )}
                </Stack>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (r.ticket / 700) * 100)}
                sx={{ mt: 0.75, height: 8, borderRadius: 4, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { borderRadius: 4, background: (theme) => `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})` } }}
              />
            </Box>
          ))}
        </Stack>
      </Box>

      <Panel
        index="04"
        title="Pedidos por faixa de ticket"
        description="% dos pedidos PAGOS do período distribuídos por valor do pedido."
        status={data.panelStatus.faixaTicket}
        footnote={`Base: ${data.meta.numPedidos} pedido(s) pago(s) no período.`}
        empty={data.faixaTicket.length ? null : "Sem pedidos pagos no período selecionado."}
      >
        <BarChart
          dataset={data.faixaTicket}
          xAxis={[{ dataKey: "name", scaleType: "band" }]}
          series={[{ dataKey: "value", color: "#FF9F43", valueFormatter: (v) => `${v}%` }]}
          height={240}
          margin={{ left: 44, right: 10, top: 10, bottom: 30 }}
        />
      </Panel>

      <Panel
        index="05"
        title="Top 5 estados por taxa de recompra"
        description="Clientes do estado com 2+ pedidos pagos ÷ total de clientes daquele estado."
        status={data.panelStatus.regioes}
        footnote={`Só entram estados com pelo menos ${data.meta.minSample} clientes.`}
        empty={data.regioes.length ? null : `Nenhum estado atingiu a amostra mínima de ${data.meta.minSample} clientes.`}
      >
        <BarChart
          dataset={data.regioes}
          xAxis={[{ dataKey: "name", scaleType: "band" }]}
          series={[{ dataKey: "value", color: "#00CFE8", valueFormatter: (v) => `${v}%` }]}
          height={240}
          margin={{ left: 44, right: 10, top: 10, bottom: 30 }}
        />
      </Panel>

      <Panel
        index="06"
        title={data.meta.baseMadura ? "Retenção por estágio de compra" : "Retenção por estágio (preliminar)"}
        description="% dos clientes que avançaram para a compra seguinte."
        status={data.panelStatus.churn}
        footnote={
          data.meta.baseMadura
            ? `Base: ${data.meta.totalClientesBase} cliente(s) com pedido pago.`
            : `Histórico pago de apenas ${data.meta.historyDays} dias — leitura preliminar, não indica churn definitivo.`
        }
        empty={data.churn.length ? null : "Sem clientes com pedido pago para calcular retenção."}
      >
        <LineChart
          dataset={data.churn}
          xAxis={[{ dataKey: "name", scaleType: "point" }]}
          yAxis={[{ min: 0, max: 100 }]}
          series={[{ dataKey: "value", color: "#FF9F43", area: true, showMark: false, valueFormatter: (v) => `${v}%` }]}
          height={240}
          margin={{ left: 44, right: 10, top: 10, bottom: 30 }}
        />
      </Panel>

      <Panel
        index="07"
        title="Tempo entre 1ª e 2ª compra"
        description="Intervalo em dias entre o 1º e o 2º pedido pago do mesmo cliente (faixas exclusivas)."
        status={data.panelStatus.tempoEntreCompras}
        footnote={`Base: ${data.meta.gapsAmostra} cliente(s) com 2ª compra paga.`}
        empty={
          data.meta.gapsAmostra >= data.meta.minSample
            ? null
            : `Amostra insuficiente: ${data.meta.gapsAmostra} cliente(s) com 2ª compra.`
        }
      >
        <BarChart
          dataset={data.tempoEntreCompras}
          xAxis={[{ dataKey: "name", scaleType: "band" }]}
          series={[{ dataKey: "value", color: "#28C76F", valueFormatter: (v) => `${v}%` }]}
          height={240}
          margin={{ left: 44, right: 10, top: 10, bottom: 30 }}
        />
      </Panel>

      <Panel
        index="08"
        title="Quando acontece a 2ª compra"
        description="Distribuição das 2ªs compras por faixa de semanas (faixas exclusivas, somam 100%)."
        status={data.panelStatus.curvaRecompra}
        footnote={`Base: ${data.meta.gapsAmostra} cliente(s) com 2ª compra paga.`}
        empty={
          data.meta.gapsAmostra >= data.meta.minSample
            ? null
            : `Amostra insuficiente: ${data.meta.gapsAmostra} cliente(s) com 2ª compra.`
        }
      >
        <LineChart
          dataset={data.curvaRecompra}
          xAxis={[{ dataKey: "name", scaleType: "point" }]}
          series={[{ dataKey: "value", color: "#7367F0", showMark: false, valueFormatter: (v) => `${v}%` }]}
          height={240}
          margin={{ left: 44, right: 10, top: 10, bottom: 30 }}
        />
      </Panel>

      <Box sx={{ gridColumn: { lg: "span 2" }, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <PanelHeader index="09" title="Operação de envio" status={data.panelStatus.envios} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>
          Pedidos e produtos enviados por dia (pedidos pagos com rastreio). Tempo médio = 1º envio − pagamento.
        </Typography>
        <Box sx={{ mt: 2, height: 280 }}>
          <BarChart
            dataset={data.enviosPorDia}
            xAxis={[{ dataKey: "dia", scaleType: "band" }]}
            series={[
              { dataKey: "pedidos", label: "Pedidos enviados", color: "#7367F0" },
              { dataKey: "produtos", label: "Produtos enviados", color: "#00CFE8" },
            ]}
            height={280}
            margin={{ left: 44, right: 10, top: 10, bottom: 50 }}
          />
        </Box>
      </Box>

      <Box sx={{ gridColumn: { lg: "span 2" }, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 1.5 }}>
          <PanelHeader index="10" title="Análise de coorte de clientes" />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>
            Retenção por mês da 1ª compra paga. Células vazias = mês sem coorte (não é 0%).
          </Typography>
        </Box>
        <TableContainer sx={{ mt: 2, overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow>
                <TableCell>Coorte</TableCell>
                <TableCell colSpan={8} align="center">Meses</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.cohortData?.map((cohort, idx) => (
                <TableRow key={idx} hover>
                  <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                    {cohort.month} <Typography component="span" variant="caption" color="text.secondary">({cohort.size})</Typography>
                  </TableCell>
                  {cohort.retention.map((val, i) => (
                    <TableCell
                      key={i}
                      align="center"
                      sx={{
                        bgcolor: val === null ? "transparent" : val > 20 ? "success.50" : val > 10 ? "action.hover" : "transparent",
                        color: val === 0 ? "text.disabled" : "text.primary",
                        fontWeight: val !== null && val > 20 ? 700 : 400,
                      }}
                    >
                      {val !== null ? `${val}%` : ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box sx={{ gridColumn: { lg: "span 2" }, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 1.5 }}>
          <PanelHeader index="11" title="Pedidos por página de entrada" />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>
            Página de entrada (landing site) registrada nos pedidos pagos. Não é contagem de sessões.
          </Typography>
        </Box>
        <Stack spacing={0.5} sx={{ mt: 2 }}>
          {data.sessoes?.map((s, i) => (
            <Stack key={i} direction="row" sx={{ justifyContent: "space-between", alignItems: "center", px: 1, py: 1, borderRadius: 2, "&:hover": { bgcolor: "action.hover" } }}>
              <Typography variant="caption" noWrap sx={{ maxWidth: 300 }} title={s.page}>{s.page}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{s.count} pedido(s)</Typography>
            </Stack>
          ))}
          {(!data.sessoes || data.sessoes.length === 0) && (
            <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>Nenhum pedido pago com página de entrada registrada.</Typography>
          )}
        </Stack>
      </Box>

      <Box sx={{ gridColumn: { lg: "span 2" }, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 1.5 }}>
          <PanelHeader index="12" title="Produtos mais vendidos" />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>Quantidade vendida em pedidos pagos no período.</Typography>
        </Box>
        <Stack spacing={0.5} sx={{ mt: 2 }}>
          {data.produtosMaisVendidos?.map((p, i) => (
            <Stack key={i} direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "center", px: 1, py: 1, borderRadius: 2, "&:hover": { bgcolor: "action.hover" } }}>
              <Typography variant="caption" noWrap sx={{ maxWidth: 300 }} title={p.nome}>{p.nome}</Typography>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{p.quantidade} un.</Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(p.faturamento)}
                </Typography>
              </Stack>
            </Stack>
          ))}
          {(!data.produtosMaisVendidos || data.produtosMaisVendidos.length === 0) && (
            <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>Nenhum produto vendido no período selecionado.</Typography>
          )}
        </Stack>
      </Box>

      <Box sx={{ gridColumn: { lg: "span 2" }, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 1.5 }}>
          <PanelHeader index="13" title="Curva ABC de produtos" />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>
            Classificação por receita (A até 80% acumulado, B até 95%, C o resto) e por itens vendidos, cada uma com seu
            próprio ranking. Ordenado por valor vendido, do maior pro menor.
          </Typography>
        </Box>
        <TableContainer sx={{ mt: 2, maxHeight: 420, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Table size="small" stickyHeader sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Produto</TableCell>
                <TableCell>Variação</TableCell>
                <TableCell align="right">Valor vendido</TableCell>
                <TableCell align="right">Qtd. vendida</TableCell>
                <TableCell align="center">Curva (receita)</TableCell>
                <TableCell align="center">Curva (itens)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.curvaAbcProdutos.map((p) => (
                <TableRow key={p.key} hover>
                  <TableCell sx={{ fontFamily: "monospace", color: "text.secondary" }}>{p.sku ?? "—"}</TableCell>
                  <TableCell sx={{ maxWidth: 240 }}><Typography variant="caption" noWrap title={p.nome} sx={{ display: "block" }}>{p.nome}</Typography></TableCell>
                  <TableCell sx={{ maxWidth: 160, color: "text.secondary" }}>
                    <Typography variant="caption" noWrap title={p.variacao ?? undefined} sx={{ display: "block" }}>{p.variacao ?? "—"}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.valorVendido)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: "text.secondary" }}>{p.quantidadeVendida}</TableCell>
                  <TableCell align="center"><AbcBadge tier={p.curvaReceita} /></TableCell>
                  <TableCell align="center"><AbcBadge tier={p.curvaItens} /></TableCell>
                </TableRow>
              ))}
              {data.curvaAbcProdutos.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>Nenhum produto vendido no período selecionado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}

const ABC_TIER_COLOR: Record<"A" | "B" | "C", ChipColor> = {
  A: "success",
  B: "warning",
  C: "default",
};

function AbcBadge({ tier }: { tier: "A" | "B" | "C" }) {
  return (
    <Chip
      size="small"
      color={ABC_TIER_COLOR[tier]}
      label={tier}
      sx={{ width: 24, height: 24, borderRadius: "50%", fontSize: 11, fontWeight: 700, "& .MuiChip-label": { px: 0 } }}
    />
  );
}
