import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Eye, MessageCircle, Play, Plus, RefreshCw, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  approveCampaign,
  deleteAutomation,
  getAutomationRunMetrics,
  getCampaigns,
  getSegmentsList,
  listAutomations,
  rejectCampaign,
  runAutomationNow,
  toggleAutomation,
} from "@/lib/whatsapp-meta.functions";
import { brl } from "@/lib/crm-mock";
import { AutomationDialog, SEGMENT_LABEL, type AutomationSeed } from "@/components/crm/AutomationDialog";
import { WhatsappSendDialog, type SendDialogSeed } from "@/components/whatsapp/WhatsappSendDialog";
import { CampaignDetailDialog } from "@/components/whatsapp/CampaignDetailDialog";
import { TemplatesTab } from "@/components/whatsapp/TemplatesTab";
import { ConversationalFlowsTab } from "@/components/whatsapp/ConversationalFlowsTab";
import { ReportsTab } from "@/components/whatsapp/ReportsTab";

const VALID_TABS = ["campanhas", "aprovacoes", "automacoes", "fluxo-api", "templates", "relatorios"] as const;

export const Route = createFileRoute("/campanhas-whatsapp")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (VALID_TABS as readonly string[]).includes(search["tab"] as string) ? (search["tab"] as string) : "campanhas",
  }),
  head: () => ({
    meta: [
      { title: "Campanhas WhatsApp | CRM Insights" },
      { name: "description", content: "Envie, aprove e automatize campanhas de WhatsApp pela API oficial da Meta com métricas reais da Shopify." },
      { property: "og:title", content: "Campanhas WhatsApp | CRM Insights" },
      { property: "og:description", content: "Envio, aprovação e automações de WhatsApp integrados ao CRM da sua loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampanhasWhatsapp,
});

const STATUS_LABEL: Record<string, string> = {
  aguardando_aprovacao: "Aguardando aprovação",
  rejeitada: "Rejeitada",
  enviando: "Enviando",
  agendada: "Agendada",
  finalizada: "Finalizada",
  erro: "Erro",
};

const STATUS_CLASS: Record<string, string> = {
  aguardando_aprovacao: "bg-warning-soft text-warning",
  rejeitada: "bg-critical-soft text-critical",
  enviando: "bg-warning-soft text-warning",
  agendada: "bg-brand-soft text-brand",
  finalizada: "bg-success-soft text-success",
  erro: "bg-critical-soft text-critical",
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
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/campanhas-whatsapp", search: { tab: value } });
  const runApprove = useServerFn(approveCampaign);
  const runReject = useServerFn(rejectCampaign);
  const runToggle = useServerFn(toggleAutomation);
  const runDelete = useServerFn(deleteAutomation);
  const runNow = useServerFn(runAutomationNow);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [autoSeed, setAutoSeed] = useState<AutomationSeed | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [sendSeed, setSendSeed] = useState<SendDialogSeed | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("todas");
  const [search, setSearch] = useState("");

  const { data: campanhas, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: () => getCampaigns(),
  });

  const { data: automations, refetch: refetchAutomations } = useQuery({
    queryKey: ["whatsapp-automations"],
    queryFn: () => listAutomations(),
  });

  const { data: crmSegments } = useQuery({
    queryKey: ["crm-segments"],
    queryFn: () => getSegmentsList(),
  });

  const { data: automationMetrics } = useQuery({
    queryKey: ["whatsapp-automation-run-metrics"],
    queryFn: () => getAutomationRunMetrics(),
    refetchInterval: 30_000,
  });

  const list = campanhas ?? [];
  const pendentes = list.filter((c) => c.status === "aguardando_aprovacao");

  const STATUS_FILTERS = [
    { value: "todas", label: "Todas" },
    { value: "enviando", label: "Enviando" },
    { value: "agendada", label: "Agendadas" },
    { value: "finalizada", label: "Finalizadas" },
    { value: "erro", label: "Erro" },
  ];

  const filteredList = useMemo(() => {
    return list.filter((c) => {
      if (statusFilter !== "todas" && c.status !== statusFilter) return false;
      if (search.trim() && !c.nome.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [list, statusFilter, search]);
  const totalEnviadas = list.reduce((a, c) => a + c.enviadas, 0);
  const totalReceita = list.reduce((a, c) => a + c.receita, 0);
  const totalCusto = list.reduce((a, c) => a + c.custo, 0);
  const roas = totalCusto > 0 ? totalReceita / totalCusto : null;

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await runApprove({ data: { campaignId: id } });
      if (!res.success) toast.error(res.error);
      else toast.success(`Aprovada e enviada: ${res.sent}/${res.total} mensagens.`);
      refetch();
    } catch (err: any) {
      toast.error("Erro ao aprovar: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt("Motivo da rejeição (opcional):", "") ?? undefined;
    setBusyId(id);
    try {
      const res = await runReject({ data: { campaignId: id, reason } });
      if (!res.success) toast.error(res.error);
      else toast.success("Campanha rejeitada.");
      refetch();
    } finally {
      setBusyId(null);
    }
  };

  const handleRunAutomation = async (id: string) => {
    setBusyId(id);
    try {
      const res = await runNow({ data: { id } });
      if (res.runsProcessed === 0) toast.success("Nenhum cliente novo pra matricular ou etapa vencida agora.");
      else toast.success(`${res.runsProcessed} cliente(s) processado(s) nesta execução.`);
      refetch();
      refetchAutomations();
    } catch (err: any) {
      toast.error("Erro ao executar automação: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setBusyId(null);
    }
  };

  const segmentsList = (crmSegments ?? []).map(s => ({ id: s.id, nome: s.nome }));

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
              <p className="text-sm text-muted-foreground">Envio, aprovação, automações e relatórios da API oficial.</p>
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
              onClick={() => {
                setSendSeed({ nome: "Campanha manual", segmentType: "sem_recompra", oferta: "" });
                setSendOpen(true);
              }}
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

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList>
            <TabsTrigger value="conversas">Conversas</TabsTrigger>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="aprovacoes">Aprovações {pendentes.length > 0 && `(${pendentes.length})`}</TabsTrigger>
            <TabsTrigger value="automacoes">Automações</TabsTrigger>
            <TabsTrigger value="fluxo-api">Fluxo API</TabsTrigger>
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
                  {!isLoading && filteredList.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                        {list.length === 0
                          ? 'Nenhuma campanha ainda. Use "Aplicar ação" no dashboard pra criar a primeira.'
                          : "Nenhuma campanha bate com o filtro."}
                      </td>
                    </tr>
                  )}
                  {filteredList.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {SEGMENT_LABEL[c.segmentType] ?? c.segmentType} ·{" "}
                          {c.messageType === "utility" ? "Utilidade" : "Marketing"} · {c.origem}
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

          <TabsContent value="aprovacoes">
            <div className="mt-4 space-y-3">
              {pendentes.length === 0 && (
                <p className="rounded-xl border border-border px-4 py-8 text-center text-muted-foreground">
                  Nenhuma campanha aguardando aprovação.
                </p>
              )}
              {pendentes.map((c) => (
                <article key={c.id} className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-semibold">{c.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {SEGMENT_LABEL[c.segmentType] ?? c.segmentType} · template {c.templateName} ·{" "}
                      {c.totalDestinatarios} destinatários
                    </p>
                    {c.bodyParams.length > 0 && (
                      <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">“{c.bodyParams.join(" | ")}”</p>
                    )}
                    {c.couponCode && <p className="mt-1 text-xs text-muted-foreground">Cupom: {c.couponCode}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={busyId === c.id} onClick={() => handleReject(c.id)}>
                      Rejeitar
                    </Button>
                    <Button disabled={busyId === c.id} onClick={() => handleApprove(c.id)}>
                      {busyId === c.id ? "Enviando..." : "Aprovar e enviar"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="automacoes">
            <div className="mt-4 flex justify-end">
              <Button
                className="gap-2"
                onClick={() => {
                  setAutoSeed({ nome: "Nova automação" });
                  setAutoOpen(true);
                }}
              >
                <Plus className="size-4" /> Nova automação
              </Button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {(automations ?? []).length === 0 && (
                <p className="rounded-xl border border-border px-4 py-8 text-center text-muted-foreground lg:col-span-2">
                  Nenhuma automação ainda. Crie aqui ou instale uma direto das ações sugeridas do CRM.
                </p>
              )}
              {(automations ?? []).map((a) => (
                <article key={a.id} className="surface-card space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{a.nome}</p>
                      <p className="text-sm text-muted-foreground">{a.descricao ?? "—"}</p>
                    </div>
                    <Switch
                      checked={a.ativo}
                      onCheckedChange={async (v) => {
                        await runToggle({ data: { id: a.id, ativo: v } });
                        refetchAutomations();
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">
                      {a.segmentId
                        ? (crmSegments ?? []).find((s) => s.id === a.segmentId)?.nome ?? "Segmento customizado"
                        : SEGMENT_LABEL[a.segmentType] ?? a.segmentType}
                    </Badge>
                    <Badge variant="outline">
                      {a.steps.length} etapa{a.steps.length !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="outline">{a.requerAprovacao ? "Com aprovação" : "Envio direto"}</Badge>
                  </div>
                  {(() => {
                    const metrics = automationMetrics?.[a.id];
                    if (!metrics || metrics.total === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {metrics.byStatus["pending_approval"] ? (
                          <Badge className="bg-warning-soft text-warning">
                            Aguardando aprovação: {metrics.byStatus["pending_approval"]}
                          </Badge>
                        ) : null}
                        {metrics.byStatus["active"] ? (
                          <Badge className="bg-brand-soft text-brand">Em andamento: {metrics.byStatus["active"]}</Badge>
                        ) : null}
                        {metrics.byStatus["completed"] ? (
                          <Badge className="bg-success-soft text-success">Concluídos: {metrics.byStatus["completed"]}</Badge>
                        ) : null}
                        {metrics.byStatus["failed"] ? (
                          <Badge className="bg-critical-soft text-critical">Falhas: {metrics.byStatus["failed"]}</Badge>
                        ) : null}
                      </div>
                    );
                  })()}
                  <p className="text-xs text-muted-foreground">
                    {a.totalExecucoes} execuções ·{" "}
                    {a.lastRunAt ? `última em ${new Date(a.lastRunAt).toLocaleString("pt-BR")}` : "nunca executada"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busyId === a.id} className="gap-1" onClick={() => handleRunAutomation(a.id)}>
                      <Play className="size-3.5" /> Executar agora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAutoSeed({
                          id: a.id,
                          nome: a.nome,
                          descricao: a.descricao ?? "",
                          segmentType: a.segmentType as AutomationSeed["segmentType"],
                          segmentId: a.segmentId ?? undefined,
                          steps: a.steps,
                          requerAprovacao: a.requerAprovacao,
                          ativo: a.ativo,
                        });
                        setAutoOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-critical"
                      onClick={async () => {
                        if (!window.confirm(`Excluir a automação "${a.nome}"?`)) return;
                        await runDelete({ data: { id: a.id } });
                        refetchAutomations();
                      }}
                    >
                      <Trash2 className="size-3.5" /> Excluir
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="fluxo-api">
            <ConversationalFlowsTab />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>

          <TabsContent value="relatorios">
            <ReportsTab />
          </TabsContent>
        </Tabs>
      </div>

      <AutomationDialog seed={autoSeed} open={autoOpen} onOpenChange={setAutoOpen} onSaved={() => refetchAutomations()} />
      <WhatsappSendDialog seed={sendSeed} open={sendOpen} onOpenChange={setSendOpen} segments={segmentsList} onDone={() => refetch()} />
      <CampaignDetailDialog campaignId={detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </div>
  );
}
