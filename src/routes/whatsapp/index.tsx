import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Search, Check, X, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listWaCampaigns, type WaCampaignListRow } from "@/lib/wa-campaigns.functions";
import { approveCampaign, rejectCampaign } from "@/lib/whatsapp-meta.functions";

export const Route = createFileRoute("/whatsapp/")({
  head: () => ({
    meta: [
      { title: "Campanhas de WhatsApp | CRM Insights" },
      { name: "description", content: "Lista única de campanhas de WhatsApp com envio, entrega, leitura e falhas em tempo real." },
      { property: "og:title", content: "Campanhas de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Acompanhe e aprove suas campanhas de WhatsApp em uma única tela." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignsPage,
});

const STATUS_LABEL: Record<string, string> = {
  aguardando_aprovacao: "Aguardando aprovação",
  rejeitada: "Rejeitada",
  enviando: "Enviando",
  agendada: "Agendada",
  finalizada: "Finalizada",
  erro: "Erro",
  cancelada: "Cancelada",
};

const STATUS_CLASS: Record<string, string> = {
  aguardando_aprovacao: "bg-warning-soft text-warning",
  rejeitada: "bg-critical-soft text-critical",
  enviando: "bg-warning-soft text-warning",
  agendada: "bg-brand-soft text-brand",
  finalizada: "bg-success-soft text-success",
  erro: "bg-critical-soft text-critical",
  cancelada: "bg-muted text-muted-foreground",
};

const FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação" },
  { value: "enviando", label: "Enviando" },
  { value: "agendada", label: "Agendadas" },
  { value: "finalizada", label: "Finalizadas" },
  { value: "erro", label: "Com erro" },
];

const DATE_PERIODS = [
  { key: "tudo", label: "Tudo" },
  { key: "dia", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "mes", label: "Este mês" },
  { key: "ano", label: "Este ano" },
  { key: "personalizado", label: "Personalizado" },
] as const;

type DatePeriodKey = (typeof DATE_PERIODS)[number]["key"];

function campaignDate(c: WaCampaignListRow): Date {
  return new Date(c.sentAt ?? c.createdAt);
}

function inPeriod(c: WaCampaignListRow, period: DatePeriodKey, range: DateRange | undefined): boolean {
  if (period === "tudo") return true;
  const d = campaignDate(c);
  const now = new Date();
  if (period === "dia") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  if (period === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (period === "mes") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === "ano") return d.getFullYear() === now.getFullYear();
  if (range?.from) {
    const end = range.to ?? range.from;
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);
    return d >= range.from && d <= endOfDay;
  }
  return true;
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function pct(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="text-right">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground xl:hidden">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CampaignsPage() {
  const navigate = useNavigate();
  const runApprove = useServerFn(approveCampaign);
  const runReject = useServerFn(rejectCampaign);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [datePeriod, setDatePeriod] = useState<DatePeriodKey>("tudo");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["wa-campaigns"],
    queryFn: () => listWaCampaigns(),
    refetchInterval: 20_000,
  });

  const list: WaCampaignListRow[] = data ?? [];

  const filtered = useMemo(
    () =>
      list.filter((c) => {
        if (filter !== "todas" && c.status !== filter) return false;
        if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (!inPeriod(c, datePeriod, range)) return false;
        return true;
      }),
    [list, filter, search, datePeriod, range],
  );

  const filteredTotals = useMemo(
    () =>
      filtered.reduce(
        (acc, c) => ({
          sent: acc.sent + c.sent,
          delivered: acc.delivered + c.delivered,
          read: acc.read + c.read,
          failed: acc.failed + c.failed,
          pending: acc.pending + c.pending,
          revenue: acc.revenue + c.revenue,
          orders: acc.orders + c.orders,
        }),
        { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0, revenue: 0, orders: 0 },
      ),
    [filtered],
  );

  const totals = useMemo(
    () =>
      list.reduce(
        (acc, c) => ({
          sent: acc.sent + c.sent,
          delivered: acc.delivered + c.delivered,
          read: acc.read + c.read,
          failed: acc.failed + c.failed,
          pending: acc.pending + c.pending,
          revenue: acc.revenue + c.revenue,
          orders: acc.orders + c.orders,
        }),
        { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0, revenue: 0, orders: 0 },
      ),
    [list],
  );

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const res: any = await runApprove({ data: { campaignId: id } });
      if (res?.success === false) toast.error(res.error);
      else toast.success("Campanha aprovada e enfileirada.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao aprovar.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Motivo da rejeição (opcional):", "") ?? undefined;
    setBusyId(id);
    try {
      const res: any = await runReject({ data: { campaignId: id, reason } });
      if (res?.success === false) toast.error(res.error);
      else toast.success("Campanha rejeitada.");
      refetch();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="surface-card border-success/30 bg-success-soft/40 p-4 lg:col-span-2">
          <p className="text-xs font-medium text-success">Valor vendido (30 dias após o envio)</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-success">{money(totals.revenue)}</p>
          <p className="text-[11px] text-muted-foreground">{totals.orders.toLocaleString("pt-BR")} pedidos atribuídos</p>
        </div>
        {[
          { label: "Enviadas", value: totals.sent },
          { label: "Entregues", value: totals.delivered },
          { label: "Lidas", value: totals.read },
          { label: "Falhas", value: totals.failed },
        ].map((card) => (
          <div key={card.label} className="surface-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{card.value.toLocaleString("pt-BR")}</p>
          </div>
        ))}
      </div>


      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar campanha…" className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.value ? "gradient-brand text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} /> Atualizar
        </Button>
        <Button className="gap-2" onClick={() => navigate({ to: "/whatsapp/nova" })}>
          <Plus className="size-4" /> Nova campanha
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando campanhas…</p>
      ) : filtered.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <p className="font-medium">Nenhuma campanha aqui.</p>
          <p className="mt-1 text-sm text-muted-foreground">Crie a primeira e acompanhe entrega e leitura em tempo real.</p>
          <Button className="mt-4 gap-2" onClick={() => navigate({ to: "/whatsapp/nova" })}>
            <Plus className="size-4" /> Nova campanha
          </Button>
        </div>
      ) : (
        <div className="surface-card overflow-hidden p-0">
          <div className="hidden items-center gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground xl:flex">
            <div className="min-w-[220px] flex-1">Campanha</div>
            <div className="grid w-[560px] shrink-0 grid-cols-5 gap-3 text-right">
              <span>Público</span>
              <span>Enviadas</span>
              <span>Entregues</span>
              <span>Lidas</span>
              <span>Falhas</span>
            </div>
            <div className="w-[130px] shrink-0 text-right">Valor vendido</div>
            <div className="w-[120px] shrink-0" />
          </div>

          <div className="divide-y divide-border">
            {filtered.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40">
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/whatsapp/$campaignId" params={{ campaignId: c.id }} className="font-semibold hover:underline">
                      {c.name}
                    </Link>
                    <Badge className={cn("border-0", STATUS_CLASS[c.status] ?? "bg-muted text-muted-foreground")}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                    {c.origin === "automacao" && <Badge variant="outline">Automação</Badge>}
                    {c.queuePaused && <Badge variant="outline">Pausada</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.audienceLabel ?? "Público"} · modelo {c.templateName || "—"} ·{" "}
                    {new Date(c.sentAt ?? c.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>

                <div className="grid w-full shrink-0 grid-cols-5 gap-3 text-right xl:w-[560px]">
                  <Metric label="Público" value={c.total.toLocaleString("pt-BR")} />
                  <Metric label="Enviadas" value={c.sent.toLocaleString("pt-BR")} hint={pct(c.sent, c.total)} />
                  <Metric label="Entregues" value={c.delivered.toLocaleString("pt-BR")} hint={pct(c.delivered, c.sent)} />
                  <Metric label="Lidas" value={c.read.toLocaleString("pt-BR")} hint={pct(c.read, c.delivered)} />
                  <Metric
                    label="Falhas"
                    value={c.failed.toLocaleString("pt-BR")}
                    hint={c.pending ? `${c.pending} na fila` : undefined}
                  />
                </div>

                <div className="w-[130px] shrink-0 text-right">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground xl:hidden">Valor vendido</p>
                  <p className={cn("text-lg font-semibold leading-tight", c.revenue > 0 ? "text-success" : "text-muted-foreground")}>
                    {c.revenue > 0 ? money(c.revenue) : "—"}
                  </p>
                  {c.orders > 0 && <p className="text-[11px] text-muted-foreground">{c.orders} pedidos</p>}
                </div>

                <div className="flex min-w-[120px] shrink-0 items-center justify-end gap-2">
                  {c.status === "aguardando_aprovacao" && (
                    <>
                      <Button size="sm" className="gap-1.5" disabled={busyId === c.id} onClick={() => approve(c.id)}>
                        <Check className="size-3.5" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === c.id} onClick={() => reject(c.id)}>
                        <X className="size-3.5" /> Rejeitar
                      </Button>
                    </>
                  )}
                  <Button size="icon" variant="ghost" asChild>
                    <Link to="/whatsapp/$campaignId" params={{ campaignId: c.id }}>
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
