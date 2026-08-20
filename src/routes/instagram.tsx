import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Users, Grid3x3, Eye, Heart, UserCheck, MousePointerClick } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getInstagramConnectionStatus, connectInstagram, getInstagramOverview } from "@/lib/instagram.functions";
import type { InstagramDatePreset } from "@/lib/instagram.server";

export const Route = createFileRoute("/instagram")({
  component: InstagramPage,
  head: () => ({
    meta: [
      { title: "Instagram | Performance" },
      { name: "description", content: "Insights reais da conta do Instagram — alcance, engajamento e crescimento." },
    ],
  }),
});

const DATE_PRESETS: { value: InstagramDatePreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_7d", label: "7 dias" },
  { value: "last_14d", label: "14 dias" },
  { value: "last_30d", label: "30 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
];

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function InstagramPage() {
  const [datePreset, setDatePreset] = useState<InstagramDatePreset>("last_7d");
  const runStatus = useServerFn(getInstagramConnectionStatus);
  const runConnect = useServerFn(connectInstagram);
  const runOverview = useServerFn(getInstagramOverview);

  const { data: connection, isLoading: loadingConnection, refetch: refetchStatus } = useQuery({
    queryKey: ["instagram-connection"],
    queryFn: () => runStatus(),
  });

  const { data: overviewResult, isLoading: loadingOverview, refetch } = useQuery({
    queryKey: ["instagram-overview", datePreset],
    queryFn: () => runOverview({ data: { datePreset } }),
    enabled: Boolean(connection?.connected),
  });

  const [connecting, setConnecting] = useState(false);
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await runConnect();
      if (!res.success) {
        toast.error(res.error || "Falha ao conectar.");
        return;
      }
      toast.success(`Conectado a @${res.username}.`);
      refetchStatus();
    } finally {
      setConnecting(false);
    }
  };

  if (!loadingConnection && !connection?.connected) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Instagram</h1>
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-medium">Instagram ainda não conectado.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {connection?.error || "Usa o mesmo token do Meta Ads — só precisa achar qual Página tem o Instagram profissional vinculado."}
          </p>
          <Button onClick={handleConnect} disabled={connecting} className="mt-4">
            {connecting ? "Conectando..." : "Conectar Instagram"}
          </Button>
        </div>
      </div>
    );
  }

  const overview = overviewResult?.success ? overviewResult.overview : null;
  const maxReach = overview ? Math.max(...overview.reachByDay.map((d) => d.value), 1) : 1;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instagram</h1>
          <p className="text-sm text-muted-foreground">
            {loadingConnection ? "Verificando conexão..." : connection?.username ? `@${connection.username}` : "Conectado"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="size-3.5" /> Atualizar
        </Button>
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

      {loadingOverview && <p className="mt-6 text-center text-muted-foreground">Carregando...</p>}
      {!loadingOverview && overviewResult && !overviewResult.success && (
        <p className="mt-6 text-center text-muted-foreground">{overviewResult.error}</p>
      )}

      {overview && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <StatCard icon={Users} label="Seguidores" value={overview.followersCount.toLocaleString("pt-BR")} />
            <StatCard icon={Grid3x3} label="Publicações" value={overview.mediaCount.toLocaleString("pt-BR")} />
            <StatCard icon={Eye} label="Alcance" value={overview.reachTotal.toLocaleString("pt-BR")} />
            <StatCard icon={UserCheck} label="Contas engajadas" value={overview.accountsEngaged.toLocaleString("pt-BR")} />
            <StatCard icon={Heart} label="Interações" value={overview.totalInteractions.toLocaleString("pt-BR")} />
            <StatCard icon={Eye} label="Visitas ao perfil" value={overview.profileViews.toLocaleString("pt-BR")} />
            <StatCard icon={MousePointerClick} label="Cliques no link" value={overview.websiteClicks.toLocaleString("pt-BR")} />
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <p className="font-semibold">Alcance por dia</p>
            <div className="mt-3 space-y-1.5">
              {overview.reachByDay.map((d) => (
                <div key={d.date} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-20 shrink-0">{new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (d.value / maxReach) * 100)}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right">{d.value.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
