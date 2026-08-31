import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Info, Save, Sparkles, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { WhatsappSendDialog, type SendDialogSeed } from "@/components/whatsapp/WhatsappSendDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createRepurchaseCampaignDraft,
  getRepurchaseCustomers,
  getRepurchaseDashboard,
  saveRepurchaseSettings,
  suggestRepurchaseCampaign,
} from "@/lib/crm-repurchase.functions";
import {
  REPURCHASE_TARGET_WINDOWS,
  REPURCHASE_WINDOWS,
  type RepurchaseTargetWindowDays,
  type RepurchaseWindow,
} from "@/lib/crm-repurchase-shared";

export const Route = createFileRoute("/crm/reguas/primeira-segunda")({
  head: () => ({
    meta: [
      { title: "1ª compra → 2ª compra | CRM" },
      { name: "description", content: "Régua inteligente para aumentar a segunda compra e a recorrência." },
    ],
  }),
  component: RepurchasePage,
});

const PAGE_SIZE = 50;
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;

type StageFilter = RepurchaseWindow | "Convertido";
type PeriodPreset = "all" | "7" | "15" | "30" | "60" | "90" | "custom";

const PERIODS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "all", label: "Todo histórico" },
  { value: "7", label: "7 dias" },
  { value: "15", label: "15 dias" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
];

const SOURCE_LABELS: Record<string, string> = {
  web: "Site",
  pos: "Venda manual/POS",
  shopify_draft_order: "Pedido rascunho",
  "Não informado": "Não informado",
};

