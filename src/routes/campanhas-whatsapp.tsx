import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCampaigns } from "@/lib/whatsapp-meta.functions";
import { brl } from "@/lib/crm-mock";
import { CampaignWizard } from "@/components/whatsapp/CampaignWizard";
import { CampaignDetailDialog } from "@/components/whatsapp/CampaignDetailDialog";
import { TemplatesTab } from "@/components/whatsapp/TemplatesTab";
import { ReportsTab } from "@/components/whatsapp/ReportsTab";

export const Route = createFileRoute("/campanhas-whatsapp")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search["tab"] === "templates" || search["tab"] === "relatorios" ? (search["tab"] as string) : "campanhas",
  }),
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

const STATUS_FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "enviando", label: "Enviando" },
  { value: "finalizada", label: "Finalizadas" },
  { value: "erro", label: "Erro" },
];

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
  const { tab } = Route.useSearch();
  const [statusFilter, setStatusFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: campanhas, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: () => getCampaigns(),
  });

  const allList = campanhas ?? [];
  const totalEnviadas = allList.reduce((a, c) => a + c.enviadas, 0);
  const totalReceita = allList.reduce((a, c) => a + c.receita, 0);
  const totalCusto = allList.reduce((a, c) => a + c.custo, 0);
  const roas = totalCusto > 0 ? totalReceita / totalCusto : null;

  const list = useMemo(() => {
    return allList.filter((c) => {
      if (statusFilter !== "todas" && c.status !== statusFilter) return false;
      if (search.trim() && !c.nome.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [allList, statusFilter, search]);

  const setTab = (value: string) => navigate({ to: "/campanhas-whatsapp", search: { tab: value } });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
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
            <Button onClick={() => setWizardOpen(true)}>Nova campanha</Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Envios" value={String(totalEnviadas)} hint="Mensagens enviadas no total" />
          <StatCard label="Receita" value={brl(totalReceita)} hint="Pedido em até 3 dias do envio" />
          <StatCard label="Custo estimado" value={brl(totalCusto)} hint="Enviadas × custo configurado por tipo" />
          <StatCard label="ROAS estimado" value={roas !== null ? `${roas.toFixed(1)}x` : "—"} hint="Receita ÷ custo" dark />
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          </TabsList>

          <TabsContent value="campanhas">
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      statusFilter === f.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <Input placeholder="Buscar campanha..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            </div>

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
                    <th className="px-4 py-3 text-right font-medium">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                        Carregando...
                      </td>
                    </tr>
                  )}
                  {!isLoading && list.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                        {allList.length === 0 ? 'Nenhuma campanha ainda. Clique em "Nova campanha" pra criar a primeira.' : "Nenhuma campanha bate com o filtro."}
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
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => setDetailId(c.id)}>
                          <Eye className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>

          <TabsContent value="relatorios">
            <ReportsTab />
          </TabsContent>
        </Tabs>
      </div>

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} onCreated={() => refetch()} />
      <CampaignDetailDialog campaignId={detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </div>
  );
}
