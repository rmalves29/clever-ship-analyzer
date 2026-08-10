import { createFileRoute, Link } from "@tanstack/react-router"; // preciso colocar o sistema em produção, os dados da shopify nao ficam salvos, e os dados que o sistema está apresentando nao são reais. preciso que vc corrija tudo isso
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sparkles, Store, Settings } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { KpiCard } from "@/components/crm/KpiCard";
import { PeriodFilter } from "@/components/crm/PeriodFilter";
import { ExecutiveSummary } from "@/components/crm/ExecutiveSummary";
import { AnalysisGrid } from "@/components/crm/AnalysisGrid";
import { SuggestedActions } from "@/components/crm/SuggestedActions";
import { Button } from "@/components/ui/button";

import { getDashboardData, type PeriodKey } from "@/lib/crm-mock";
import { getShopifyDashboardData } from "@/lib/shopify-dashboard.functions";
import { useQuery } from "@tanstack/react-query";
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

  const customLabel =
    range?.from && range?.to
      ? `${format(range.from, "dd/MM/yyyy", { locale: ptBR })} – ${format(range.to, "dd/MM/yyyy", { locale: ptBR })}`
      : undefined;

  const mockData = useMemo(() => getDashboardData(period, customLabel), [period, customLabel]);

  // Merge shopify data into dashboard data
  const data = useMemo(() => {
    if (!shopifyData || !shopifyData.numPedidos) return mockData;

    const mergedKpis = mockData.kpis.map(kpi => {
      if (kpi.id === "clientes") return { ...kpi, value: String(shopifyData.uniqueCustomers) };
      if (kpi.id === "ticket") return { ...kpi, value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(shopifyData.ticketMedio) };
      if (kpi.id === "pedidos-enviados") return { ...kpi, value: String(shopifyData.pedidosEnviadosCount) };
      if (kpi.id === "tempo-envio") return { ...kpi, value: `${shopifyData.tempoMedioEnvioDias.toFixed(1)} dias` };
      return kpi;
    });

    return { ...mockData, kpis: mergedKpis };
  }, [mockData, shopifyData]);

  const refresh = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setAnalyzedAt(new Date());
    }, 1400);
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
