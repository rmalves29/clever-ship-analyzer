import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { getEnvioReports } from "@/lib/envio-reports.functions";
import type { EnvioReportsPeriod } from "@/lib/envio-reports.server";

const PERIODS: { value: EnvioReportsPeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface-card p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function ReportsPanel() {
  const [period, setPeriod] = useState<EnvioReportsPeriod>("30d");
  const getReports = useServerFn(getEnvioReports);
  const { data, isLoading } = useQuery({ queryKey: ["envio-reports", period], queryFn: () => getReports({ data: { period } }) });

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

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <Button key={p.value} size="sm" variant={period === p.value ? "default" : "outline"} onClick={() => setPeriod(p.value)}>
              {p.label}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
          <Download className="size-4" /> Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Cliques" value={data.totalClicks} />
        <StatCard label="Entradas" value={data.totalEntries} />
        <StatCard label="Saídas" value={data.totalExits} />
        <StatCard label="Líquido" value={data.net} />
        <StatCard label="Conversão" value={`${data.conversionPct}%`} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Campanhas</p>
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cliques</TableHead>
                <TableHead>Entradas</TableHead>
                <TableHead>Saídas</TableHead>
                <TableHead>Líquido</TableHead>
                <TableHead>Conversão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.clicks}</TableCell>
                  <TableCell>{c.entries}</TableCell>
                  <TableCell>{c.exits}</TableCell>
                  <TableCell className={c.net < 0 ? "text-critical" : ""}>{c.net}</TableCell>
                  <TableCell>{c.conversionPct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Grupos</p>
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Participantes</TableHead>
                <TableHead>Entradas</TableHead>
                <TableHead>Saídas</TableHead>
                <TableHead>Líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>{g.name}</TableCell>
                  <TableCell>{g.participants}</TableCell>
                  <TableCell>{g.entries}</TableCell>
                  <TableCell>{g.exits}</TableCell>
                  <TableCell className={g.net < 0 ? "text-critical" : ""}>{g.net}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Eventos recentes</p>
        <div className="surface-card max-h-72 divide-y divide-border overflow-y-auto">
          {data.recentEvents.map((e: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-2 text-xs">
              <span>{e.event_type === "join" ? "🟢 Entrou" : "🔴 Saiu"}</span>
              <span className="text-muted-foreground">{e.phone ?? "desconhecido"}</span>
              <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
