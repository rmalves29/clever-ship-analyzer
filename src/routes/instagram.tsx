import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCw,
  Users,
  Grid3x3,
  Eye,
  Heart,
  UserCheck,
  MousePointerClick,
  Image as ImageIcon,
  Sparkles,
  MessageCircle,
  Share2,
  Bookmark,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getInstagramConnectionStatus, connectInstagram, getInstagramOverview, getInstagramAudience, getInstagramTopContent } from "@/lib/instagram.functions";
import { getLatestInstagramAnalysis, generateInstagramAnalysis } from "@/lib/instagram-ai.functions";
import type { InstagramDatePreset } from "@/lib/instagram.server";

export const Route = createFileRoute("/instagram")({
  component: InstagramPage,
  head: () => ({
    meta: [
      { title: "Instagram | Performance" },
      { name: "description", content: "Insights reais da conta do Instagram — alcance, engajamento, público e conteúdo." },
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

const TONE_CLASS: Record<string, string> = {
  positivo: "bg-success-soft text-success",
  atencao: "bg-warning-soft text-warning",
  critico: "bg-critical-soft text-critical",
};

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

function BarRow({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {value.toLocaleString("pt-BR")} <span className="text-xs">({(pct * 100).toFixed(1)}%)</span>
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </div>
    </div>
  );
}

function InstagramPage() {
  const [view, setView] = useState<"geral" | "conteudo" | "publico" | "ia">("geral");
  const [datePreset, setDatePreset] = useState<InstagramDatePreset>("last_7d");
  const runStatus = useServerFn(getInstagramConnectionStatus);
  const runConnect = useServerFn(connectInstagram);
  const runOverview = useServerFn(getInstagramOverview);
  const runAudience = useServerFn(getInstagramAudience);
  const runTopContent = useServerFn(getInstagramTopContent);
  const runLatestAnalysis = useServerFn(getLatestInstagramAnalysis);
  const runGenerateAnalysis = useServerFn(generateInstagramAnalysis);

  const { data: connection, isLoading: loadingConnection, refetch: refetchStatus } = useQuery({
    queryKey: ["instagram-connection"],
    queryFn: () => runStatus(),
  });

  const { data: overviewResult, isLoading: loadingOverview, refetch: refetchOverview } = useQuery({
    queryKey: ["instagram-overview", datePreset],
    queryFn: () => runOverview({ data: { datePreset } }),
    enabled: Boolean(connection?.connected) && view === "geral",
  });

  const { data: audienceResult, isLoading: loadingAudience } = useQuery({
    queryKey: ["instagram-audience"],
    queryFn: () => runAudience(),
    enabled: Boolean(connection?.connected) && view === "publico",
  });

  const { data: topContentResult, isLoading: loadingTopContent } = useQuery({
    queryKey: ["instagram-top-content", datePreset],
    queryFn: () => runTopContent({ data: { datePreset } }),
    enabled: Boolean(connection?.connected) && (view === "conteudo" || view === "geral"),
  });

  const { data: latestAnalysis, refetch: refetchAnalysis } = useQuery({
    queryKey: ["instagram-analysis"],
    queryFn: () => runLatestAnalysis(),
    enabled: Boolean(connection?.connected) && view === "ia",
  });

  const [generating, setGenerating] = useState(false);
  const handleGenerateAnalysis = async () => {
    setGenerating(true);
    try {
      const res = await runGenerateAnalysis({ data: { datePreset } });
      if (!res.success) {
        toast.error(res.error || "Falha ao gerar análise.");
        return;
      }
      toast.success("Análise gerada.");
      refetchAnalysis();
    } finally {
      setGenerating(false);
    }
  };

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
  const audience = audienceResult?.success ? audienceResult.audience : null;
  const topContent = topContentResult?.success ? topContentResult.media : [];
  const analysis = latestAnalysis?.analysis ?? null;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instagram</h1>
          <p className="text-sm text-muted-foreground">
            {loadingConnection ? "Verificando conexão..." : connection?.username ? `@${connection.username}` : "Conectado"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (view === "geral") refetchOverview();
            else if (view === "ia") refetchAnalysis();
          }}
          className="gap-2"
        >
          <RefreshCw className="size-3.5" /> Atualizar
        </Button>
      </div>

      <div className="mt-4">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="geral" className="gap-1.5">
              <Eye className="size-3.5" /> Visão Geral
            </TabsTrigger>
            <TabsTrigger value="conteudo" className="gap-1.5">
              <ImageIcon className="size-3.5" /> Conteúdo
            </TabsTrigger>
            <TabsTrigger value="publico" className="gap-1.5">
              <Users className="size-3.5" /> Público
            </TabsTrigger>
            <TabsTrigger value="ia" className="gap-1.5">
              <Sparkles className="size-3.5" /> Análise IA
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {(view === "geral" || view === "conteudo") && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <Button key={p.value} variant={datePreset === p.value ? "default" : "outline"} size="sm" onClick={() => setDatePreset(p.value)}>
              {p.label}
            </Button>
          ))}
        </div>
      )}

      {view === "geral" && (
        <>
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
                {overview.reachByDay.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Sem dados diários nesse período.</p>}
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

              <div className="mt-6 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Posts que mais engajaram no período</p>
                  <button className="text-xs text-primary hover:underline" onClick={() => setView("conteudo")}>
                    Ver todos
                  </button>
                </div>
                {loadingTopContent && <p className="mt-2 text-sm text-muted-foreground">Carregando...</p>}
                {!loadingTopContent && topContent.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">Nenhuma publicação nesse período.</p>
                )}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {topContent.slice(0, 3).map((m, i) => (
                    <a
                      key={m.id}
                      href={m.permalink ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="flex gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-primary"
                    >
                      <div className="relative w-16 shrink-0">
                        {m.thumbnailUrl ? (
                          <img src={m.thumbnailUrl} alt="" className="aspect-square w-full rounded-md object-cover" />
                        ) : (
                          <div className="flex aspect-square items-center justify-center rounded-md bg-muted">
                            <ImageIcon className="size-5 text-muted-foreground" />
                          </div>
                        )}
                        <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">#{i + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-xs text-muted-foreground">{m.caption || "(sem legenda)"}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{m.productType}</p>
                        <p className="mt-1 text-xs font-semibold">{m.totalInteractions.toLocaleString("pt-BR")} interações</p>
                      </div>
                    </a>
                  ))}
                </div>
                {topContent.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    O post #1 puxou o engajamento do período — {topContent[0]!.productType === "FEED" ? "um post de Feed" : topContent[0]!.productType === "REELS" ? "um Reel" : "uma publicação"}{" "}
                    com {topContent[0]!.likes.toLocaleString("pt-BR")} curtidas, {topContent[0]!.comments.toLocaleString("pt-BR")} comentários e{" "}
                    {topContent[0]!.shares.toLocaleString("pt-BR")} compartilhamentos.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {view === "conteudo" && (
        <>
          {loadingTopContent && <p className="mt-6 text-center text-muted-foreground">Carregando...</p>}
          {!loadingTopContent && topContentResult && !topContentResult.success && (
            <p className="mt-6 text-center text-muted-foreground">{topContentResult.error}</p>
          )}
          {!loadingTopContent && topContentResult?.success && topContent.length === 0 && (
            <p className="mt-6 text-center text-muted-foreground">Nenhuma publicação nesse período.</p>
          )}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {topContent.map((m, i) => (
              <a
                key={m.id}
                href={m.permalink ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary"
              >
                <div className="relative">
                  {m.thumbnailUrl ? (
                    <img src={m.thumbnailUrl} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
                      <ImageIcon className="size-6 text-muted-foreground" />
                    </div>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">#{i + 1}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{m.caption || "(sem legenda)"}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{m.productType}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground"><Eye className="size-3" /> {m.reach.toLocaleString("pt-BR")}</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><Heart className="size-3" /> {m.likes.toLocaleString("pt-BR")}</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><MessageCircle className="size-3" /> {m.comments.toLocaleString("pt-BR")}</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><Share2 className="size-3" /> {m.shares.toLocaleString("pt-BR")}</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><Bookmark className="size-3" /> {m.saved.toLocaleString("pt-BR")}</span>
                  <span className="font-semibold">{m.totalInteractions.toLocaleString("pt-BR")} intr.</span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {view === "publico" && (
        <>
          {loadingAudience && <p className="mt-6 text-center text-muted-foreground">Carregando...</p>}
          {!loadingAudience && audienceResult && !audienceResult.success && (
            <p className="mt-6 text-center text-muted-foreground">{audienceResult.error}</p>
          )}
          {audience && (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold">Faixa etária</p>
                <div className="mt-3 space-y-2.5">
                  {audience.age.map((a) => <BarRow key={a.label} label={a.label} value={a.value} pct={a.pct} />)}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold">Gênero</p>
                <div className="mt-3 space-y-2.5">
                  {audience.gender.map((g) => <BarRow key={g.label} label={g.label} value={g.value} pct={g.pct} />)}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold">Top 10 países</p>
                <div className="mt-3 space-y-2.5">
                  {audience.topCountries.map((c) => <BarRow key={c.label} label={c.label} value={c.value} pct={c.pct} />)}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold">Top 10 cidades</p>
                <div className="mt-3 space-y-2.5">
                  {audience.topCities.map((c) => <BarRow key={c.label} label={c.label} value={c.value} pct={c.pct} />)}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {view === "ia" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <p className="font-semibold">Análise gerada por IA</p>
              <p className="text-xs text-muted-foreground">
                {latestAnalysis?.generatedAt
                  ? `Última análise: ${new Date(latestAnalysis.generatedAt).toLocaleString("pt-BR")} (${latestAnalysis.period})`
                  : "Nenhuma análise gerada ainda."}
              </p>
            </div>
            <Button onClick={handleGenerateAnalysis} disabled={generating} className="gap-2">
              <Sparkles className="size-4" />
              {generating ? "Analisando..." : "Gerar análise"}
            </Button>
          </div>

          {analysis && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold">Resumo</p>
                <p className="mt-1 text-sm text-muted-foreground">{analysis.resumo}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {analysis.insights.map((ins, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-4">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[ins.tone] ?? "bg-muted text-muted-foreground"}`}>
                      {ins.title}
                    </span>
                    <p className="mt-2 text-sm text-muted-foreground">{ins.text}</p>
                  </div>
                ))}
              </div>

              {analysis.recomendacoes.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="font-semibold">Recomendações</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                    {analysis.recomendacoes.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
