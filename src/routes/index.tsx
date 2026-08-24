import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sparkles, Store, Settings, RefreshCw } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { KpiCard } from "@/components/crm/KpiCard";
import { PeriodFilter } from "@/components/crm/PeriodFilter";
import { ExecutiveSummary } from "@/components/crm/ExecutiveSummary";
import { AnalysisGrid } from "@/components/crm/AnalysisGrid";
import { SuggestedActions } from "@/components/crm/SuggestedActions";
import { Button } from "@/components/ui/button";

import {
  emptyDashboardData,
  statusHigherIsBetter,
  statusLowerIsBetter,
  GOALS,
  type PeriodKey,
  type DashboardData,
} from "@/lib/crm-mock";

import { getShopifyDashboardData } from "@/lib/shopify-dashboard.functions";
import { syncShopifyData } from "@/lib/crm-sync.functions";
import { getLatestAiAnalysis, generateAiAnalysis } from "@/lib/ai-analysis.functions";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CRM Analytics — Análise de base e fluxos com IA" },
      {
        name: "description",
        content:
          "Dashboard de CRM para e-commerce: recompra, LTV, churn, envios e tempo médio de envio, com análise e fluxos gerados por IA.",
      },
      { property: "og:title", content: "CRM Analytics — Análise de base e fluxos com IA" },
      {
        property: "og:description",
        content: "Métricas de recompra, LTV, churn e operação de envio com análise automática e ações sugeridas.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [period, setPeriod] = useState<PeriodKey>("mensal");
  const [range, setRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState(() => new Date());

  const getShopifyData = useServerFn(getShopifyDashboardData);
  const runAiAnalysis = useServerFn(generateAiAnalysis);
  const getAiAnalysis = useServerFn(getLatestAiAnalysis);

  const { data: shopifyData, isLoading: isShopifyLoading } = useQuery({
    queryKey: ["shopify-dashboard", period, range?.from, range?.to],
    queryFn: () => getShopifyData({
      data: {
        period,
        range: range?.from ? {
          from: range.from.toISOString(),
          to: range.to?.toISOString()
        } : undefined
      }
    }),
  });

  const queryClient = useQueryClient();
  const { data: aiAnalysis } = useQuery({
    queryKey: ["ai-analysis"],
    queryFn: () => getAiAnalysis(),
  });

  const aiIsStaleForPeriod = Boolean(aiAnalysis?.analysis) && aiAnalysis?.period !== period;

  const customLabel =
    range?.from && range?.to
      ? `${format(range.from, "dd/MM/yyyy", { locale: ptBR })} – ${format(range.to, "dd/MM/yyyy", { locale: ptBR })}`
      : undefined;

  const base = useMemo(() => emptyDashboardData(period, customLabel), [period, customLabel]);

  const brl0 = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  // Sem fallback silencioso: enquanto os dados reais não chegam, mostramos o estado vazio.
  const data = useMemo(() => {
    if (!shopifyData) return base;

    const s = shopifyData;
    const taxa = s.taxaRecompra ?? 0;
    const envioDias = (s.tempoMedioEnvioHoras ?? 0) / 24;
    const amostraEnvio = s.tempoMedioEnvioAmostra ?? 0;
    const baseClientes = s.totalClientesBase ?? 0;
    const madura = Boolean(s.baseMadura);
    const gaps = s.gapsAmostra ?? 0;
    const minSample = s.minSample ?? 5;

    const kpis = base.kpis.map((kpi) => {
      switch (kpi.id) {
        case "clientes":
          return { ...kpi, value: String(s.uniqueCustomers), hint: `${s.numPedidos} pedidos pagos no período` };
        case "pedidos":
          return { ...kpi, value: String(s.numPedidos) };
        case "vendas":
          return { ...kpi, value: brl0(s.faturamento) };
        case "ticket":
          return {
            ...kpi,
            value: s.numPedidos ? brl0(s.ticketMedio) : "—",
            status: s.numPedidos
              ? statusHigherIsBetter(s.ticketMedio, GOALS.ticketMedio.meta, GOALS.ticketMedio.regular)
              : undefined,
          };
        case "ltv":
          return { ...kpi, value: s.uniqueCustomers ? brl0(s.receitaPorCliente) : "—" };
        case "recompra":
          return {
            ...kpi,
            value: baseClientes >= minSample ? `${taxa.toFixed(1)}%` : "—",
            hint:
              baseClientes >= minSample
                ? `${s.recomprasCount} de ${baseClientes} clientes recompraram`
                : `Base insuficiente (${baseClientes} clientes)`,
            status:
              baseClientes >= minSample
                ? statusHigherIsBetter(taxa, GOALS.taxaRecompra.meta, GOALS.taxaRecompra.regular)
                : undefined,
          };
        case "pedidos-enviados":
          return { ...kpi, value: String(s.pedidosEnviadosCount) };
        case "produtos-enviados":
          return { ...kpi, value: String(s.produtosEnviadosCount) };
        case "tempo-envio":
          return {
            ...kpi,
            value: amostraEnvio === 0 ? "—" : `${envioDias.toFixed(1)} dias`,
            hint: amostraEnvio === 0 ? "Sem envios com rastreio no período" : `Base: ${amostraEnvio} pedido(s) enviados`,
            status:
              amostraEnvio === 0
                ? undefined
                : statusLowerIsBetter(envioDias, GOALS.tempoMedioEnvio.meta, GOALS.tempoMedioEnvio.regular),
          };
        default:
          return kpi;
      }
    });

    const panelStatus = {
      recompra: baseClientes >= minSample
        ? statusHigherIsBetter(taxa, GOALS.taxaRecompra.meta, GOALS.taxaRecompra.regular)
        : ("sem-dados" as const),
      clv: baseClientes >= minSample ? ("regular" as const) : ("sem-dados" as const),
      ticketRecorrencia: baseClientes >= minSample ? ("regular" as const) : ("sem-dados" as const),
      faixaTicket: s.numPedidos >= minSample ? ("regular" as const) : ("sem-dados" as const),
      regioes: s.regioes?.length ? ("regular" as const) : ("sem-dados" as const),
      churn: madura && baseClientes >= minSample ? ("regular" as const) : ("sem-dados" as const),
      tempoEntreCompras: gaps >= minSample ? ("regular" as const) : ("sem-dados" as const),
      curvaRecompra: gaps >= minSample ? ("regular" as const) : ("sem-dados" as const),
      envios: amostraEnvio
        ? statusLowerIsBetter(envioDias, GOALS.tempoMedioEnvio.meta, GOALS.tempoMedioEnvio.regular)
        : ("sem-dados" as const),
    };

    // Insights derivados dos dados reais (placeholder até a IA gerar a análise do período).
    const realInsights: DashboardData["insights"] = [
      {
        title: "Recompra da base",
        text:
          baseClientes >= minSample
            ? `${s.recomprasCount} de ${baseClientes} clientes com pedido pago voltaram a comprar.`
            : "Base de clientes ainda pequena para uma leitura confiável de recompra.",
        highlight: baseClientes >= minSample ? `${taxa.toFixed(2)}%` : undefined,
        tone:
          baseClientes >= minSample
            ? statusHigherIsBetter(taxa, GOALS.taxaRecompra.meta, GOALS.taxaRecompra.regular)
            : "info",
      },
      {
        title: "Faturamento válido",
        text: `Considera apenas pedidos pagos (PAID/PARTIALLY_PAID). Reembolsos, cancelados e expirados ficam fora.`,
        highlight: brl0(s.faturamento),
        tone: "info",
      },
      {
        title: "Tempo médio de envio",
        text:
          amostraEnvio === 0
            ? "Nenhum envio com rastreio registrado no período."
            : `Média entre pagamento e primeiro envio, sobre ${amostraEnvio} pedido(s).`,
        highlight: amostraEnvio === 0 ? undefined : `${envioDias.toFixed(1)} dias`,
        tone:
          amostraEnvio === 0
            ? "info"
            : statusLowerIsBetter(envioDias, GOALS.tempoMedioEnvio.meta, GOALS.tempoMedioEnvio.regular),
      },
      {
        title: "Maturidade da base",
        text: madura
          ? `Histórico pago de ${s.historyDays} dias — métricas de retenção e ciclo já são interpretáveis.`
          : `Histórico pago de apenas ${s.historyDays} dias. Retenção, churn e curva de recompra ainda são preliminares.`,
        tone: madura ? "info" : "regular",
      },
    ];

    const aiMatchesPeriod = aiAnalysis?.period === period;
    const ai = aiMatchesPeriod ? aiAnalysis?.analysis : undefined;
    const aiInsights = ai?.insights.map((i) =>
      i.highlight
        ? { title: i.title, text: i.text, tone: i.tone, highlight: i.highlight }
        : { title: i.title, text: i.text, tone: i.tone },
    );

    return {
      ...base,
      kpis,
      insights: aiInsights ?? realInsights,
      reguas: ai?.reguas ?? [],
      acoes: ai?.acoes ?? [],
      panelStatus: ai?.panelStatus ?? panelStatus,
      meta: {
        historyDays: s.historyDays ?? 0,
        baseMadura: madura,
        minSample,
        gapsAmostra: gaps,
        totalClientesBase: baseClientes,
        numPedidos: s.numPedidos,
        tempoMedioEnvioAmostra: amostraEnvio,
        hasRealData: true,
      },
      frequencia: s.frequencia ?? [],
      clv: s.clv ?? [],
      ticketRecorrencia: s.ticketRecorrencia ?? [],
      faixaTicket: s.faixaTicket ?? [],
      regioes: s.regioes ?? [],
      churn: s.churn ?? [],
      tempoEntreCompras: s.tempoEntreCompras ?? [],
      curvaRecompra: s.curvaRecompra ?? [],
      enviosPorDia: s.enviosPorDia ?? [],
      cohortData: s.cohortData ?? [],
      sessoes: s.sessoes ?? [],
      produtosMaisVendidos: s.produtosMaisVendidos ?? [],
    } satisfies DashboardData;
  }, [base, shopifyData, aiAnalysis, period]);


  const runSync = useServerFn(syncShopifyData);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await runSync({ data: { fullSync: false } });
      toast.success(`Sincronização concluída: ${res.totalImported} pedido(s) atualizados.`);
      await queryClient.invalidateQueries();
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setIsSyncing(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await runAiAnalysis({
        data: {
          period,
          range: range?.from
            ? { from: range.from.toISOString(), to: range.to?.toISOString() }
            : undefined,
        },
      });
      if (!res.success) {
        toast.error(res.error || "Falha ao gerar a análise com IA.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["ai-analysis"] });
      setAnalyzedAt(new Date());
      toast.success("Análise atualizada pela IA.");
    } catch (err: any) {
      toast.error("Erro ao gerar análise: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" />
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="gradient-brand flex size-11 items-center justify-center rounded-2xl text-primary-foreground">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">CRM Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Análise da base • {data.periodLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <Store className="size-3.5" /> Shopify: Integrado
              </span>
              <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing} className="h-8 gap-2">
                <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Sincronizando..." : "Sincronizar Shopify"}
              </Button>
              <Button variant="outline" size="icon" asChild className="size-8 rounded-full">
                <Link to="/configuracoes">
                  <Settings className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="mt-6">
          <PeriodFilter
            period={period}
            onPeriodChange={setPeriod}
            range={range}
            onRangeChange={setRange}
            onRefresh={refresh}
            loading={loading}
          />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        {aiIsStaleForPeriod && (
          <div className="mt-6 rounded-lg border border-warning/30 bg-warning-soft/60 px-4 py-2.5 text-sm text-warning">
            A última análise por IA foi gerada para outro período. Os insights abaixo usam os dados reais deste
            período, mas para a análise completa da IA clique em "Refazer análise".
          </div>
        )}

        <div className="mt-6">
          <ExecutiveSummary insights={data.insights} />
        </div>

        <div className="mt-6">
          <AnalysisGrid data={data} />
        </div>

        <div className="mt-6">
          <SuggestedActions reguas={data.reguas} acoes={data.acoes} />
        </div>

        {isShopifyLoading && (
          <div className="mb-4 text-center text-xs text-muted-foreground animate-pulse">
            Carregando dados reais da Shopify...
          </div>
        )}
        <footer className="mt-10 pb-6 text-center text-xs text-muted-foreground">
          Legenda do semáforo: <span className="text-critical">vermelho crítico</span> ·{" "}
          <span className="text-warning">amarelo regular</span> · <span className="text-success">verde dentro da meta</span>
        </footer>
      </div>
    </div>
  );
}
