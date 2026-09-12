import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Megaphone, Layers, Image as ImageIcon, Play, Pause, Clock, TrendingUp, Activity, Sparkles, Calculator, Bot } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";
import {
  getMetaAdsConnectionStatus,
  getMetaAdsSummary,
  getMetaAdsRows,
  getMetaAdsDayparting,
  setMetaAdsStatus,
} from "@/lib/meta-ads.functions";
import { brl } from "@/lib/crm-mock";
import type { MetaAdsDatePreset, MetaAdsLevel, MetaAdsRow, DaypartAction } from "@/lib/meta-ads.server";
import { AdPulseTab } from "@/components/performance/AdPulseTab";
import { GestaoInsights } from "@/components/performance/GestaoInsights";
import { InsightsCriativosTab } from "@/components/performance/InsightsCriativosTab";
import { PlanejamentoTab } from "@/components/performance/PlanejamentoTab";
import { MetaAdsAiTab } from "@/components/performance/MetaAdsAiTab";

export const Route = createFileRoute("/performance/meta-ads")({
  component: MetaAdsPage,
  head: () => ({
    meta: [
      { title: "Meta Ads | Performance" },
      { name: "description", content: "Métricas reais das campanhas de Facebook/Instagram Ads." },
    ],
  }),
});

const DATE_PRESETS: { value: MetaAdsDatePreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_7d", label: "7 dias" },
  { value: "last_14d", label: "14 dias" },
  { value: "last_30d", label: "30 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
];

const STATUS_COLOR: Record<string, ChipProps["color"]> = {
  ACTIVE: "success",
  PAUSED: "default",
  ARCHIVED: "default",
  DELETED: "error",
};

const ACTION_LABEL: Record<DaypartAction, string> = {
  escalar: "Escalar",
  reduzir: "Reduzir",
  cortar: "Cortar",
  zero_venda: "Zero venda",
};

const ACTION_COLOR: Record<DaypartAction, ChipProps["color"]> = {
  escalar: "success",
  reduzir: "warning",
  cortar: "error",
  zero_venda: "error",
};

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}h`;

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
          {value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            {hint}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function MetaAdsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"gestao" | "dayparting" | "adpulse" | "criativos" | "planejamento" | "ia">("gestao");
  const [datePreset, setDatePreset] = useState<MetaAdsDatePreset>("last_7d");
  const [level, setLevel] = useState<MetaAdsLevel>("campaign");
  const [onlyActive, setOnlyActive] = useState(true);

  const runStatus = useServerFn(getMetaAdsConnectionStatus);
  const runSummary = useServerFn(getMetaAdsSummary);
  const runRows = useServerFn(getMetaAdsRows);
  const runDayparting = useServerFn(getMetaAdsDayparting);
  const runSetStatus = useServerFn(setMetaAdsStatus);

  const { data: connection, isLoading: loadingConnection } = useQuery({
    queryKey: ["meta-ads-connection"],
    queryFn: () => runStatus(),
  });

  const { data: summaryResult, isLoading: loadingSummary } = useQuery({
    queryKey: ["meta-ads-summary", datePreset],
    queryFn: () => runSummary({ data: { datePreset } }),
    enabled: Boolean(connection?.connected) && view === "gestao",
  });

  const { data: rowsResult, isLoading: loadingRows, refetch: refetchRows } = useQuery({
    queryKey: ["meta-ads-rows", level, datePreset],
    queryFn: () => runRows({ data: { level, datePreset } }),
    enabled: Boolean(connection?.connected) && view === "gestao",
  });

  const { data: daypartResult, isLoading: loadingDaypart, refetch: refetchDaypart } = useQuery({
    queryKey: ["meta-ads-dayparting", datePreset],
    queryFn: () => runDayparting({ data: { datePreset } }),
    enabled: Boolean(connection?.connected) && view === "dayparting",
  });

  const rows = useMemo(() => {
    const list = (rowsResult?.success ? rowsResult.rows : []) as MetaAdsRow[];
    return onlyActive ? list.filter((r) => r.status === "ACTIVE") : list;
  }, [rowsResult, onlyActive]);

  const handleToggleStatus = async (row: MetaAdsRow) => {
    const next = row.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await runSetStatus({ data: { id: row.id, status: next } });
      if (!res.success) {
        toast.error(res.error || "Falha ao atualizar status.");
        return;
      }
      toast.success(next === "ACTIVE" ? "Reativado na Meta." : "Pausado na Meta.");
      queryClient.invalidateQueries({ queryKey: ["meta-ads-rows"] });
    } catch (err: any) {
      toast.error("Erro: " + (err?.message ?? "falha desconhecida"));
    }
  };

  if (!loadingConnection && !connection?.connected) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Meta Ads
        </Typography>
        <Card variant="outlined" sx={{ mt: 3, p: 4, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 500 }}>Meta Ads ainda não conectado.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {connection?.error || "Configure o token de acesso e a conta de anúncios em Configurações."}
          </Typography>
        </Card>
      </Box>
    );
  }

  const summary = summaryResult?.success ? summaryResult.summary : null;
  const daypart = daypartResult?.success ? daypartResult.result : null;
  const maxBlockSpend = daypart ? Math.max(...daypart.blocks.map((b) => b.spend), 1) : 1;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Meta Ads
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {loadingConnection
              ? "Verificando conexão..."
              : connection?.accountName
                ? `${connection.accountName} · ${connection.accountId}`
                : "Conectado"}
          </Typography>
        </Box>
        <Button
          variant="outline"
          size="small"
          startIcon={<RefreshCw size={14} />}
          onClick={() => {
            if (view === "gestao") refetchRows();
            else if (view === "dayparting") refetchDaypart();
            else if (view === "adpulse") queryClient.invalidateQueries({ queryKey: ["meta-ads-pulse"] });
            else if (view === "criativos") queryClient.invalidateQueries({ queryKey: ["meta-ads-creatives"] });
            else if (view === "ia") queryClient.invalidateQueries({ queryKey: ["meta-ads-analysis"] });
            else queryClient.invalidateQueries({ queryKey: ["meta-ads-planning-baseline"] });
          }}
        >
          Atualizar
        </Button>
      </Stack>

      <Box sx={{ mt: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={view} onChange={(_, v) => setView(v)} variant="scrollable" scrollButtons="auto">
          <Tab value="gestao" icon={<Megaphone size={14} />} iconPosition="start" label="Gestão" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="dayparting" icon={<Clock size={14} />} iconPosition="start" label="Dayparting" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="adpulse" icon={<Activity size={14} />} iconPosition="start" label="Ad Pulse" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="criativos" icon={<Sparkles size={14} />} iconPosition="start" label="Insights Criativos" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="planejamento" icon={<Calculator size={14} />} iconPosition="start" label="Planejamento" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="ia" icon={<Bot size={14} />} iconPosition="start" label="Análise IA" sx={{ minHeight: 40, minWidth: "auto" }} />
        </Tabs>
      </Box>

      {view !== "planejamento" && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
          {DATE_PRESETS.map((p) => (
            <Button key={p.value} variant={datePreset === p.value ? "contained" : "outline"} size="small" onClick={() => setDatePreset(p.value)}>
              {p.label}
            </Button>
          ))}
        </Stack>
      )}

      {view === "gestao" && (
        <>
          <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
              <StatCard label="Investimento" value={loadingSummary ? "…" : brl(summary?.spend ?? 0)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
              <StatCard label="Faturado" value={loadingSummary ? "…" : brl(summary?.revenue ?? 0)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
              <StatCard label="ROAS" value={loadingSummary ? "…" : `${(summary?.roas ?? 0).toFixed(2)}x`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
              <StatCard label="Compras" value={loadingSummary ? "…" : String(summary?.purchases ?? 0)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
              <StatCard label="CVR" value={loadingSummary ? "…" : pct(summary?.cvr ?? 0)} hint="Compras ÷ cliques no link" />
            </Grid>
            <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
              <StatCard label="Ticket médio" value={loadingSummary ? "…" : brl(summary?.ticket ?? 0)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
              <StatCard label="CPA" value={loadingSummary ? "…" : brl(summary?.cpa ?? 0)} />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={2} sx={{ mt: 3, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
            <Tabs value={level} onChange={(_, v) => setLevel(v)} sx={{ minHeight: 36 }}>
              <Tab value="campaign" icon={<Megaphone size={14} />} iconPosition="start" label="Campanhas" sx={{ minHeight: 36, minWidth: "auto" }} />
              <Tab value="adset" icon={<Layers size={14} />} iconPosition="start" label="Conjuntos" sx={{ minHeight: 36, minWidth: "auto" }} />
              <Tab value="ad" icon={<ImageIcon size={14} />} iconPosition="start" label="Anúncios" sx={{ minHeight: 36, minWidth: "auto" }} />
            </Tabs>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2">Só ativas</Typography>
              <Switch checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            </Stack>
          </Stack>

          <TableContainer sx={{ mt: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Gasto</TableCell>
                  <TableCell align="right">Impr.</TableCell>
                  <TableCell align="right">CTR</TableCell>
                  <TableCell align="right">CPM</TableCell>
                  <TableCell align="right">CPS</TableCell>
                  <TableCell align="right">CVR</TableCell>
                  <TableCell align="right">Ticket</TableCell>
                  <TableCell align="right">CPA</TableCell>
                  <TableCell align="right">Compras</TableCell>
                  <TableCell align="right">ROAS</TableCell>
                  <TableCell align="right">Ação</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingRows && (
                  <TableRow>
                    <TableCell colSpan={13} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!loadingRows && rowsResult && !rowsResult.success && (
                  <TableRow>
                    <TableCell colSpan={13} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      {rowsResult.error}
                    </TableCell>
                  </TableRow>
                )}
                {!loadingRows && rowsResult?.success && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      Nenhum resultado nesse período.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell sx={{ maxWidth: 280, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>
                      {r.name}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={STATUS_COLOR[r.status] ?? "default"} label={r.status} />
                    </TableCell>
                    <TableCell align="right">{brl(r.spend)}</TableCell>
                    <TableCell align="right">{r.impressions.toLocaleString("pt-BR")}</TableCell>
                    <TableCell align="right">{pct(r.ctr / 100)}</TableCell>
                    <TableCell align="right">{brl(r.cpm)}</TableCell>
                    <TableCell align="right">{brl(r.cps)}</TableCell>
                    <TableCell align="right">{pct(r.cvr)}</TableCell>
                    <TableCell align="right">{brl(r.ticket)}</TableCell>
                    <TableCell align="right">{brl(r.cpa)}</TableCell>
                    <TableCell align="right">{r.purchases}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 700, color: r.roas >= 2 ? "success.main" : r.roas > 0 ? "warning.main" : "error.main" }}
                    >
                      {r.roas.toFixed(2)}x
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" title={r.status === "ACTIVE" ? "Pausar" : "Ativar"} onClick={() => handleToggleStatus(r)}>
                        {r.status === "ACTIVE" ? <Pause size={16} /> : <Play size={16} />}
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <GestaoInsights datePreset={datePreset} summary={summary} />
        </>
      )}

      {view === "dayparting" && (
        <>
          {loadingDaypart && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              Carregando...
            </Typography>
          )}
          {!loadingDaypart && daypartResult && !daypartResult.success && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              {daypartResult.error}
            </Typography>
          )}
          {daypart && (
            <>
              <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label="Investimento no período" value={brl(daypart.totalSpend)} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label="ROAS da conta" value={`${daypart.accountRoas.toFixed(2)}x`} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard
                    label="Melhor horário"
                    value={daypart.bestHour ? hourLabel(daypart.bestHour.hour) : "—"}
                    hint={daypart.bestHour ? `${daypart.bestHour.roas.toFixed(2)}x` : undefined}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard
                    label="Verba em horas sem venda"
                    value={brl(daypart.wasteSpend)}
                    hint={daypart.worstHour ? `Pior: ${hourLabel(daypart.worstHour.hour)}` : undefined}
                  />
                </Grid>
              </Grid>

              <Box sx={{ mt: 3, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <TrendingUp size={16} />
                  <Typography sx={{ fontWeight: 600 }}>Eficiência por bloco do dia</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Onde a verba está indo e onde ela realmente converte.
                </Typography>
                <TableContainer sx={{ mt: 1.5, overflowX: "auto" }}>
                  <Table size="small" sx={{ minWidth: 600 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Bloco do dia</TableCell>
                        <TableCell align="right">Gasto</TableCell>
                        <TableCell align="right">% Verba</TableCell>
                        <TableCell align="right">Compras</TableCell>
                        <TableCell align="right">CPA</TableCell>
                        <TableCell align="right">ROAS</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {daypart.blocks.map((b) => (
                        <TableRow key={b.label}>
                          <TableCell sx={{ fontWeight: 500 }}>{b.label}</TableCell>
                          <TableCell align="right">{brl(b.spend)}</TableCell>
                          <TableCell align="right">{pct(b.pctSpend)}</TableCell>
                          <TableCell align="right">{b.purchases}</TableCell>
                          <TableCell align="right">{brl(b.cpa)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: b.roas >= daypart.accountRoas ? "success.main" : "warning.main" }}>
                            {b.roas.toFixed(2)}x
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Stack spacing={1} sx={{ mt: 1.5 }}>
                  {daypart.blocks.map((b) => (
                    <Stack key={b.label} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 112, flexShrink: 0 }}>
                        {b.label}
                      </Typography>
                      <Box sx={{ height: 6, flex: 1, borderRadius: 999, bgcolor: "action.hover" }}>
                        <Box
                          sx={{
                            height: 6,
                            borderRadius: 999,
                            bgcolor: b.roas >= daypart.accountRoas ? "success.main" : "warning.main",
                            width: `${Math.max(2, (b.spend / maxBlockSpend) * 100)}%`,
                          }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 96, flexShrink: 0, textAlign: "right" }}>
                        {pct(b.pctSpend)} · {b.roas.toFixed(2)}x
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>

              <Box sx={{ mt: 3, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                <Typography sx={{ fontWeight: 600 }}>Hora a hora</Typography>
                <Typography variant="caption" color="text.secondary">
                  Ações sugeridas comparando o ROAS da hora com o ROAS da conta ({daypart.accountRoas.toFixed(2)}x).
                </Typography>
                <TableContainer sx={{ mt: 1.5, overflowX: "auto" }}>
                  <Table size="small" sx={{ minWidth: 640 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Hora</TableCell>
                        <TableCell align="right">Gasto</TableCell>
                        <TableCell align="right">% Verba</TableCell>
                        <TableCell align="right">Compras</TableCell>
                        <TableCell align="right">CPA</TableCell>
                        <TableCell align="right">ROAS</TableCell>
                        <TableCell align="right">Ação</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {daypart.hours.map((h) => (
                        <TableRow key={h.hour}>
                          <TableCell>{hourLabel(h.hour)}</TableCell>
                          <TableCell align="right">{brl(h.spend)}</TableCell>
                          <TableCell align="right">{pct(h.pctSpend)}</TableCell>
                          <TableCell align="right">{h.purchases}</TableCell>
                          <TableCell align="right">{h.cpa > 0 ? brl(h.cpa) : "—"}</TableCell>
                          <TableCell align="right">{h.roas > 0 ? `${h.roas.toFixed(2)}x` : "—"}</TableCell>
                          <TableCell align="right">
                            <Chip size="small" color={ACTION_COLOR[h.action]} label={ACTION_LABEL[h.action]} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </>
          )}
        </>
      )}

      {view === "adpulse" && <AdPulseTab datePreset={datePreset} />}
      {view === "criativos" && <InsightsCriativosTab datePreset={datePreset} />}
      {view === "planejamento" && <PlanejamentoTab />}
      {view === "ia" && <MetaAdsAiTab datePreset={datePreset} />}
    </Box>
  );
}
