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

import { getDashboardData, statusHigherIsBetter, statusLowerIsBetter, GOALS, type PeriodKey } from "@/lib/crm-mock";
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

  const customLabel =
    range?.from && range?.to
      ? `${format(range.from, "dd/MM/yyyy", { locale: ptBR })} – ${format(range.to, "dd/MM/yyyy", { locale: ptBR })}`
      : undefined;

  const mockData = useMemo(() => getDashboardData(period, customLabel), [period, customLabel]);

  // Merge shopify data into dashboard data.
  // Só cai para os dados de demonstração enquanto a busca real ainda não voltou —
  // um período sem pedidos (numPedidos === 0) é um resultado real válido (ex: filtro
  // "Diário" num dia sem vendas) e deve mostrar zero, não os números fake de mock.
  const data = useMemo(() => {
    if (!shopifyData) return mockData;

    const mergedKpis = mockData.kpis.map(kpi => {
      if (kpi.id === "clientes") return { ...kpi, value: String(shopifyData.uniqueCustomers), hint: `${shopifyData.numPedidos} pedidos` };
      if (kpi.id === "ticket") return { ...kpi, value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(shopifyData.ticketMedio) };
      if (kpi.id === "ltv") return { ...kpi, value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(shopifyData.uniqueCustomers ? shopifyData.faturamento / shopifyData.uniqueCustomers : 0) };
      if (kpi.id === "pedidos-enviados") return { ...kpi, value: String(shopifyData.pedidosEnviadosCount) };
      if (kpi.id === "produtos-enviados") return { ...kpi, value: String(shopifyData.produtosEnviadosCount) };
      if (kpi.id === "recompra") {
        const taxa = shopifyData.taxaRecompra ?? 0;
        return {
          ...kpi,
          value: `${taxa.toFixed(1)}%`,
          hint: `${shopifyData.totalClientesBase ?? 0} clientes na base`,
          status: statusHigherIsBetter(taxa, GOALS.taxaRecompra.meta, GOALS.taxaRecompra.regular),
        };
      }
      if (kpi.id === "tempo-envio") {
        const horas = shopifyData.tempoMedioEnvioHoras ?? 0;
        const amostra = shopifyData.tempoMedioEnvioAmostra ?? 0;
        const dias = horas / 24;
        const value = amostra === 0 ? "—" : `${dias.toFixed(1)} dias`;
        return {
          ...kpi,
          value,
          hint: amostra === 0 ? "Sem envios com rastreio no período" : `Base: ${amostra} pedido(s) enviados`,
          status: statusLowerIsBetter(dias, GOALS.tempoMedioEnvio.meta, GOALS.tempoMedioEnvio.regular),
        };
      }
      return kpi;
    });

    const taxa = shopifyData.taxaRecompra ?? 0;
    const envioDias = (shopifyData.tempoMedioEnvioHoras ?? 0) / 24;
    const insights = mockData.insights.map((i) => {
      if (i.title === "Análise de recompra por cliente")
        return { ...i, highlight: `${taxa.toFixed(2)}%`, tone: statusHigherIsBetter(taxa, GOALS.taxaRecompra.meta, GOALS.taxaRecompra.regular) };
      if (i.title === "Tempo médio de envio")
        return {
          ...i,
          highlight: `${envioDias.toFixed(1)} dias`,
          tone: statusLowerIsBetter(envioDias, GOALS.tempoMedioEnvio.meta, GOALS.tempoMedioEnvio.regular),
        };
      if (i.title === "Curva de churn")
        return { ...i, highlight: `${(shopifyData.churn?.[0]?.value ?? 0).toFixed(1)}%` };
      return i;
    });

    // Insights/réguas/ações reais gerados por IA (quando já existe uma análise salva)
    // substituem os do mock, que só ficam como placeholder até a 1ª "Refazer análise".
    const ai = aiAnalysis?.analysis;
    const aiInsights = ai?.insights.map((i) =>
      i.highlight
        ? { title: i.title, text: i.text, tone: i.tone, highlight: i.highlight }
        : { title: i.title, text: i.text, tone: i.tone },
    );

    return {
      ...mockData,
      kpis: mergedKpis,
      insights: aiInsights ?? insights,
      reguas: ai?.reguas ?? mockData.reguas,
      acoes: ai?.acoes ?? mockData.acoes,
      frequencia: shopifyData.frequencia ?? mockData.frequencia,
      clv: shopifyData.clv ?? mockData.clv,
      ticketRecorrencia: shopifyData.ticketRecorrencia ?? mockData.ticketRecorrencia,
      faixaTicket: shopifyData.faixaTicket ?? mockData.faixaTicket,
      regioes: shopifyData.regioes?.length ? shopifyData.regioes : [],
      churn: shopifyData.churn ?? mockData.churn,
      tempoEntreCompras: shopifyData.tempoEntreCompras ?? mockData.tempoEntreCompras,
      curvaRecompra: shopifyData.curvaRecompra ?? mockData.curvaRecompra,
      enviosPorDia: shopifyData.enviosPorDia ?? mockData.enviosPorDia,
    };
  }, [mockData, shopifyData, aiAnalysis]);

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