function MetricCard({ label, value, hint, explanation }: { label: string; value: string | number; hint: string; explanation: string }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`Como é calculado: ${label}`} className="text-muted-foreground hover:text-foreground">
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{explanation}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function RepurchasePage() {
  const queryClient = useQueryClient();
  const fetchDashboard = useServerFn(getRepurchaseDashboard);
  const fetchCustomers = useServerFn(getRepurchaseCustomers);
  const runSuggestion = useServerFn(suggestRepurchaseCampaign);
  const runCampaignDraft = useServerFn(createRepurchaseCampaignDraft);
  const runSaveSettings = useServerFn(saveRepurchaseSettings);

  const [stage, setStage] = useState<StageFilter | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [targetPercent, setTargetPercent] = useState("10");
  const [targetWindow, setTargetWindow] = useState<RepurchaseTargetWindowDays>(30);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSeed, setSendSeed] = useState<SendDialogSeed | null>(null);
  const [preparedSegment, setPreparedSegment] = useState<{ id: string; nome: string } | null>(null);
  const [suggestion, setSuggestion] = useState<{
    approach: string;
    message: string;
    incentive: string;
    cta: string;
    offer: string;
    rationale: string;
  } | null>(null);

  const selectedRange = useMemo(() => {
    if (period === "all") return {};
    if (period === "custom") return { from: customFrom || undefined, to: customTo || undefined };
    const days = Number(period);
    return { from: format(subDays(new Date(), days - 1), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") };
  }, [customFrom, customTo, period]);

  useEffect(() => setPage(0), [stage, search, selectedRange.from, selectedRange.to]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["repurchase-dashboard", selectedRange.from ?? "all", selectedRange.to ?? "all"],
    queryFn: () => fetchDashboard({ data: selectedRange }),
  });

  useEffect(() => {
    if (!data?.settings) return;
    setTargetPercent(String(Number((data.settings.targetConversionRate * 100).toFixed(2))));
    setTargetWindow(data.settings.targetWindowDays);
  }, [data?.settings]);

  const { data: customerResult, isLoading: customersLoading } = useQuery({
    queryKey: ["repurchase-customers", stage ?? "all", search, page, selectedRange.from ?? "all", selectedRange.to ?? "all"],
    queryFn: () => {
      const base = { search, limit: PAGE_SIZE, offset: page * PAGE_SIZE, ...selectedRange };
      return stage ? fetchCustomers({ data: { ...base, stage } }) : fetchCustomers({ data: base });
    },
  });

  const aiMutation = useMutation({
    mutationFn: async (selectedStage: RepurchaseWindow) => runSuggestion({ data: { stage: selectedStage } }),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSuggestion(result.suggestion);
      toast.success("Sugestão de campanha criada para revisão.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const campaignMutation = useMutation({
    mutationFn: async (selectedStage: RepurchaseWindow) => runCampaignDraft({ data: { stage: selectedStage } }),
    onSuccess: (draft) => {
      setPreparedSegment(draft.segment);
      setSendSeed({ nome: draft.name, segmentType: "custom", segmentId: draft.segment.id, oferta: suggestion?.offer ?? "" });
      setSendOpen(true);
      toast.success("Segmento dinâmico preparado. Agora configure e revise a campanha.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const rate = Number(targetPercent.replace(",", ".")) / 100;
      if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new Error("Informe uma meta entre 0,1% e 100%.");
      return runSaveSettings({ data: { targetConversionRate: rate, targetWindowDays: targetWindow } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repurchase-dashboard"] });
      toast.success("Meta de recompra atualizada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando régua de recompra…</div>;
  if (error || !data) return <div className="p-8 text-destructive">Não foi possível carregar a régua de recompra.</div>;

  const summary = data.summary;
  const customers = customerResult?.customers ?? [];
  const totalCustomers = customerResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));
  const actionableStage = stage && stage !== "Convertido" ? stage : null;
  const targetProgress = summary.targetConversionRate > 0 ? Math.min(100, (summary.matureConversionRate / summary.targetConversionRate) * 100) : 0;
  const coverageFrom = data.dataCoverage.from ? new Date(data.dataCoverage.from).toLocaleDateString("pt-BR") : "—";
  const coverageTo = data.dataCoverage.to ? new Date(data.dataCoverage.to).toLocaleDateString("pt-BR") : "—";

  const selectStage = (value: StageFilter) => {
    setStage(value);
    setSuggestion(null);
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">CRM → Réguas</p>
          <h1 className="text-2xl font-bold">1ª compra → 2ª compra</h1>
          <p className="text-sm text-muted-foreground">Acompanhe clientes desde a primeira compra e meça a segunda compra com uma janela justa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!actionableStage || aiMutation.isPending} onClick={() => actionableStage && aiMutation.mutate(actionableStage)}>
            <Sparkles className="mr-2 size-4" />{aiMutation.isPending ? "Gerando…" : "Sugerir campanha com IA"}
          </Button>
          <Button disabled={!actionableStage || campaignMutation.isPending} onClick={() => actionableStage && campaignMutation.mutate(actionableStage)}>
            <Target className="mr-2 size-4" />{campaignMutation.isPending ? "Preparando…" : "Criar campanha"}
          </Button>
        </div>
      </div>

      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="font-semibold">Período da primeira compra</h2><p className="text-xs text-muted-foreground">O filtro define quais coortes e clientes entram nos cards abaixo.</p></div>
          <Badge variant="outline">Dados disponíveis: {coverageFrom} até {coverageTo} · {data.dataCoverage.historyDays} dias</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((item) => <Button key={item.value} size="sm" variant={period === item.value ? "default" : "outline"} onClick={() => setPeriod(item.value)}>{item.label}</Button>)}
        </div>
        {period === "custom" && <div className="flex flex-wrap gap-3"><div><Label>De</Label><Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></div><div><Label>Até</Label><Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></div></div>}
        {data.dataCoverage.historyDays < targetWindow && <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">O histórico ainda tem {data.dataCoverage.historyDays} dias. A métrica de {targetWindow} dias ficará completa quando houver clientes com essa janela inteira de observação.</p>}
      </section>

      {!actionableStage && <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">Selecione uma etapa pendente na jornada. “Criar campanha” abrirá o assistente oficial para escolher template, revisar o público e decidir entre aprovação, envio ou agendamento.</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Aguardando 2ª compra" value={summary.pending} hint="Exatamente 1 pedido válido" explanation="Clientes do período selecionado que possuem exatamente uma compra paga e não cancelada." />
        <MetricCard label="Converteram" value={summary.converted} hint="Já fizeram a 2ª compra" explanation="Clientes do período que possuem pelo menos duas compras válidas. A terceira compra e seguintes não aumentam esta contagem." />
        <MetricCard label="Taxa geral" value={pct(summary.conversionRate)} hint={`${summary.converted} de ${summary.buyers} clientes`} explanation="Clientes que já fizeram a segunda compra divididos por toda a base, inclusive clientes recém-chegados que ainda não tiveram tempo para recomprar." />
        <MetricCard label={`Taxa madura em ${summary.targetWindowDays}d`} value={summary.matureEligible ? pct(summary.matureConversionRate) : "Aguardando"} hint={`${summary.matureConverted} de ${summary.matureEligible} elegíveis`} explanation={`Considera somente clientes que já tiveram ${summary.targetWindowDays} dias completos desde a primeira compra. Conta como conversão apenas a segunda compra feita dentro dessa janela.`} />
        <MetricCard label="Base da jornada" value={summary.buyers} hint="Clientes com compra válida" explanation="Total de clientes com pelo menos um pedido PAID ou PARTIALLY_PAID, sem cancelamento, dentro do período de primeira compra selecionado." />
        <MetricCard label="Receita da 1ª compra" value={brl(summary.firstRevenue)} hint={`Ticket médio ${brl(summary.firstAverageTicket)}`} explanation="Soma somente o valor da primeira compra válida de cada cliente da base." />
        <MetricCard label="Receita da 2ª compra" value={brl(summary.secondRevenue)} hint={`Ticket médio ${brl(summary.secondAverageTicket)}`} explanation="Soma somente a segunda compra válida. Terceira compra e posteriores não entram neste card." />
        <MetricCard label="Tempo até 2ª compra" value={`${summary.averageDaysToSecondOrder.toFixed(1)} dias`} hint="Média de quem converteu" explanation="Quantidade média de dias entre a primeira e a segunda compra válida dos clientes que já converteram." />
        <MetricCard label="Espera dos pendentes" value={`${summary.averageDaysSinceFirstOrderPending.toFixed(1)} dias`} hint="Média sem segunda compra" explanation="Dias médios desde a primeira compra dos clientes que ainda não realizaram a segunda." />
        <MetricCard label="Faltam para a meta" value={summary.matureEligible ? summary.customersMissingToTarget : "—"} hint={`Meta ${pct(summary.targetConversionRate)} em ${summary.targetWindowDays} dias`} explanation="Quantidade adicional de clientes elegíveis que precisariam recomprar dentro da janela para atingir a meta atual." />
      </div>

      <section className="surface-card p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><h2 className="font-semibold">Meta operacional de segunda compra</h2><p className="mt-1 text-xs text-muted-foreground">Taxa madura atual {summary.matureEligible ? pct(summary.matureConversionRate) : "sem coorte madura"} · meta {pct(summary.targetConversionRate)} em até {summary.targetWindowDays} dias.</p><div className="mt-3"><Progress value={targetProgress} /></div><p className="mt-1 text-xs text-muted-foreground">{summary.matureEligible ? `${targetProgress.toFixed(0)}% da meta` : "Aguardando clientes completarem a janela"}</p></div>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>Meta (%)</Label><Input className="w-28" inputMode="decimal" value={targetPercent} onChange={(event) => setTargetPercent(event.target.value)} /></div>
            <div><Label>Janela</Label><Select value={String(targetWindow)} onValueChange={(value) => setTargetWindow(Number(value) as RepurchaseTargetWindowDays)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{REPURCHASE_TARGET_WINDOWS.map((days) => <SelectItem key={days} value={String(days)}>{days} dias</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}><Save className="mr-2 size-4" />Salvar meta</Button>
          </div>
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="mb-4 flex items-center gap-2"><Users className="size-4" /><h2 className="font-semibold">Jornada dos clientes ainda pendentes</h2></div>
        <div className="grid gap-2 lg:grid-cols-7">
          {REPURCHASE_WINDOWS.map((name) => <button key={name} onClick={() => selectStage(name)} className={`rounded-xl border p-4 text-left transition hover:bg-muted/40 ${stage === name ? "ring-2 ring-primary" : ""}`}><p className="text-xs text-muted-foreground">{name}</p><p className="mt-1 text-2xl font-bold">{summary.windows[name]}</p><p className="text-[11px] text-muted-foreground">Sem 2ª compra</p></button>)}
          <button onClick={() => selectStage("Convertido")} className={`rounded-xl border p-4 text-left transition hover:bg-muted/40 ${stage === "Convertido" ? "ring-2 ring-primary" : ""}`}><p className="text-xs text-muted-foreground">2ª compra</p><p className="mt-1 text-2xl font-bold">{summary.converted}</p><p className="text-xs text-muted-foreground">Convertido</p></button>
        </div>
      </section>

      {suggestion && <section className="surface-card p-5"><div className="mb-3 flex items-center gap-2"><Sparkles className="size-4" /><h2 className="font-semibold">Sugestão da IA — revisão humana</h2></div><div className="grid gap-4 text-sm lg:grid-cols-2"><div className="space-y-3"><p><strong>Abordagem:</strong> {suggestion.approach}</p><div className="rounded-lg border bg-muted/20 p-3"><p className="whitespace-pre-wrap">{suggestion.message}</p></div></div><div className="space-y-2"><p><strong>Incentivo sugerido:</strong> {suggestion.incentive}</p><p><strong>Oferta sugerida:</strong> {suggestion.offer}</p><p><strong>CTA:</strong> {suggestion.cta}</p><p className="text-muted-foreground"><strong>Por quê:</strong> {suggestion.rationale}</p></div></div></section>}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card p-5"><h2 className="font-semibold">Produtos da 1ª compra com mais conversões</h2><p className="mb-3 text-xs text-muted-foreground">Correlação por produto da primeira compra; não representa causalidade.</p><Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Clientes</TableHead><TableHead>2ª compra</TableHead><TableHead>Taxa</TableHead></TableRow></TableHeader><TableBody>{data.products.length ? data.products.map((row) => <TableRow key={row.name}><TableCell className="max-w-72"><span className="line-clamp-2">{row.name}</span></TableCell><TableCell>{row.customers}</TableCell><TableCell>{row.converted}</TableCell><TableCell>{pct(row.conversionRate)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>}</TableBody></Table></div>
        <div className="surface-card p-5"><h2 className="font-semibold">Recompra por origem da 1ª compra</h2><p className="mb-3 text-xs text-muted-foreground">Compara a origem registrada pela Shopify.</p><Table><TableHeader><TableRow><TableHead>Origem</TableHead><TableHead>Clientes</TableHead><TableHead>2ª compra</TableHead><TableHead>Taxa</TableHead><TableHead>Receita 2ª</TableHead></TableRow></TableHeader><TableBody>{data.sources.length ? data.sources.map((row) => <TableRow key={row.source}><TableCell>{SOURCE_LABELS[row.source] ?? row.source}</TableCell><TableCell>{row.customers}</TableCell><TableCell>{row.converted}</TableCell><TableCell>{pct(row.conversionRate)}</TableCell><TableCell>{brl(row.secondRevenue)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>}</TableBody></Table></div>
      </section>

      <section className="surface-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Clientes {stage ? `— ${stage}` : "— toda a jornada"}</h2><p className="text-xs text-muted-foreground">{totalCustomers} cliente(s) no período e filtro atuais.</p></div><div className="flex flex-wrap gap-2"><Input className="w-72" placeholder="Buscar cliente ou produto…" value={search} onChange={(event) => setSearch(event.target.value)} />{stage && <Button variant="outline" onClick={() => setStage(undefined)}>Limpar etapa</Button>}</div></div>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>1ª compra</TableHead><TableHead>Dias</TableHead><TableHead>Valor</TableHead><TableHead>Produtos</TableHead><TableHead>Local</TableHead><TableHead>Canal</TableHead><TableHead>Estágio</TableHead><TableHead>2ª compra</TableHead></TableRow></TableHeader><TableBody>{customersLoading ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Carregando clientes…</TableCell></TableRow> : customers.length === 0 ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow> : customers.map((customer) => <TableRow key={customer.customerId}><TableCell className="font-medium">{customer.name}</TableCell><TableCell>{new Date(customer.firstOrderAt).toLocaleDateString("pt-BR")}</TableCell><TableCell>{customer.daysSinceFirstOrder}</TableCell><TableCell>{brl(customer.firstOrderRevenue)}</TableCell><TableCell className="max-w-80"><span className="line-clamp-2 text-xs">{customer.products.join(", ") || "—"}</span></TableCell><TableCell>{[customer.city, customer.province].filter(Boolean).join("/") || "—"}</TableCell><TableCell>{SOURCE_LABELS[customer.sourceName ?? ""] ?? customer.sourceName ?? "—"}</TableCell><TableCell>{customer.stage}</TableCell><TableCell>{customer.secondOrderAt ? <span className="inline-flex items-center gap-1 whitespace-nowrap">{new Date(customer.secondOrderAt).toLocaleDateString("pt-BR")}<ArrowRight className="size-3" />{brl(customer.secondOrderRevenue ?? 0)}</span> : "—"}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="mt-4 flex items-center justify-between gap-4"><p className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft className="mr-1 size-4" />Anterior</Button><Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>Próxima<ChevronRight className="ml-1 size-4" /></Button></div></div>
      </section>

      <section className="surface-card p-5">
        <h2 className="mb-1 font-semibold">Coortes de primeira compra</h2><p className="mb-4 text-xs text-muted-foreground">“Taxa madura” usa apenas clientes que já completaram a janela de {summary.targetWindowDays} dias, evitando penalizar meses recentes.</p>
        <Table><TableHeader><TableRow><TableHead>Mês</TableHead><TableHead>Clientes</TableHead><TableHead>Elegíveis maduros</TableHead><TableHead>Converteram na janela</TableHead><TableHead>Taxa madura</TableHead><TableHead>Situação</TableHead><TableHead>Tempo médio</TableHead></TableRow></TableHeader><TableBody>{data.cohorts.map((cohort) => <TableRow key={cohort.month}><TableCell>{cohort.month}</TableCell><TableCell>{cohort.customers}</TableCell><TableCell>{cohort.matureCustomers}</TableCell><TableCell>{cohort.matureConverted}</TableCell><TableCell>{pct(cohort.matureConversionRate)}</TableCell><TableCell><Badge variant="outline">{cohort.maturityStatus === "completa" ? "Completa" : cohort.maturityStatus === "parcial" ? "Parcial" : "Aguardando"}</Badge></TableCell><TableCell>{cohort.averageDaysToSecondOrder.toFixed(1)} dias</TableCell></TableRow>)}</TableBody></Table>
      </section>

      <WhatsappSendDialog seed={sendSeed} open={sendOpen} onOpenChange={setSendOpen} segments={preparedSegment ? [preparedSegment] : []} onDone={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] })} />
    </div>
  );
}
