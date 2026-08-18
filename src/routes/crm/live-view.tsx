import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Map, RefreshCw, BarChart3, Users, ShoppingBag, CreditCard, ShoppingCart, ArrowUpRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getShopifyDashboardData } from "@/lib/shopify-dashboard.functions";
import { brl } from "@/lib/crm-mock";

export const Route = createFileRoute("/crm/live-view")({
  component: LiveViewPage,
  head: () => ({
    meta: [
      { title: "Live View | CRM Insights" },
      { name: "description", content: "Monitoramento em tempo real das atividades na loja." },
    ],
  }),
});

function LiveViewPage() {
  const fetchDashboard = useServerFn(getShopifyDashboardData);
  
  const { data, isLoading } = useQuery({
    queryKey: ["live-dashboard"],
    queryFn: () => fetchDashboard({ data: { period: "diario" } }),
    refetchInterval: 30000, // Atualiza a cada 30s
  });

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
                Monitoramento em tempo real
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw className="size-4" /> Atualizar agora
          </Button>
        </div>

        {/* Top Row Cards */}
        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <div className="surface-card p-5 border-l-4 border-success">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visitantes agora</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-3xl font-bold leading-none">12</h3>
              <div className="h-8 w-16 bg-success/10 rounded-sm overflow-hidden flex items-end">
                <div className="w-full h-[40%] bg-success/30 rounded-t-sm"></div>
              </div>
            </div>
          </div>
          <div className="surface-card p-5 border-l-4 border-brand">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total de vendas</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-3xl font-bold leading-none">{data ? brl(data.faturamento) : "R$ 0"}</h3>
              <div className="h-8 w-16 bg-brand/10 rounded-sm overflow-hidden flex items-end">
                <div className="w-full h-[60%] bg-brand/30 rounded-t-sm"></div>
              </div>
            </div>
          </div>
          <div className="surface-card p-5 border-l-4 border-warning">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessões</p>
            <div className="flex items-end justify-between mt-2">
              <div className="flex flex-col">
                <h3 className="text-3xl font-bold leading-none">1.188</h3>
                <p className="text-[10px] text-success font-medium mt-1">↗ 4,9 mil%</p>
              </div>
              <div className="h-8 w-16 bg-warning/10 rounded-sm overflow-hidden flex items-end">
                <div className="w-full h-[30%] bg-warning/30 rounded-t-sm"></div>
              </div>
            </div>
          </div>
          <div className="surface-card p-5 border-l-4 border-info">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pedidos</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-3xl font-bold leading-none">{data?.numPedidos ?? 0}</h3>
              <div className="h-8 w-16 bg-info/10 rounded-sm overflow-hidden flex items-end">
                <div className="w-full h-[50%] bg-info/30 rounded-t-sm"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          {/* Main Map Area */}
          <div className="lg:col-span-2 surface-card p-0 overflow-hidden relative min-h-[500px] flex flex-col bg-muted/5 border-none">
            <div className="absolute top-6 left-6 z-20">
               <Badge variant="outline" className="bg-background/80 backdrop-blur-sm border-border/50 text-xs px-3 py-1">
                 Mapa em Tempo Real
               </Badge>
            </div>
            <div className="absolute top-6 right-6 z-20 flex gap-2">
              <Button size="icon" variant="secondary" className="size-8 bg-background/80 backdrop-blur-sm"><MapPin className="size-4" /></Button>
              <Button size="icon" variant="secondary" className="size-8 bg-background/80 backdrop-blur-sm"><RefreshCw className="size-4" /></Button>
            </div>
            
            {/* Mock Map Image Representation or Canvas would go here */}
            <div className="flex-1 flex items-center justify-center opacity-20 pointer-events-none">
               <Map className="size-48 text-brand" />
            </div>

            {/* Pulsing points representing live activity */}
            <div className="absolute top-[40%] left-[30%] size-3 bg-brand rounded-full animate-ping shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
            <div className="absolute top-[60%] left-[35%] size-4 bg-success rounded-full animate-ping delay-700 shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
            <div className="absolute top-[45%] left-[38%] size-2 bg-brand rounded-full animate-ping delay-1000 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
            <div className="absolute top-[55%] left-[42%] size-3 bg-brand rounded-full animate-ping delay-300 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>

            <div className="absolute bottom-6 right-6 z-20 flex gap-4">
              <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border/50 text-[10px] font-medium">
                <span className="size-2 rounded-full bg-brand"></span> Visitantes agora
              </div>
              <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border/50 text-[10px] font-medium">
                <span className="size-2 rounded-full bg-success"></span> Pedidos
              </div>
            </div>
          </div>

          {/* Side Info Panel */}
          <div className="flex flex-col gap-6">
            {/* Customer Behavior Funnel */}
            <div className="surface-card p-6">
              <h4 className="text-sm font-bold mb-6">Comportamento do cliente</h4>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-muted-foreground">Carrinhos ativos</span>
                    <span className="text-sm font-bold">2</span>
                  </div>
                  <Progress value={20} className="h-1.5 bg-muted" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-muted-foreground">No checkout</span>
                    <span className="text-sm font-bold">0</span>
                  </div>
                  <Progress value={0} className="h-1.5 bg-muted" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-muted-foreground">Comprado</span>
                    <span className="text-sm font-bold">0</span>
                  </div>
                  <Progress value={0} className="h-1.5 bg-muted" />
                </div>
                <div className="pt-4 mt-4 border-t border-border/50 h-32 flex items-end gap-1">
                   <div className="flex-1 bg-brand/10 h-[100%] rounded-t-sm"></div>
                   <div className="flex-1 bg-brand/10 h-[40%] rounded-t-sm"></div>
                   <div className="flex-1 bg-brand/10 h-[10%] rounded-t-sm"></div>
                </div>
              </div>
            </div>

            {/* New vs Recurring */}
            <div className="surface-card p-6">
              <h4 className="text-sm font-bold mb-4">Clientes novos x recorrentes</h4>
              <div className="flex gap-6 mb-4">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-info"></span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">Novo</span>
                    <span className="text-sm font-bold">18</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-brand"></span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">Recorrente</span>
                    <span className="text-sm font-bold">2</span>
                  </div>
                </div>
              </div>
              <div className="w-full h-8 flex rounded-sm overflow-hidden mb-2">
                <div className="h-full bg-info" style={{ width: '90%' }}></div>
                <div className="h-full bg-brand" style={{ width: '10%' }}></div>
              </div>
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
              <div className="flex items-start gap-3 text-sm pb-3 border-b border-border/40">
                <div className="size-8 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                  <ShoppingBag className="size-4 text-success" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-xs">Novo pedido de Belo Horizonte, MG</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">há 2 min · R$ 184,50</span>
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm pb-3 border-b border-border/40">
                <div className="size-8 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                  <ShoppingCart className="size-4 text-warning" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-xs">Carrinho abandonado em São Paulo, SP</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">há 5 min</span>
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm pb-3 border-b border-border/40">
                <div className="size-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                  <CreditCard className="size-4 text-brand" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-xs">Checkout iniciado em Brasília, DF</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">há 12 min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sessions by Location */}
          <div className="surface-card p-6">
            <h4 className="font-bold mb-6 flex items-center gap-2">
              <MapPin className="size-4 text-brand" /> Sessões por local
            </h4>
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Brazil · Minas Gerais · Belo Horizonte</span>
                  <span className="font-bold">174</span>
                </div>
                <Progress value={90} className="h-1.5 bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Brazil · São Paulo · São Paulo</span>
                  <span className="font-bold">134</span>
                </div>
                <Progress value={70} className="h-1.5 bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Brazil · Federal District · Brasília</span>
                  <span className="font-bold">44</span>
                </div>
                <Progress value={25} className="h-1.5 bg-muted" />
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="surface-card p-6">
            <h4 className="font-bold mb-4 flex items-center gap-2">
              <BarChart3 className="size-4 text-brand" /> Total de vendas por produto
            </h4>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              {[
                { name: "Kit Brinco, Anel Regulável e Bracelete...", price: "R$ 480,00" },
                { name: "Kit Clutch, Brinco e Anel Londres...", price: "R$ 358,51" },
                { name: "Kit de 3 Acessórios - Brinco, Anel...", price: "R$ 259,00" }
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] pb-2 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-2 truncate max-w-[180px]">
                    <div className="size-8 rounded bg-muted flex items-center justify-center shrink-0">
                      <ShoppingBag className="size-3 text-muted-foreground" />
                    </div>
                    <span className="truncate">{item.name}</span>
                  </div>
                  <span className="font-bold shrink-0">{item.price}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

