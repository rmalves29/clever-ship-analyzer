import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, RefreshCw, BarChart3, ShoppingBag, CreditCard, ShoppingCart, ArrowUpRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { lazy, Suspense } from "react";
import { getLiveViewData } from "@/lib/shopify-live-view.functions";
import { brl } from "@/lib/crm-mock";
import { syncShopifyData } from "@/lib/crm-sync.functions";

// Carregamento dinâmico do globo para evitar problemas com SSR e bibliotecas pesadas
const LiveGlobe = lazy(() => import("@/components/crm/LiveGlobe"));

export const Route = createFileRoute("/crm/live-view")({
  component: LiveViewPage,
  head: () => ({
    meta: [
      { title: "Live View | CRM Insights" },
      { name: "description", content: "Monitoramento em tempo real das atividades na loja." },
    ],
  }),
});

function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

function LiveViewPage() {
  const fetchLiveView = useServerFn(getLiveViewData);
  const fetchSync = useServerFn(syncShopifyData);

  const { data, isLoading } = useQuery({
    queryKey: ["live-view-data"],
    queryFn: () => fetchLiveView(),
    refetchInterval: 30_000,
  });

  const funilTotal = data ? Math.max(data.carrinhosAtivosHoje, 1) : 1;

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <span className="gradient-brand flex size-11 items-center justify-center rounded-2xl text-primary-foreground">
              <Activity className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Live View</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="size-2 rounded-full bg-success animate-pulse"></span>
                Dados reais da Shopify (sessões via ShopifyQL, pedidos sincronizados)
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fetchSync({ data: { fullSync: false } })}
          >
            <RefreshCw className="size-4" /> Atualizar agora
          </Button>
        </div>

        {data?.sessoesIndisponiveis && (
          <div className="mb-6 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
            Sessões, visitantes e o funil de carrinho/checkout estão marcados como <strong>indisponível</strong> —
            a API de sessões da Shopify (ShopifyQL) não retorna dados pro token deste app (fluxo client_credentials
            de custom app), mesmo com os escopos de analytics concedidos. Pedidos, vendas, produtos e atividade
            recente abaixo continuam 100% reais.
          </div>
        )}

        {/* Top Row Cards */}
        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <div className="surface-card p-5 border-l-4 border-success">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visitantes agora</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-3xl font-bold leading-none">
                {data?.sessoesIndisponiveis ? "—" : (data?.visitantesAgora ?? (isLoading ? "…" : 0))}
              </h3>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {data?.sessoesIndisponiveis
                ? "Indisponível — ver aviso acima."
                : "Estimativa: sessões iniciadas nos últimos 5 min — a Shopify usa um contador ao vivo interno que nenhuma API pública expõe, então esse número pode divergir do admin."}
            </p>
          </div>
          <div className="surface-card p-5 border-l-4 border-brand">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total de vendas (hoje)</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-3xl font-bold leading-none">{data ? brl(data.faturamentoHoje) : "R$ 0"}</h3>
            </div>
          </div>
          <div className="surface-card p-5 border-l-4 border-warning">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessões (hoje)</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-3xl font-bold leading-none">{data?.sessoesIndisponiveis ? "—" : (data?.sessoesHoje ?? 0)}</h3>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {data?.sessoesIndisponiveis ? "Indisponível" : `${data?.visitantesUnicosHoje ?? 0} visitantes únicos`}
            </p>
          </div>
          <div className="surface-card p-5 border-l-4 border-info">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pedidos (hoje)</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-3xl font-bold leading-none">{data?.pedidosHoje ?? 0}</h3>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          {/* Main Map Area */}
          <div className="lg:col-span-2 surface-card p-0 overflow-hidden relative min-h-[500px] flex flex-col bg-muted/5 border-none">
            <div className="absolute top-6 left-6 z-20">
              <Badge variant="outline" className="bg-background/80 backdrop-blur-sm border-border/50 text-xs px-3 py-1">
                Sessões e pedidos reais de hoje
              </Badge>
            </div>

            <div className="flex-1 w-full h-full min-h-[500px] flex items-center justify-center">
              <Suspense
                fallback={
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <RefreshCw className="size-8 animate-spin" />
                    <p className="text-sm">Iniciando globo 3D...</p>
                  </div>
                }
              >
                <LiveGlobe markers={data?.marcadoresGlobo ?? []} />
              </Suspense>
            </div>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-4">
              <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border/50 text-[10px] font-medium">
                <span className="size-2 rounded-full" style={{ backgroundColor: '#ef4444' }}></span> Sessões
              </div>
              <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border/50 text-[10px] font-medium">
                <span className="size-2 rounded-full" style={{ backgroundColor: '#9333ea' }}></span> Pedidos
              </div>
            </div>
          </div>

          {/* Side Info Panel */}
          <div className="flex flex-col gap-6">
            {/* Customer Behavior Funnel */}
            <div className="surface-card p-6">
              <h4 className="text-sm font-bold mb-6">Comportamento do cliente (hoje)</h4>
              {data?.sessoesIndisponiveis ? (
                <p className="text-xs text-muted-foreground">Indisponível — ver aviso no topo da página.</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground">Carrinhos com adição</span>
                      <span className="text-sm font-bold">{data?.carrinhosAtivosHoje ?? 0}</span>
                    </div>
                    <Progress value={100} className="h-1.5 bg-muted" />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground">Chegaram no checkout</span>
                      <span className="text-sm font-bold">{data?.noCheckoutHoje ?? 0}</span>
                    </div>
                    <Progress value={data ? Math.min(100, (data.noCheckoutHoje / funilTotal) * 100) : 0} className="h-1.5 bg-muted" />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground">Comprado</span>
                      <span className="text-sm font-bold">{data?.compradoHoje ?? 0}</span>
                    </div>
                    <Progress value={data ? Math.min(100, (data.compradoHoje / funilTotal) * 100) : 0} className="h-1.5 bg-muted" />
                  </div>
                </div>
              )}
            </div>

            {/* New vs Recurring */}
            <div className="surface-card p-6">
              <h4 className="text-sm font-bold mb-4">Clientes novos x recorrentes (hoje)</h4>
              <div className="flex gap-6 mb-4">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-info"></span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">Novo</span>
                    <span className="text-sm font-bold">{data?.clientesNovosHoje ?? 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-brand"></span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">Recorrente</span>
                    <span className="text-sm font-bold">{data?.clientesRecorrentesHoje ?? 0}</span>
                  </div>
                </div>
              </div>
              {data && data.clientesNovosHoje + data.clientesRecorrentesHoje > 0 && (
                <div className="w-full h-8 flex rounded-sm overflow-hidden mb-2">
                  <div
                    className="h-full bg-info"
                    style={{ width: `${(data.clientesNovosHoje / (data.clientesNovosHoje + data.clientesRecorrentesHoje)) * 100}%` }}
                  ></div>
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${(data.clientesRecorrentesHoje / (data.clientesNovosHoje + data.clientesRecorrentesHoje)) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Recent Activity */}
          <div className="surface-card p-6 flex flex-col">
            <h4 className="font-bold mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-success" /> Atividade Recente
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </h4>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {(data?.atividadeRecente ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma atividade ainda hoje.</p>
              )}
              {(data?.atividadeRecente ?? []).map((a, i) => (
                <div key={i} className="flex items-start gap-3 text-sm pb-3 border-b border-border/40">
                  <div
                    className={`size-8 rounded-full flex items-center justify-center shrink-0 ${
                      a.tipo === "pedido" ? "bg-success/10" : "bg-warning/10"
                    }`}
                  >
                    {a.tipo === "pedido" ? (
                      <ShoppingBag className="size-4 text-success" />
                    ) : (
                      <ShoppingCart className="size-4 text-warning" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-xs">
                      {a.tipo === "pedido" ? "Novo pedido" : "Carrinho abandonado"}
                      {a.cidade ? ` de ${a.cidade}` : ""}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {relativeTime(a.createdAt)}
                      {a.valor != null ? ` · ${brl(a.valor)}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sessions by Location */}
          <div className="surface-card p-6">
            <h4 className="font-bold mb-6 flex items-center gap-2">
              <MapPin className="size-4 text-brand" /> Sessões por local (hoje)
            </h4>
            <div className="space-y-5">
              {data?.sessoesIndisponiveis && (
                <p className="text-xs text-muted-foreground">Indisponível — ver aviso no topo da página.</p>
              )}
              {!data?.sessoesIndisponiveis && (data?.sessoesPorLocal ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Sem sessões registradas hoje ainda.</p>
              )}
              {(data?.sessoesPorLocal ?? []).slice(0, 5).map((s, i) => {
                const max = data?.sessoesPorLocal[0]?.sessoes || 1;
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">
                        Brazil · {s.regiao} · {s.cidade}
                      </span>
                      <span className="font-bold">{s.sessoes}</span>
                    </div>
                    <Progress value={(s.sessoes / max) * 100} className="h-1.5 bg-muted" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Products */}
          <div className="surface-card p-6">
            <h4 className="font-bold mb-4 flex items-center gap-2">
              <BarChart3 className="size-4 text-brand" /> Total de vendas por produto (hoje)
            </h4>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              {(data?.topProdutosHoje ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma venda ainda hoje.</p>
              )}
              {(data?.topProdutosHoje ?? []).map((item, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] pb-2 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-2 truncate max-w-[180px]">
                    <div className="size-8 rounded bg-muted flex items-center justify-center shrink-0">
                      <ShoppingBag className="size-3 text-muted-foreground" />
                    </div>
                    <span className="truncate">{item.nome}</span>
                  </div>
                  <span className="font-bold shrink-0">{brl(item.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground">
          <CreditCard className="size-3" />
          Sessões, funil e local via ShopifyQL (Shopify) · pedidos, produtos e novo/recorrente via base sincronizada.
        </div>
      </div>
    </div>
  );
}
