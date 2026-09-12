import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
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
  const getReports = useServerFn(getEnvioReports);
  const { data, isLoading } = useQuery({ queryKey: ["envio-reports", period], queryFn: () => getReports({ data: { period } }) });

  const getAiPerformance = useServerFn(getAiContentPerformanceFn);
  const { data: aiPosts } = useQuery({ queryKey: ["ai-content-performance"], queryFn: () => getAiPerformance() });

  const exportCsv = () => {
    if (!data) return;
    const lines = ["tipo,nome,cliques,entradas,saidas,net"];
    for (const c of data.campaigns) lines.push(`campanha,${c.name},${c.clicks},${c.entries},${c.exits},${c.net}`);
    for (const g of data.groups) lines.push(`grupo,${g.name},,${g.entries},${g.exits},${g.net}`);
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fluxo-envio-relatorio-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
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
            <Button key={p.value} size="small" variant={period === p.value ? "contained" : "outline"} onClick={() => setPeriod(p.value)}>
              {p.label}
            </Button>
          ))}
        </Stack>
        <Button variant="outline" size="small" startIcon={<Download size={16} />} onClick={exportCsv}>
          Exportar CSV
        </Button>
      </Stack>

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
          {data.recentEvents.map((e: any, i: number) => (
            <Stack
              key={i}
              direction="row"
              sx={{ justifyContent: "space-between", alignItems: "center", p: 1, borderTop: i > 0 ? "1px solid" : "none", borderColor: "divider" }}
            >
              <Typography variant="caption">{e.event_type === "join" ? "🟢 Entrou" : "🔴 Saiu"}</Typography>
              <Typography variant="caption" color="text.secondary">
                {e.phone ?? "desconhecido"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(e.created_at).toLocaleString("pt-BR")}
              </Typography>
            </Stack>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}
