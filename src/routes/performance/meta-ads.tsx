import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Megaphone, Layers, Image as ImageIcon, Play, Pause, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getMetaAdsConnectionStatus,
  getMetaAdsSummary,
  getMetaAdsRows,
  getMetaAdsDayparting,
  setMetaAdsStatus,
} from "@/lib/meta-ads.functions";
import { brl } from "@/lib/crm-mock";
import type { MetaAdsDatePreset, MetaAdsLevel, MetaAdsRow, DaypartAction } from "@/lib/meta-ads.server";

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

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "bg-success-soft text-success",
  PAUSED: "bg-muted text-muted-foreground",
  ARCHIVED: "bg-muted text-muted-foreground",
  DELETED: "bg-critical-soft text-critical",
};

const ACTION_LABEL: Record<DaypartAction, string> = {
  escalar: "Escalar",
  reduzir: "Reduzir",
  cortar: "Cortar",
  zero_venda: "Zero venda",
};

const ACTION_CLASS: Record<DaypartAction, string> = {
  escalar: "bg-success-soft text-success",
  reduzir: "bg-warning-soft text-warning",
  cortar: "bg-critical-soft text-critical",
  zero_venda: "bg-critical-soft text-critical",
};

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}h`;

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MetaAdsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"gestao" | "dayparting">("gestao");
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
      <div className="p-6">
        <h1 className="text-2xl font-bold">Meta Ads</h1>
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-medium">Meta Ads ainda não conectado.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {connection?.error || "Configure o token de acesso e a conta de anúncios em Configurações."}
          </p>
        </div>
      </div>
    );
  }

  const summary = summaryResult?.success ? summaryResult.summary : null;
  const daypart = daypartResult?.success ? daypartResult.result : null;
  const maxBlockSpend = daypart ? Math.max(...daypart.blocks.map((b) => b.spend), 1) : 1;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meta Ads</h1>
          <p className="text-sm text-muted-foreground">
            {loadingConnection
              ? "Verificando conexão..."
              : connection?.accountName
                ? `${connection.accountName} · ${connection.accountId}`
                : "Conectado"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => (view === "gestao" ? refetchRows() : refetchDaypart())} className="gap-2">
          <RefreshCw className="size-3.5" /> Atualizar
        </Button>
      </div>

      <div className="mt-4">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="gestao" className="gap-1.5">
              <Megaphone className="size-3.5" /> Gestão
            </TabsTrigger>
            <TabsTrigger value="dayparting" className="gap-1.5">
              <Clock className="size-3.5" /> Dayparting
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {DATE_PRESETS.map((p) => (
          <Button
            key={p.value}
            variant={datePreset === p.value ? "default" : "outline"}
            size="sm"
            onClick={() => setDatePreset(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {view === "gestao" && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Investimento" value={loadingSummary ? "…" : brl(summary?.spend ?? 0)} />
            <StatCard label="Faturado" value={loadingSummary ? "…" : brl(summary?.revenue ?? 0)} />
            <StatCard label="ROAS" value={loadingSummary ? "…" : `${(summary?.roas ?? 0).toFixed(2)}x`} />
            <StatCard label="Compras" value={loadingSummary ? "…" : String(summary?.purchases ?? 0)} />
            <StatCard label="CVR" value={loadingSummary ? "…" : pct(summary?.cvr ?? 0)} hint="Compras ÷ cliques no link" />
            <StatCard label="Ticket médio" value={loadingSummary ? "…" : brl(summary?.ticket ?? 0)} />
            <StatCard label="CPA" value={loadingSummary ? "…" : brl(summary?.cpa ?? 0)} />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={level} onValueChange={(v) => setLevel(v as MetaAdsLevel)}>
              <TabsList>
                <TabsTrigger value="campaign" className="gap-1.5">
                  <Megaphone className="size-3.5" /> Campanhas
                </TabsTrigger>
                <TabsTrigger value="adset" className="gap-1.5">
                  <Layers className="size-3.5" /> Conjuntos
                </TabsTrigger>
                <TabsTrigger value="ad" className="gap-1.5">
                  <ImageIcon className="size-3.5" /> Anúncios
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={onlyActive} onCheckedChange={setOnlyActive} /> Só ativas
            </label>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Gasto</th>
                  <th className="px-4 py-3 text-right font-medium">Impr.</th>
                  <th className="px-4 py-3 text-right font-medium">CTR</th>
                  <th className="px-4 py-3 text-right font-medium">CPM</th>
                  <th className="px-4 py-3 text-right font-medium">CPS</th>
                  <th className="px-4 py-3 text-right font-medium">CVR</th>
                  <th className="px-4 py-3 text-right font-medium">Ticket</th>
                  <th className="px-4 py-3 text-right font-medium">CPA</th>
                  <th className="px-4 py-3 text-right font-medium">Compras</th>
                  <th className="px-4 py-3 text-right font-medium">ROAS</th>
                  <th className="px-4 py-3 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td>
                  </tr>
                )}
                {!loadingRows && rowsResult && !rowsResult.success && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">{rowsResult.error}</td>
                  </tr>
                )}
                {!loadingRows && rowsResult?.success && rows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">Nenhum resultado nesse período.</td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="max-w-[280px] truncate px-4 py-3 font-medium" title={r.name}>{r.name}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[r.status] ?? "bg-muted text-muted-foreground"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{brl(r.spend)}</td>
                    <td className="px-4 py-3 text-right">{r.impressions.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-right">{pct(r.ctr / 100)}</td>
                    <td className="px-4 py-3 text-right">{brl(r.cpm)}</td>
                    <td className="px-4 py-3 text-right">{brl(r.cps)}</td>
                    <td className="px-4 py-3 text-right">{pct(r.cvr)}</td>
                    <td className="px-4 py-3 text-right">{brl(r.ticket)}</td>
                    <td className="px-4 py-3 text-right">{brl(r.cpa)}</td>
                    <td className="px-4 py-3 text-right">{r.purchases}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${r.roas >= 2 ? "text-success" : r.roas > 0 ? "text-warning" : "text-critical"}`}>
                      {r.roas.toFixed(2)}x
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title={r.status === "ACTIVE" ? "Pausar" : "Ativar"}
                        onClick={() => handleToggleStatus(r)}
                      >
                        {r.status === "ACTIVE" ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "dayparting" && (
        <>
          {loadingDaypart && <p className="mt-6 text-center text-muted-foreground">Carregando...</p>}
          {!loadingDaypart && daypartResult && !daypartResult.success && (
            <p className="mt-6 text-center text-muted-foreground">{daypartResult.error}</p>
          )}
          {daypart && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Investimento no período" value={brl(daypart.totalSpend)} />
                <StatCard label="ROAS da conta" value={`${daypart.accountRoas.toFixed(2)}x`} />
                <StatCard
                  label="Melhor horário"
                  value={daypart.bestHour ? hourLabel(daypart.bestHour.hour) : "—"}
                  hint={daypart.bestHour ? `${daypart.bestHour.roas.toFixed(2)}x` : undefined}
                />
                <StatCard
                  label="Verba em horas sem venda"
                  value={brl(daypart.wasteSpend)}
                  hint={daypart.worstHour ? `Pior: ${hourLabel(daypart.worstHour.hour)}` : undefined}
                />
              </div>

              <div className="mt-6 rounded-xl border border-border bg-card p-4">
                <p className="flex items-center gap-1.5 font-semibold">
                  <TrendingUp className="size-4" /> Eficiência por bloco do dia
                </p>
                <p className="text-xs text-muted-foreground">Onde a verba está indo e onde ela realmente converte.</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Bloco do dia</th>
                        <th className="py-2 pr-4 text-right font-medium">Gasto</th>
                        <th className="py-2 pr-4 text-right font-medium">% Verba</th>
                        <th className="py-2 pr-4 text-right font-medium">Compras</th>
                        <th className="py-2 pr-4 text-right font-medium">CPA</th>
                        <th className="py-2 text-right font-medium">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daypart.blocks.map((b) => (
                        <tr key={b.label} className="border-t border-border">
                          <td className="py-2 pr-4 font-medium">{b.label}</td>
                          <td className="py-2 pr-4 text-right">{brl(b.spend)}</td>
                          <td className="py-2 pr-4 text-right">{pct(b.pctSpend)}</td>
                          <td className="py-2 pr-4 text-right">{b.purchases}</td>
                          <td className="py-2 pr-4 text-right">{brl(b.cpa)}</td>
                          <td className={`py-2 text-right font-semibold ${b.roas >= daypart.accountRoas ? "text-success" : "text-warning"}`}>
                            {b.roas.toFixed(2)}x
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 space-y-1.5">
                  {daypart.blocks.map((b) => (
                    <div key={b.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="w-28 shrink-0">{b.label}</span>
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div
                          className={`h-2 rounded-full ${b.roas >= daypart.accountRoas ? "bg-success" : "bg-warning"}`}
                          style={{ width: `${Math.max(2, (b.spend / maxBlockSpend) * 100)}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right">{pct(b.pctSpend)} · {b.roas.toFixed(2)}x</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-card p-4">
                <p className="font-semibold">Hora a hora</p>
                <p className="text-xs text-muted-foreground">Ações sugeridas comparando o ROAS da hora com o ROAS da conta ({daypart.accountRoas.toFixed(2)}x).</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Hora</th>
                        <th className="py-2 pr-4 text-right font-medium">Gasto</th>
                        <th className="py-2 pr-4 text-right font-medium">% Verba</th>
                        <th className="py-2 pr-4 text-right font-medium">Compras</th>
                        <th className="py-2 pr-4 text-right font-medium">CPA</th>
                        <th className="py-2 pr-4 text-right font-medium">ROAS</th>
                        <th className="py-2 text-right font-medium">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daypart.hours.map((h) => (
                        <tr key={h.hour} className="border-t border-border">
                          <td className="py-2 pr-4">{hourLabel(h.hour)}</td>
                          <td className="py-2 pr-4 text-right">{brl(h.spend)}</td>
                          <td className="py-2 pr-4 text-right">{pct(h.pctSpend)}</td>
                          <td className="py-2 pr-4 text-right">{h.purchases}</td>
                          <td className="py-2 pr-4 text-right">{h.cpa > 0 ? brl(h.cpa) : "—"}</td>
                          <td className="py-2 pr-4 text-right">{h.roas > 0 ? `${h.roas.toFixed(2)}x` : "—"}</td>
                          <td className="py-2 text-right">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_CLASS[h.action]}`}>
                              {ACTION_LABEL[h.action]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
