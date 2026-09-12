import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart } from "@mui/x-charts/LineChart";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { getCampaigns, getCampaignsFailureBreakdown, listAutomations } from "@/lib/whatsapp-meta.functions";
import { brl, brlCents } from "@/lib/crm-mock";
import { AutomationReentryControl } from "@/components/whatsapp/AutomationReentryControl";
import { QueueHealthPanel } from "@/components/whatsapp/QueueHealthPanel";
import { PresendAuditPanel } from "@/components/whatsapp/PresendAuditPanel";

const TREND_SERIES = [
  { key: "enviadas", label: "Enviadas", color: "#7367F0" },
  { key: "lidas", label: "Lidas", color: "#00CFE8" },
  { key: "vendas", label: "Pedidos", color: "#28C76F" },
] as const;

function FunnelRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {value.toLocaleString("pt-BR")} <Typography component="span" variant="caption" color="text.secondary">{pct.toFixed(1)}%</Typography>
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, pct)}
        sx={{ mt: 0.75, height: 8, borderRadius: 4, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 4 } }}
      />
    </Box>
  );
}

export function ReportsTab() {
  const { data: campaigns } = useQuery({ queryKey: ["whatsapp-campaigns"], queryFn: () => getCampaigns() });
  const { data: automations } = useQuery({ queryKey: ["whatsapp-automations"], queryFn: () => listAutomations() });
  const runFailures = useServerFn(getCampaignsFailureBreakdown);
  const { data: failures } = useQuery({ queryKey: ["whatsapp-failures"], queryFn: () => runFailures() });

  const list = campaigns ?? [];

  const totals = useMemo(() => {
    const enviadas = list.reduce((a, c) => a + c.enviadas, 0);
    const entregues = list.reduce((a, c) => a + c.entregues, 0);
    const lidas = list.reduce((a, c) => a + c.lidas, 0);
    const vendas = list.reduce((a, c) => a + c.vendas, 0);
    const receita = list.reduce((a, c) => a + c.receita, 0);
    const custo = list.reduce((a, c) => a + c.custo, 0);
    const falhas = list.reduce((a, c) => a + c.falhas, 0);
    const couponOrders = list.reduce((a, c) => a + (c.couponOrders ?? 0), 0);
    const couponCustomers = list.reduce((a, c) => a + (c.couponCustomers ?? 0), 0);
    const couponRevenue = list.reduce((a, c) => a + (c.couponRevenue ?? 0), 0);
    return { enviadas, entregues, lidas, vendas, receita, custo, falhas, couponOrders, couponCustomers, couponRevenue };
  }, [list]);

  const roas = totals.custo > 0 ? totals.receita / totals.custo : null;
  const conversao = totals.enviadas > 0 ? (totals.vendas / totals.enviadas) * 100 : 0;
  const ticketMedio = totals.vendas > 0 ? totals.receita / totals.vendas : 0;
  const receitaMilEnvios = totals.enviadas > 0 ? (totals.receita / totals.enviadas) * 1000 : 0;
  const taxaFalha = totals.enviadas + totals.falhas > 0 ? (totals.falhas / (totals.enviadas + totals.falhas)) * 100 : 0;
  const leituraPct = totals.enviadas > 0 ? (totals.lidas / totals.enviadas) * 100 : 0;
  const entregaPct = totals.enviadas > 0 ? (totals.entregues / totals.enviadas) * 100 : 0;

  const evolucao = useMemo(() => {
    return [...list]
      .filter((c) => c.sentAt)
      .sort((a, b) => new Date(a.sentAt!).getTime() - new Date(b.sentAt!).getTime())
      .map((c) => ({
        data: new Date(c.sentAt!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        enviadas: c.enviadas,
        lidas: c.lidas,
        vendas: c.vendas,
      }));
  }, [list]);

  const ranking = [...list].sort((a, b) => b.receita - a.receita).slice(0, 8);
  const trackedCouponCodes = Array.from(new Set(list.flatMap((campaign) => campaign.trackedCouponCodes ?? [])));

  const byCategory = useMemo(() => {
    const map = new Map<string, { enviadas: number; leitura: number; vendas: number; receita: number }>();
    for (const c of list) {
      const agg = map.get(c.messageType) ?? { enviadas: 0, leitura: 0, vendas: 0, receita: 0 };
      agg.enviadas += c.enviadas;
      agg.leitura += c.lidas;
      agg.vendas += c.vendas;
      agg.receita += c.receita;
      map.set(c.messageType, agg);
    }
    return Array.from(map.entries());
  }, [list]);

  return (
    <Stack spacing={2.5} sx={{ mt: 2 }}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", xl: "repeat(4, 1fr)" } }}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">Campanhas</Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>{list.length}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>{totals.enviadas.toLocaleString("pt-BR")} envios</Typography>
        </Box>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">Receita</Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>{brl(totals.receita)}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>{totals.vendas} pedidos atribuídos</Typography>
        </Box>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">Leitura</Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>{leituraPct.toFixed(1)}%</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>{totals.lidas.toLocaleString("pt-BR")} mensagens lidas</Typography>
        </Box>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5, bgcolor: "text.primary", color: "background.paper" }}>
          <Typography variant="caption" sx={{ color: "background.paper", opacity: 0.7 }}>ROAS estimado</Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, color: "background.paper" }}>{roas !== null ? `${roas.toFixed(1)}x` : "—"}</Typography>
          <Typography variant="caption" sx={{ color: "background.paper", opacity: 0.7, mt: 0.5, display: "block" }}>{brlCents(totals.custo)} de custo estimado</Typography>
        </Box>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "primary.light", bgcolor: "primary.50", borderRadius: 3, px: 2, py: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>Como a receita é atribuída</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Cupom identificado confirma a campanha. Sem cupom, o pedido é atribuído ao primeiro envio feito para o cliente nas 72 horas anteriores à compra. Cada pedido entra em apenas uma campanha.
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", xl: "repeat(6, 1fr)" } }}>
        {[
          { label: "Entrega", value: `${entregaPct.toFixed(1)}%` },
          { label: "Conversão", value: `${conversao.toFixed(1)}%` },
          { label: "Ticket médio", value: brl(ticketMedio) },
          { label: "Receita / mil envios", value: brl(receitaMilEnvios) },
          { label: "Receita assistida", value: brl(totals.receita) },
          { label: "Falhas", value: `${taxaFalha.toFixed(1)}%` },
        ].map((m) => (
          <Box key={m.label} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
            <Typography variant="caption" color="text.secondary">{m.label}</Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>{m.value}</Typography>
          </Box>
        ))}
      </Box>

      {trackedCouponCodes.length > 0 && (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Box>
              <Typography sx={{ fontWeight: 600 }}>Conversões confirmadas por cupom</Typography>
              <Typography variant="body2" color="text.secondary">Somente pedidos válidos em que a Shopify registrou o código usado.</Typography>
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>{trackedCouponCodes.join(" · ")}</Typography>
          </Stack>
          <Box sx={{ mt: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Typography variant="caption" color="text.secondary">Pedidos com cupom</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{totals.couponOrders}</Typography>
            </Box>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Typography variant="caption" color="text.secondary">Clientes identificados</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{totals.couponCustomers}</Typography>
            </Box>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Typography variant="caption" color="text.secondary">Receita confirmada</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{brl(totals.couponRevenue)}</Typography>
            </Box>
          </Box>
        </Box>
      )}

      <PresendAuditPanel />
      <QueueHealthPanel />

      {(automations ?? []).length > 0 && (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Typography sx={{ fontWeight: 600 }}>Reentrada das automações</Typography>
          <Typography variant="body2" color="text.secondary">
            Controle quando um cliente pode iniciar novamente cada jornada, sem criar execuções simultâneas.
          </Typography>
          <Box sx={{ mt: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
            {(automations ?? []).map((automation) => (
              <Box key={automation.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>{automation.nome}</Typography>
                <AutomationReentryControl automationId={automation.id} />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Typography sx={{ fontWeight: 600 }}>Funil consolidado</Typography>
          <Typography variant="body2" color="text.secondary">Avanço dos contatos até o pedido atribuído.</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <FunnelRow label="Enviadas" value={totals.enviadas} pct={100} color="var(--mui-palette-text-primary, #2f2b3d)" />
            <FunnelRow label="Entregues" value={totals.entregues} pct={entregaPct} color="#7367F0" />
            <FunnelRow label="Lidas" value={totals.lidas} pct={leituraPct} color="#7367F0" />
            <FunnelRow label="Pedidos" value={totals.vendas} pct={conversao} color="#28C76F" />
          </Stack>
        </Box>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Typography sx={{ fontWeight: 600 }}>Evolução no período</Typography>
          <Typography variant="body2" color="text.secondary">Volume enviado, leitura e pedidos por campanha.</Typography>
          <Box sx={{ mt: 2, height: 220 }}>
            <LineChart
              dataset={evolucao}
              xAxis={[{ dataKey: "data", scaleType: "point" }]}
              series={TREND_SERIES.map((s) => ({ dataKey: s.key, label: s.label, color: s.color, showMark: false }))}
              height={220}
              margin={{ left: 40, right: 10, top: 10, bottom: 30 }}
            />
          </Box>
        </Box>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Typography sx={{ fontWeight: 600 }}>Melhores campanhas</Typography>
        <Typography variant="body2" color="text.secondary">Ranking por receita.</Typography>
        <TableContainer sx={{ mt: 2 }}>
          <Table sx={{ minWidth: 600 }} size="small">
            <TableHead>
              <TableRow>
                <TableCell>Campanha</TableCell>
                <TableCell>Enviadas</TableCell>
                <TableCell>Leitura</TableCell>
                <TableCell>Pedidos</TableCell>
                <TableCell>Receita</TableCell>
                <TableCell>ROAS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ranking.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: "text.secondary" }}>Sem dados ainda.</TableCell></TableRow>
              )}
              {ranking.map((c) => (
                <TableRow key={c.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{c.nome}</TableCell>
                  <TableCell>{c.enviadas}</TableCell>
                  <TableCell>{c.enviadas > 0 ? `${((c.lidas / c.enviadas) * 100).toFixed(1)}%` : "0.0%"}</TableCell>
                  <TableCell>{c.vendas}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{brl(c.receita)}</TableCell>
                  <TableCell>{c.custo > 0 ? `${(c.receita / c.custo).toFixed(1)}x` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Typography sx={{ fontWeight: 600 }}>Categorias</Typography>
          <Typography variant="body2" color="text.secondary">Contribuição das categorias pra receita e conversão.</Typography>
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {byCategory.length === 0 && <Typography variant="body2" color="text.secondary">Sem dados ainda.</Typography>}
            {byCategory.map(([cat, agg]) => (
              <Stack key={cat} direction="row" sx={{ justifyContent: "space-between", alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", color: "text.secondary" }}>{cat}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {agg.enviadas} envios · {agg.enviadas > 0 ? ((agg.leitura / agg.enviadas) * 100).toFixed(1) : "0.0"}% leitura · {agg.vendas} pedidos
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, color: "primary.main" }}>{brl(agg.receita)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Typography sx={{ fontWeight: 600 }}>Principais falhas</Typography>
          <Typography variant="body2" color="text.secondary">Motivos reais retornados pela Meta nos envios que falharam.</Typography>
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {(!failures || failures.length === 0) && <Typography variant="body2" color="text.secondary">Nenhuma falha registrada.</Typography>}
            {failures?.map((f) => (
              <Box key={f.motivo} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{f.motivo}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{f.count}</Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={f.pct}
                  sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { bgcolor: "error.main", borderRadius: 3 } }}
                />
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>
    </Stack>
  );
}
