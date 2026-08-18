import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Map, RefreshCw, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-success-soft text-success">
            <Activity className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Live View</h1>
            <p className="text-sm text-muted-foreground">Monitoramento em tempo real das atividades na loja.</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <div className="surface-card p-6 border-l-4 border-success">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visitantes agora</p>
            <h3 className="text-4xl font-bold mt-2">12</h3>
            <p className="text-xs text-success mt-1 flex items-center gap-1">
              <span className="size-2 rounded-full bg-success animate-pulse"></span>
              Em tempo real
            </p>
          </div>
          <div className="surface-card p-6 border-l-4 border-brand">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessões (Última hora)</p>
            <h3 className="text-4xl font-bold mt-2">84</h3>
            <p className="text-xs text-muted-foreground mt-1">+12% vs hora anterior</p>
          </div>
          <div className="surface-card p-6 border-l-4 border-warning">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendas (Hoje)</p>
            <h3 className="text-4xl font-bold mt-2">R$ 1.240</h3>
            <p className="text-xs text-muted-foreground mt-1">5 pedidos confirmados</p>
          </div>
        </div>

        <div className="surface-card p-0 overflow-hidden relative min-h-[500px] flex flex-col items-center justify-center bg-muted/20">
          <Map className="size-24 text-muted-foreground/20 absolute" />
          <div className="z-10 text-center p-8">
            <h3 className="text-xl font-bold mb-2">Mapa Global de Atividade</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Esta visão consolida os acessos e vendas geolocalizadas em tempo real.
            </p>
            <Button className="gap-2 bg-brand hover:bg-brand/90 text-white">
              <RefreshCw className="size-4" /> Atualizar Mapa
            </Button>
          </div>
          
          <div className="absolute top-1/4 left-1/3 size-3 bg-success rounded-full animate-ping opacity-75"></div>
          <div className="absolute top-1/2 left-1/2 size-3 bg-brand rounded-full animate-ping opacity-75"></div>
          <div className="absolute bottom-1/3 right-1/4 size-3 bg-success rounded-full animate-ping opacity-75"></div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
           <div className="surface-card p-6">
              <h4 className="font-bold mb-4 flex items-center gap-2">
                <Activity className="size-4 text-success" /> Atividade Recente
              </h4>
              <ul className="space-y-4">
                <li className="flex items-center justify-between text-sm border-b border-border pb-2">
                  <span>Novo pedido de São Paulo, SP</span>
                  <span className="text-xs text-muted-foreground">há 2 min</span>
                </li>
                <li className="flex items-center justify-between text-sm border-b border-border pb-2">
                  <span>Carrinho abandonado em Curitiba, PR</span>
                  <span className="text-xs text-muted-foreground">há 5 min</span>
                </li>
                <li className="flex items-center justify-between text-sm border-b border-border pb-2">
                  <span>Novo checkout iniciado de Rio de Janeiro, RJ</span>
                  <span className="text-xs text-muted-foreground">há 12 min</span>
                </li>
              </ul>
           </div>
           
           <div className="surface-card p-6">
              <h4 className="font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="size-4 text-brand" /> Top Páginas Agora
              </h4>
              <ul className="space-y-3">
                <li className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[200px]">/products/kit-colar-e-brinco</span>
                  <Badge variant="secondary">4 ativos</Badge>
                </li>
                <li className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[200px]">/collections/compre-1-ganhe-1</span>
                  <Badge variant="secondary">3 ativos</Badge>
                </li>
                <li className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[200px]">/search?q=anel</span>
                  <Badge variant="secondary">2 ativos</Badge>
                </li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
}
