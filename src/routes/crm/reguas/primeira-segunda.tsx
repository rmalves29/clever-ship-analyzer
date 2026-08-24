import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createRepurchaseCampaignDraft,
  getRepurchaseCustomers,
  getRepurchaseDashboard,
  suggestRepurchaseCampaign,
} from "@/lib/crm-repurchase.functions";
import { REPURCHASE_WINDOWS, type RepurchaseWindow } from "@/lib/crm-repurchase-shared";
import { toast } from "sonner";

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
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type StageFilter = RepurchaseWindow | "Convertido";

function Card({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="surface-card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function RepurchasePage() {
  const fetchDashboard = useServerFn(getRepurchaseDashboard);
  const fetchCustomers = useServerFn(getRepurchaseCustomers);
  const runSuggestion = useServerFn(suggestRepurchaseCampaign);
  const runCampaignDraft = useServerFn(createRepurchaseCampaignDraft);

  const [stage, setStage] = useState<StageFilter | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [suggestion, setSuggestion] = useState<{
    approach: string;
    message: string;
    incentive: string;
    cta: string;
    offer: string;
    rationale: string;
  } | null>(null);
  const [campaignDraft, setCampaignDraft] = useState<{
    name: string;
    customerCount: number;
    stage: string;
  } | null>(null);

  useEffect(() => {
    setPage(0);
  }, [stage, search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["repurchase-dashboard"],
    queryFn: () => fetchDashboard(),
  });

  const { data: customerResult, isLoading: customersLoading } = useQuery({
    queryKey: ["repurchase-customers", stage ?? "all", search, page],
    queryFn: () => {
      const base = { search, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
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

  const draftMutation = useMutation({
    mutationFn: async (selectedStage: RepurchaseWindow) => runCampaignDraft({ data: { stage: selectedStage } }),
    onSuccess: (draft) => {
      setCampaignDraft({
        name: draft.name,
        customerCount: draft.audience.customerCount,
        stage: draft.audience.stage,
      });
      toast.success("Rascunho preparado. Nenhum envio foi realizado.");
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
  const targetProgress = summary.targetConversionRate > 0
    ? Math.min(100, (summary.conversionRate / summary.targetConversionRate) * 100)
    : 0;

  const selectStage = (value: StageFilter) => {
    setStage(value);
    setSuggestion(null);
    setCampaignDraft(null);
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">CRM → Réguas</p>
          <h1 className="text-2xl font-bold">1ª compra → 2ª compra</h1>
          <p className="text-sm text-muted-foreground">Transforme compradores de primeira viagem em clientes recorrentes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!actionableStage || aiMutation.isPending}
            onClick={() => actionableStage && aiMutation.mutate(actionableStage)}
          >
            <Sparkles className="mr-2 size-4" />
            {aiMutation.isPending ? "Gerando…" : "Sugerir campanha com IA"}
          </Button>
          <Button
            disabled={!actionableStage || draftMutation.isPending}
            onClick={() => actionableStage && draftMutation.mutate(actionableStage)}
          >
            <Target className="mr-2 size-4" />
            Criar campanha
          </Button>
        </div>
      </div>

      {!actionableStage && (
        <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Selecione uma janela pendente no funil para gerar uma sugestão ou preparar um rascunho de campanha. Nenhuma ação envia mensagens automaticamente.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card label="Aguardando 2ª compra" value={summary.pending} hint="Exatamente 1 pedido válido" />
        <Card label="Converteram" value={summary.converted} hint="Já fizeram a 2ª compra" />
        <Card label="Taxa de recompra" value={pct(summary.conversionRate)} hint={`Meta inicial ${pct(summary.targetConversionRate)}`} />
        <Card label="Receita da 1ª compra" value={brl(summary.firstRevenue)} hint={`Ticket médio ${brl(summary.firstAverageTicket)}`} />
        <Card label="Dias desde a 1ª compra" value={`${summary.averageDaysSinceFirstOrderPending.toFixed(1)} dias`} hint="Média dos clientes ainda pendentes" />
        <Card label="Receita de 2ª compra" value={brl(summary.secondRevenue)} hint={`Ticket médio ${brl(summary.secondAverageTicket)}`} />
        <Card label="Tempo até 2ª compra" value={`${summary.averageDaysToSecondOrder.toFixed(1)} dias`} hint="Média dos clientes convertidos" />
        <Card label="Base da jornada" value={summary.buyers} hint="Clientes com ao menos 1 pedido válido" />
      </div>

      <section className="surface-card p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Meta de segunda compra</h2>
            <p className="text-xs text-muted-foreground">
              Atual {pct(summary.conversionRate)} · meta {pct(summary.targetConversionRate)} · diferença {pct(summary.gapToTarget)}
            </p>
          </div>
          <span className="text-sm font-semibold">{targetProgress.toFixed(0)}% da meta</span>
        </div>
        <Progress value={targetProgress} />
      </section>

      <section className="surface-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="size-4" />
          <h2 className="font-semibold">Jornada de recompra</h2>
        </div>
        <div className="grid gap-2 lg:grid-cols-7">
          {REPURCHASE_WINDOWS.map((name) => (
            <button
              key={name}
              onClick={() => selectStage(name)}
              className={`rounded-xl border p-4 text-left transition hover:bg-muted/40 ${stage === name ? "ring-2 ring-primary" : ""}`}
            >
              <p className="text-xs text-muted-foreground">{name}</p>
              <p className="mt-1 text-2xl font-bold">{summary.windows[name]}</p>
            </button>
          ))}
          <button
            onClick={() => selectStage("Convertido")}
            className={`rounded-xl border p-4 text-left transition hover:bg-muted/40 ${stage === "Convertido" ? "ring-2 ring-primary" : ""}`}
          >
            <p className="text-xs text-muted-foreground">2ª compra</p>
            <p className="mt-1 text-2xl font-bold">{summary.converted}</p>
            <p className="text-xs text-muted-foreground">Convertido</p>
          </button>
        </div>
      </section>

      {(suggestion || campaignDraft) && (
        <section className="grid gap-4 lg:grid-cols-2">
          {suggestion && (
            <div className="surface-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="size-4" />
                <h2 className="font-semibold">Sugestão da IA — revisão humana</h2>
              </div>
              <div className="space-y-3 text-sm">
                <p><strong>Abordagem:</strong> {suggestion.approach}</p>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="whitespace-pre-wrap">{suggestion.message}</p></div>
                <p><strong>Incentivo sugerido:</strong> {suggestion.incentive}</p>
                <p><strong>Oferta sugerida:</strong> {suggestion.offer}</p>
                <p><strong>CTA:</strong> {suggestion.cta}</p>
                <p className="text-muted-foreground"><strong>Por quê:</strong> {suggestion.rationale}</p>
              </div>
            </div>
          )}
          {campaignDraft && (
            <div className="surface-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Target className="size-4" />
                <h2 className="font-semibold">Rascunho de campanha</h2>
              </div>
              <div className="space-y-2 text-sm">
                <p><strong>Nome:</strong> {campaignDraft.name}</p>
                <p><strong>Estágio:</strong> {campaignDraft.stage}</p>
                <p><strong>Audiência dinâmica:</strong> {campaignDraft.customerCount} clientes</p>
                <p className="rounded-lg border border-dashed p-3 text-muted-foreground">
                  Rascunho não persistido e envio desativado. A conversão futura deverá usar evidência auditável (cupom, link rastreado, landing específica, resposta explícita ou validação manual).
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="surface-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Clientes {stage ? `— ${stage}` : "— toda a jornada"}</h2>
            <p className="text-xs text-muted-foreground">{totalCustomers} cliente(s) no filtro atual.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-72"
              placeholder="Buscar cliente ou produto…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {stage && <Button variant="outline" onClick={() => setStage(undefined)}>Limpar etapa</Button>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>1ª compra</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Produtos</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Estágio</TableHead>
                <TableHead>2ª compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customersLoading ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Carregando clientes…</TableCell></TableRow>
              ) : customers.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
              ) : customers.map((customer) => (
                <TableRow key={customer.customerId}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{new Date(customer.firstOrderAt).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{customer.daysSinceFirstOrder}</TableCell>
                  <TableCell>{brl(customer.firstOrderRevenue)}</TableCell>
                  <TableCell className="max-w-80">
                    <span className="line-clamp-2 text-xs">{customer.products.join(", ") || "—"}</span>
                  </TableCell>
                  <TableCell>{[customer.city, customer.province].filter(Boolean).join("/") || "—"}</TableCell>
                  <TableCell>{customer.sourceName || "—"}</TableCell>
                  <TableCell>{customer.stage}</TableCell>
                  <TableCell>
                    {customer.secondOrderAt ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        {new Date(customer.secondOrderAt).toLocaleDateString("pt-BR")}
                        <ArrowRight className="size-3" />
                        {brl(customer.secondOrderRevenue ?? 0)}
                      </span>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft className="mr-1 size-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Próxima <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      </section>

      <section className="surface-card p-5">
        <h2 className="mb-1 font-semibold">Coortes de primeira compra</h2>
        <p className="mb-4 text-xs text-muted-foreground">A taxa mede quantos clientes de cada mês avançaram para uma segunda compra válida.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead>Clientes</TableHead>
              <TableHead>2ª compra</TableHead>
              <TableHead>Taxa</TableHead>
              <TableHead>Tempo médio</TableHead>
              <TableHead>Receita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.cohorts.map((cohort) => (
              <TableRow key={cohort.month}>
                <TableCell>{cohort.month}</TableCell>
                <TableCell>{cohort.customers}</TableCell>
                <TableCell>{cohort.converted}</TableCell>
                <TableCell>{pct(cohort.conversionRate)}</TableCell>
                <TableCell>{cohort.averageDaysToSecondOrder.toFixed(1)} dias</TableCell>
                <TableCell>{brl(cohort.secondOrderRevenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
