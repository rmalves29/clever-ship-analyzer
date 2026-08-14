import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, MessageCircle, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCampaigns, listMetaTemplates } from "@/lib/whatsapp-meta.functions";
import { brl } from "@/lib/crm-mock";

export const Route = createFileRoute("/campanhas-whatsapp")({
  component: CampanhasWhatsapp,
});

const STATUS_LABEL: Record<string, string> = {
  enviando: "Enviando",
  finalizada: "Finalizada",
  erro: "Erro",
};

const STATUS_CLASS: Record<string, string> = {
  enviando: "bg-warning-soft text-warning",
  finalizada: "bg-success-soft text-success",
  erro: "bg-critical-soft text-critical",
};

const SEGMENT_LABEL: Record<string, string> = {
  ticket_alto: "Ticket alto",
  sem_recompra: "Sem recompra",
  recompra_30d: "Recompra 30d",
  recompra_60d: "Recompra 60d",
  envio_atrasado: "Envio atrasado",
};

function StatCard({ label, value, hint, dark }: { label: string; value: string; hint: string; dark?: boolean }) {
  return (
    <div className={dark ? "surface-card p-5 bg-foreground text-background" : "surface-card p-5"}>
      <p className={dark ? "text-xs text-background/70" : "text-xs text-muted-foreground"}>{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      <p className={dark ? "mt-1 text-xs text-background/70" : "mt-1 text-xs text-muted-foreground"}>{hint}</p>
    </div>
  );
}

function CampanhasWhatsapp() {
  const navigate = useNavigate();

  const { data: campanhas, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: () => getCampaigns(),
  });

  const { data: templatesResult, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => listMetaTemplates(),
  });

  const list = campanhas ?? [];
  const totalEnviadas = list.reduce((a, c) => a + c.enviadas, 0);
  const totalReceita = list.reduce((a, c) => a + c.receita, 0);
  const totalCusto = list.reduce((a, c) => a + c.custo, 0);
  const roas = totalCusto > 0 ? totalReceita / totalCusto : null;

  const bySegment = Object.entries(
    list.reduce<Record<string, { campanhas: number; enviadas: number; vendas: number; receita: number; custo: number }>>(
      (acc, c) => {
        const agg = acc[c.segmentType] ?? { campanhas: 0, enviadas: 0, vendas: 0, receita: 0, custo: 0 };
        agg.campanhas += 1;
        agg.enviadas += c.enviadas;
        agg.vendas += c.vendas;
        agg.receita += c.receita;
        agg.custo += c.custo;
        acc[c.segmentType] = agg;
        return acc;
      },
      {},
    ),
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/" })}>
              <ChevronLeft className="size-5" />
            </Button>
            <span className="gradient-brand flex size-11 items-center justify-center rounded-2xl text-primary-foreground">
              <MessageCircle className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Campanhas WhatsApp</h1>
              <p className="text-sm text-muted-foreground">Gerencie campanhas, templates e relatórios do canal.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="size-3.5" /> Atualizar
            </Button>
            <Button variant="outline" size="icon" asChild className="size-9 rounded-full">
              <Link to="/configuracoes">
                <Settings className="size-4" />
              </Link>
            </Button>
            <Button
              onClick={() =>
                toast.info('Crie campanhas a partir de "Aplicar ação", na seção Ações Sugeridas do dashboard.')
              }
            >
              Nova campanha
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Envios" value={String(totalEnviadas)} hint="Mensagens enviadas no total" />
          <StatCard label="Receita" value={brl(totalReceita)} hint="Valor de pedidos atribuídos" />
          <StatCard label="Custo estimado" value={brl(totalCusto)} hint="Enviadas × custo configurado por tipo" />
          <StatCard label="ROAS estimado" value={roas !== null ? `${roas.toFixed(1)}x` : "—"} hint="Receita ÷ custo" dark />
        </div>

        <Tabs defaultValue="campanhas" className="mt-8">
          <TabsList>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          </TabsList>

          <TabsContent value="campanhas">
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Campanha</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Enviadas</th>
                    <th className="px-4 py-3 font-medium">Entregues</th>
                    <th className="px-4 py-3 font-medium">Lidas</th>
                    <th className="px-4 py-3 font-medium">Vendas</th>
                    <th className="px-4 py-3 font-medium">Receita</th>
                    <th className="px-4 py-3 font-medium">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        Carregando...
                      </td>
                    </tr>
                  )}
                  {!isLoading && list.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhuma campanha ainda. Use "Aplicar ação" no dashboard pra criar a primeira.
                      </td>
                    </tr>
                  )}
                  {list.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {SEGMENT_LABEL[c.segmentType] ?? c.segmentType} · {c.messageType === "utility" ? "Utilidade" : "Marketing"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_CLASS[c.status] ?? ""} variant="outline">
                          {STATUS_LABEL[c.status] ?? c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{c.enviadas}</td>
                      <td className="px-4 py-3">{c.entregues}</td>
                      <td className="px-4 py-3">{c.lidas}</td>
                      <td className="px-4 py-3">{c.vendas}</td>
                      <td className="px-4 py-3 font-semibold">{brl(c.receita)}</td>
                      <td className="px-4 py-3">{brl(c.custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="templates">
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 font-medium">Idioma</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingTemplates && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        Carregando...
                      </td>
                    </tr>
                  )}
                  {!isLoadingTemplates && templatesResult && !templatesResult.success && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        {templatesResult.error}
                      </td>
                    </tr>
                  )}
                  {!isLoadingTemplates && templatesResult?.success && templatesResult.templates.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhum template encontrado nesse WABA.
                      </td>
                    </tr>
                  )}
                  {templatesResult?.success &&
                    templatesResult.templates.map((t: { name: string; category: string; language: string; status: string }) => (
                      <tr key={`${t.name}-${t.language}`} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{t.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.category}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.language}</td>
                        <td className="px-4 py-3">{t.status}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="relatorios">
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Segmento</th>
                    <th className="px-4 py-3 font-medium">Campanhas</th>
                    <th className="px-4 py-3 font-medium">Envios</th>
                    <th className="px-4 py-3 font-medium">Vendas</th>
                    <th className="px-4 py-3 font-medium">Receita</th>
                    <th className="px-4 py-3 font-medium">Custo</th>
                    <th className="px-4 py-3 font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {bySegment.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        Sem dados ainda.
                      </td>
                    </tr>
                  )}
                  {bySegment.map(([segment, agg]) => (
                    <tr key={segment} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{SEGMENT_LABEL[segment] ?? segment}</td>
                      <td className="px-4 py-3">{agg.campanhas}</td>
                      <td className="px-4 py-3">{agg.enviadas}</td>
                      <td className="px-4 py-3">{agg.vendas}</td>
                      <td className="px-4 py-3 font-semibold">{brl(agg.receita)}</td>
                      <td className="px-4 py-3">{brl(agg.custo)}</td>
                      <td className="px-4 py-3">{agg.custo > 0 ? `${(agg.receita / agg.custo).toFixed(1)}x` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
