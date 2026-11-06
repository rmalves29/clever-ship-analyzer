import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart } from "@mui/x-charts/LineChart";
import { BarChart } from "@mui/x-charts/BarChart";
import { Gauge, gaugeClasses } from "@mui/x-charts/Gauge";
import { Download } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getEnvioReports } from "@/lib/envio-reports.functions";
import type { EnvioReportsPeriod } from "@/lib/envio-reports.server";
import { getAiContentPerformanceFn } from "@/lib/ai-content-queue.functions";

const PERIODS: { value: EnvioReportsPeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card variant="outlined" sx={{ textAlign: "center" }}>
      <CardContent>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

export function ReportsPanel() {
  const [period, setPeriod] = useState<EnvioReportsPeriod>("30d");
  // "Por data": escolhe de/até (datas de Brasília). Mesmo dia nos dois campos = visão de um único dia.
  const todayBrt = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const [byDate, setByDate] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayBrt);
  const [dateTo, setDateTo] = useState(todayBrt);
  const range = byDate && dateFrom && dateTo && dateFrom <= dateTo ? { from: dateFrom, to: dateTo } : null;
  const getReports = useServerFn(getEnvioReports);
  const { data, isLoading } = useQuery({
    queryKey: ["envio-reports", period, range?.from ?? null, range?.to ?? null],
    queryFn: () => getReports({ data: { period, range } }),
    placeholderData: (prev) => prev,
  });

  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  // Gráfico filtrado por campanha + matriz dia × campanha (colunas = campanhas que tiveram movimento no período).
  const daily = useMemo(() => {
    const rows = data?.dailyByCampaign ?? [];
    const columns = new Map<string, { id: string; name: string; entries: number; clicks: number }>();
    const cells = new Map<string, { clicks: number; entries: number; exits: number }>();
    for (const r of rows) {
      const col = columns.get(r.campaignId) ?? { id: r.campaignId, name: r.campaignName, entries: 0, clicks: 0 };
      col.entries += r.entries;
      col.clicks += r.clicks;
      columns.set(r.campaignId, col);
      cells.set(`${r.date}|${r.campaignId}`, { clicks: r.clicks, entries: r.entries, exits: r.exits });
    }
    // Colunas especiais (sem campanha / antes do zeramento) ficam no fim.
    const special = (id: string) => (id === "__none__" ? 1 : id === "__before__" ? 2 : 0);
    const cols = [...columns.values()].sort((a, b) => special(a.id) - special(b.id) || b.entries + b.clicks - (a.entries + a.clicks));
    const dates = (data?.timeline ?? []).map((t) => t.date).slice().reverse();
    return { cols, cells, dates };
  }, [data]);

  const chartData = useMemo(() => {
    const timeline = data?.timeline ?? [];
    if (campaignFilter === "all") return timeline;
    return timeline.map((t) => {
      const c = daily.cells.get(`${t.date}|${campaignFilter}`);
      return { date: t.date, clicks: c?.clicks ?? 0, entries: c?.entries ?? 0, exits: c?.exits ?? 0 };
    });
  }, [data, daily, campaignFilter]);

  const getAiPerformance = useServerFn(getAiContentPerformanceFn);
  const { data: aiPosts } = useQuery({ queryKey: ["ai-content-performance"], queryFn: () => getAiPerformance() });

  const exportCsv = () => {
    if (!data) return;
    // Ponto e vírgula + BOM: o Excel em português abre direto, e nomes com vírgula/aspas não quebram as colunas.
    const cell = (v: string | number | null | undefined) => {
      const t = String(v ?? "");
      return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [["tipo", "nome", "cliques", "entradas", "saidas", "liquido", "conversao_pct"].join(";")];
    for (const c of data.campaigns) lines.push(["campanha", c.name, c.clicks, c.entries, c.exits, c.net, String(c.conversionPct).replace(".", ",")].map(cell).join(";"));
    for (const g of data.groups) lines.push(["grupo", g.name, "", g.entries, g.exits, g.net, ""].map(cell).join(";"));
    for (const d of data.dailyByCampaign) {
      lines.push(["dia", `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)} - ${d.campaignName}`, d.clicks, d.entries, d.exits, d.entries - d.exits, ""].map(cell).join(";"));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fluxo-envio-relatorio-${range ? `${range.from}_a_${range.to}` : period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
        Carregando…
      </Typography>
    );
  }

  return (
    <Stack spacing={3} sx={{ py: 2 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <Stack direction="row" spacing={1}>
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              size="small"
              variant={!byDate && period === p.value ? "contained" : "outline"}
              onClick={() => {
                setByDate(false);
                setPeriod(p.value);
              }}
            >
              {p.label}
            </Button>
          ))}
          <Button size="small" variant={byDate ? "contained" : "outline"} onClick={() => setByDate(true)}>
            Por data
          </Button>
        </Stack>
        <Button variant="outline" size="small" startIcon={<Download size={16} />} onClick={exportCsv}>
          Exportar CSV
        </Button>
      </Stack>

      {byDate && (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            type="date"
            size="small"
            label="De"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayBrt } }}
          />
          <TextField
            type="date"
            size="small"
            label="Até"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayBrt } }}
          />
          <Button size="small" variant="outline" onClick={() => { setDateFrom(todayBrt); setDateTo(todayBrt); }}>
            Hoje
          </Button>
          <Button
            size="small"
            variant="outline"
            onClick={() => {
              const y = new Date(Date.now() - 27 * 3_600_000).toISOString().slice(0, 10);
              setDateFrom(y);
              setDateTo(y);
            }}
          >
            Ontem
          </Button>
          {dateFrom > dateTo && (
            <Typography variant="caption" color="error">
              A data inicial não pode ser depois da final.
            </Typography>
          )}
        </Stack>
      )}

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, sm: 12 / 5 }}>
          <StatCard label="Cliques" value={data.totalClicks} />
        </Grid>
        <Grid size={{ xs: 6, sm: 12 / 5 }}>
          <StatCard label="Entradas" value={data.totalEntries} />
        </Grid>
        <Grid size={{ xs: 6, sm: 12 / 5 }}>
          <StatCard label="Saídas" value={data.totalExits} />
        </Grid>
        <Grid size={{ xs: 6, sm: 12 / 5 }}>
          <StatCard label="Líquido" value={data.net} />
        </Grid>
        <Grid size={{ xs: 6, sm: 12 / 5 }}>
          <StatCard label="Conversão" value={`${data.conversionPct}%`} />
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Cliques, entradas e saídas por dia
                </Typography>
                <TextField select size="small" label="Campanha" value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} sx={{ minWidth: 200 }}>
                  <MenuItem value="all">Todas</MenuItem>
                  {daily.cols.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              {data.timeline.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                  Sem movimento no período.
                </Typography>
              ) : (
                <LineChart
                  dataset={chartData.map((t) => ({ ...t, label: `${t.date.slice(8, 10)}/${t.date.slice(5, 7)}` }))}
                  xAxis={[{ dataKey: "label", scaleType: "point" }]}
                  series={[
                    { dataKey: "clicks", label: "Cliques", color: "#7367F0", showMark: false },
                    { dataKey: "entries", label: "Entradas", color: "#28C76F", showMark: false },
                    { dataKey: "exits", label: "Saídas", color: "#EA5455", showMark: false },
                  ]}
                  height={260}
                  margin={{ left: 44, right: 16, top: 24, bottom: 32 }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Conversão (entradas ÷ cliques)
              </Typography>
              <Gauge
                value={Math.min(100, data.conversionPct)}
                height={170}
                startAngle={-110}
                endAngle={110}
                text={() => `${data.conversionPct}%`}
                sx={{ [`& .${gaugeClasses.valueText}`]: { fontSize: 28, fontWeight: 700 } }}
              />
              <Typography variant="caption" color="text.secondary">
                Entradas incluem quem chegou por outros meios (convite direto, outro link), então pode passar de 100%. Saldo do período: {data.net > 0 ? "+" : ""}{data.net}.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {data.groups.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Grupos com mais entradas e saídas
            </Typography>
            <BarChart
              dataset={data.groups.slice().sort((a, b) => b.entries + b.exits - (a.entries + a.exits)).slice(0, 8)}
              yAxis={[{ dataKey: "name", scaleType: "band", width: 160 }]}
              series={[
                { dataKey: "entries", label: "Entradas", color: "#28C76F" },
                { dataKey: "exits", label: "Saídas", color: "#EA5455" },
              ]}
              layout="horizontal"
              height={Math.max(180, Math.min(8, data.groups.length) * 44 + 60)}
              margin={{ left: 8, right: 16, top: 16, bottom: 24 }}
            />
          </CardContent>
        </Card>
      )}

      {daily.cols.length > 0 && (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Entradas por dia e campanha
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Cada célula: entradas (cliques embaixo). "Sem campanha" = entrou por convite direto ou outro link. "Antes do zeramento" = entradas e cliques de antes da data em que a campanha foi zerada (não entram nos números dela). A coluna Total de cada dia bate com o gráfico.
          </Typography>
          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto", maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Dia</TableCell>
                  {daily.cols.map((c) => (
                    <TableCell key={c.id} align="right" sx={{ minWidth: 110 }}>
                      {c.name}
                    </TableCell>
                  ))}
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {daily.dates.map((date) => {
                  let totalEntries = 0;
                  let totalClicks = 0;
                  const cells = daily.cols.map((c) => {
                    const v = daily.cells.get(`${date}|${c.id}`);
                    totalEntries += v?.entries ?? 0;
                    totalClicks += v?.clicks ?? 0;
                    return (
                      <TableCell key={c.id} align="right">
                        {v && (v.entries > 0 || v.clicks > 0) ? (
                          <>
                            <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
                              {v.entries}
                            </Typography>
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block" }}>
                              {v.clicks} cliques
                            </Typography>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    );
                  });
                  return (
                    <TableRow key={date}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{`${date.slice(8, 10)}/${date.slice(5, 7)}`}</TableCell>
                      {cells}
                      <TableCell align="right">
                        <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>
                          {totalEntries}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {totalClicks} cliques
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Campanhas
        </Typography>
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Cliques</TableCell>
                <TableCell>Entradas</TableCell>
                <TableCell>Saídas</TableCell>
                <TableCell>Líquido</TableCell>
                <TableCell>Conversão</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.clicks}</TableCell>
                  <TableCell>{c.entries}</TableCell>
                  <TableCell>{c.exits}</TableCell>
                  <TableCell sx={{ color: c.net < 0 ? "error.main" : undefined }}>{c.net}</TableCell>
                  <TableCell>{c.conversionPct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Grupos
        </Typography>
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Participantes</TableCell>
                <TableCell>Entradas</TableCell>
                <TableCell>Saídas</TableCell>
                <TableCell>Líquido</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>{g.name}</TableCell>
                  <TableCell>{g.participants}</TableCell>
                  <TableCell>{g.entries}</TableCell>
                  <TableCell>{g.exits}</TableCell>
                  <TableCell sx={{ color: g.net < 0 ? "error.main" : undefined }}>{g.net}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Postagens geradas por IA — o que nao está dando certo.
        </Typography>
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data</TableCell>
                <TableCell>Campanha</TableCell>
                <TableCell>Texto</TableCell>
                <TableCell>Cliques</TableCell>
                <TableCell>Respostas</TableCell>
                <TableCell>Saídas (24h)</TableCell>
                <TableCell>Feedback</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(aiPosts ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(`${p.scheduledDate}T12:00:00Z`).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{p.campaignName}</TableCell>
                  <TableCell sx={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.text}>
                    {p.text}
                  </TableCell>
                  <TableCell>{p.clicks}</TableCell>
                  <TableCell>{p.replies}</TableCell>
                  <TableCell sx={{ color: p.exits24h > 0 ? "error.main" : undefined }}>{p.exits24h}</TableCell>
                  <TableCell>{p.feedback === "good" ? "👍" : p.feedback === "bad" ? "👎" : "—"}</TableCell>
                </TableRow>
              ))}
              {(aiPosts ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ color: "text.secondary" }}>
                    Nenhuma postagem gerada por IA enviada ainda nos últimos 30 dias.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Eventos recentes
        </Typography>
        <Box sx={{ maxHeight: 288, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          {data.recentEvents.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
              Nenhum evento no período.
            </Typography>
          )}
          {data.recentEvents.map((e, i) => (
            <Stack
              key={i}
              direction="row"
              spacing={1}
              sx={{ justifyContent: "space-between", alignItems: "center", p: 1, borderTop: i > 0 ? "1px solid" : "none", borderColor: "divider" }}
            >
              <Typography variant="caption" sx={{ width: 76, flexShrink: 0 }}>
                {e.event_type === "join" ? "🟢 Entrou" : "🔴 Saiu"}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ width: 120, flexShrink: 0 }}>
                {e.phone ?? "desconhecido"}
              </Typography>
              <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${e.groupName} · ${e.campaignNames.join(", ")}`}>
                {e.groupName}
                {e.campaignNames.length > 0 && <span style={{ opacity: 0.6 }}> · {e.campaignNames.join(", ")}</span>}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {new Date(e.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </Typography>
            </Stack>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}
