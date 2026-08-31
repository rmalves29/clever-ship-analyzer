import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Plus, Sparkles, Trash2, Pencil, Tag, LineChart, Network, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventsGraph } from "@/components/eventos/EventsGraph";
import { CalendarView } from "@/components/eventos/CalendarView";
import {
  listCrmEvents,
  listCrmEventDates,
  createCrmEvent,
  updateCrmEvent,
  deleteCrmEvent,
  getEventsTimelineData,
  getLatestEventsAnalysis,
  generateEventsAnalysis,
} from "@/lib/events.functions";
import type { CrmEvent, EventCategory } from "@/lib/events.server";

export const Route = createFileRoute("/eventos")({
  component: EventosPage,
  head: () => ({
    meta: [
      { title: "Eventos | CRM" },
      { name: "description", content: "Cruze o que aconteceu (preço, campanha, criativo, estoque) com faturamento e ROAS pra entender por que o resultado foi bom ou ruim." },
    ],
  }),
});

const CATEGORY_LABEL: Record<EventCategory, string> = {
  preco: "Preço",
  campanha: "Campanha",
  criativo: "Criativo",
  estoque: "Estoque",
  feriado: "Feriado/Data",
  concorrencia: "Concorrência",
  conteudo: "Conteúdo",
  outro: "Outro",
};

const CATEGORY_COLOR: Record<EventCategory, string> = {
  preco: "bg-warning-soft text-warning",
  campanha: "bg-brand-soft text-brand",
  criativo: "bg-brand-soft text-brand",
  estoque: "bg-critical-soft text-critical",
  feriado: "bg-muted text-muted-foreground",
  concorrencia: "bg-critical-soft text-critical",
  conteudo: "bg-success-soft text-success",
  outro: "bg-muted text-muted-foreground",
};

const TONE_CLASS: Record<string, string> = {
  positivo: "bg-success-soft text-success",
  atencao: "bg-warning-soft text-warning",
  critico: "bg-critical-soft text-critical",
};

const RANGE_PRESETS = [
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

type EventFormState = {
  id?: string;
  eventDate: string;
  title: string;
  description: string;
  category: EventCategory;
  canais: string[];
};

const CANAL_OPTIONS = ["shopify", "meta_ads", "instagram", "whatsapp"];

function emptyForm(date: string): EventFormState {
  return { eventDate: date, title: "", description: "", category: "outro", canais: [] };
}

function EventDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: EventFormState;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EventFormState>(initial);
  const [saving, setSaving] = useState(false);
  const runCreate = useServerFn(createCrmEvent);
  const runUpdate = useServerFn(updateCrmEvent);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Dá um título pro evento.");
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await runUpdate({ data: { id: form.id, eventDate: form.eventDate, title: form.title, description: form.description, category: form.category, canais: form.canais } });
      } else {
        await runCreate({ data: { eventDate: form.eventDate, title: form.title, description: form.description, category: form.category, canais: form.canais } });
      }
      toast.success("Evento salvo.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar evento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { onOpenChange(v); if (v) setForm(initial); } }}>
      <DialogContent className="max-w-md">
        <DialogTitle>{form.id ? "Editar evento" : "Novo evento"}</DialogTitle>
        <DialogDescription>Registre o que aconteceu pra cruzar com o resultado do período.</DialogDescription>

        <div className="space-y-3">
          <div>
            <Label>Data</Label>
            <Input type="date" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} />
          </div>
          <div>
            <Label>Título</Label>
            <Input placeholder="Ex: Troca de preço vestido X" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as EventCategory }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Canais afetados</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CANAL_OPTIONS.map((c) => {
                const active = form.canais.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, canais: active ? f.canais.filter((x) => x !== c) : [...f.canais, c] }))}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${active ? "border-primary bg-brand-soft text-brand" : "border-border text-muted-foreground"}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea placeholder="Detalhes do que mudou..." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EventosPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"linha" | "grafo" | "calendario">("linha");
  const [rangeDays, setRangeDays] = useState(30);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventFormState | null>(null);
  const [selectedEventDate, setSelectedEventDate] = useState("");

  const range = useMemo(() => {
    const to = new Date();
    const from = subDays(to, rangeDays - 1);
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }, [rangeDays]);

  const runTimeline = useServerFn(getEventsTimelineData);
  const runEventDates = useServerFn(listCrmEventDates);
  const runEventsForDay = useServerFn(listCrmEvents);
  const runDelete = useServerFn(deleteCrmEvent);
  const runLatestAnalysis = useServerFn(getLatestEventsAnalysis);
  const runGenerateAnalysis = useServerFn(generateEventsAnalysis);

  const { data: timeline, isLoading, refetch } = useQuery({
    queryKey: ["events-timeline", range.from, range.to],
    queryFn: () => runTimeline({ data: range }),
  });

  const { data: eventDates = [], isLoading: isLoadingEventDates } = useQuery({
    queryKey: ["crm-event-dates"],
    queryFn: () => runEventDates(),
  });

  useEffect(() => {
    if (!selectedEventDate && !isLoadingEventDates) {
      setSelectedEventDate(eventDates[0] ?? format(new Date(), "yyyy-MM-dd"));
    }
  }, [eventDates, isLoadingEventDates, selectedEventDate]);

  const { data: dailyEvents = [], isLoading: isLoadingDailyEvents } = useQuery({
    queryKey: ["crm-events-day", selectedEventDate],
    queryFn: () => runEventsForDay({ data: { from: selectedEventDate, to: selectedEventDate } }),
    enabled: Boolean(selectedEventDate),
  });

  const { data: latestAnalysis, refetch: refetchAnalysis } = useQuery({
    queryKey: ["events-analysis"],
    queryFn: () => runLatestAnalysis(),
  });

  const [generating, setGenerating] = useState(false);
  const handleGenerateAnalysis = async () => {
    setGenerating(true);
    try {
      const res = await runGenerateAnalysis({ data: range });
      if (!res.success) {
        toast.error(res.error || "Falha ao gerar análise.");
        return;
      }
      toast.success("Análise gerada.");
      refetchAnalysis();
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await runDelete({ data: { id } });
      toast.success("Evento removido.");
      queryClient.invalidateQueries({ queryKey: ["events-timeline"] });
      queryClient.invalidateQueries({ queryKey: ["crm-event-dates"] });
      queryClient.invalidateQueries({ queryKey: ["crm-events-day"] });
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover.");
    }
  };

  const chartData = useMemo(() => {
    if (!timeline) return [];
    return timeline.days.map((d) => ({
      date: d.date,
      label: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      faturamento: d.faturamento,
      roas: d.metaRoas,
    }));
  }, [timeline]);

  const events = timeline?.events ?? [];
  const analysis = latestAnalysis?.analysis ?? null;
  const selectedDateIndex = eventDates.indexOf(selectedEventDate);
  const olderDate = selectedDateIndex >= 0 ? eventDates[selectedDateIndex + 1] : undefined;
  const newerDate = selectedDateIndex > 0 ? eventDates[selectedDateIndex - 1] : undefined;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Eventos</h1>
          <p className="text-sm text-muted-foreground">Cruze o que aconteceu com o resultado — por que foi bom ou ruim.</p>
        </div>
        <Button onClick={() => { setEditing(emptyForm(format(new Date(), "yyyy-MM-dd"))); setDialogOpen(true); }} className="gap-2">
          <Plus className="size-4" /> Novo evento
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGE_PRESETS.map((p) => (
            <Button key={p.days} variant={rangeDays === p.days ? "default" : "outline"} size="sm" onClick={() => setRangeDays(p.days)}>
              {p.label}
            </Button>
          ))}
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="linha" className="gap-1.5">
              <LineChart className="size-3.5" /> Linha do Tempo
            </TabsTrigger>
            <TabsTrigger value="grafo" className="gap-1.5">
              <Network className="size-3.5" /> Grafo
            </TabsTrigger>
            <TabsTrigger value="calendario" className="gap-1.5">
              <CalendarDays className="size-3.5" /> Calendário
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "calendario" && (
        <CalendarView
          categoryLabel={CATEGORY_LABEL}
          categoryColor={CATEGORY_COLOR}
          onNewEvent={(dateISO) => { setEditing(emptyForm(dateISO)); setDialogOpen(true); }}
        />
      )}

      {view !== "calendario" && isLoading && <p className="mt-6 text-center text-muted-foreground">Carregando...</p>}

      {!isLoading && timeline && view === "grafo" && (
        <div className="mt-4">
          <EventsGraph events={events} categoryLabel={CATEGORY_LABEL} />
        </div>
      )}

      {!isLoading && timeline && view === "linha" && (
        <>
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Faturamento x ROAS, com os eventos marcados</p>
              {!timeline.metaConnected && (
                <span className="text-xs text-muted-foreground">Meta Ads não conectado — mostrando só Shopify.</span>
              )}
            </div>
            <div className="mt-3 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "faturamento" ? [`R$ ${value.toLocaleString("pt-BR")}`, "Faturamento"] : [`${value?.toFixed?.(2) ?? value}x`, "ROAS"]
                    }
                  />
                  <Bar yAxisId="left" dataKey="faturamento" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  {timeline.metaConnected && <Line yAxisId="right" dataKey="roas" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} connectNulls />}
                  {events.map((ev) => {
                    const label = chartData.find((d) => d.date === ev.eventDate)?.label;
                    if (!label) return null;
                    return (
                      <ReferenceLine
                        key={ev.id}
                        yAxisId="left"
                        x={label}
                        stroke="hsl(var(--critical))"
                        strokeDasharray="4 4"
                        label={{ value: "●", position: "top", fill: "hsl(var(--critical))" }}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-semibold">Histórico diário</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Um dia por vez, com todo o histórico preservado e sem limite de resumos.</p>
                </div>
                <div className="flex items-end gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9"
                    disabled={!olderDate}
                    onClick={() => olderDate && setSelectedEventDate(olderDate)}
                    aria-label="Data anterior com eventos"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div>
                    <Label htmlFor="event-history-date" className="text-[11px] text-muted-foreground">Filtrar por data</Label>
                    <Input
                      id="event-history-date"
                      type="date"
                      value={selectedEventDate}
                      onChange={(e) => setSelectedEventDate(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9"
                    disabled={!newerDate}
                    onClick={() => newerDate && setSelectedEventDate(newerDate)}
                    aria-label="Próxima data com eventos"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              {isLoadingDailyEvents && <p className="mt-3 text-sm text-muted-foreground">Carregando eventos do dia...</p>}
              {!isLoadingDailyEvents && dailyEvents.length === 0 && (
                <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nenhum evento registrado nesta data. Use as setas para navegar pelos dias com registros ou escolha outra data.
                </p>
              )}
              <div className="mt-3 space-y-2.5">
                {dailyEvents.map((ev: CrmEvent) => {
                  const isPermanentDailySummary = ev.source === "auto" && ev.title.startsWith("Resumo do dia ");
                  return (
                  <div key={ev.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_COLOR[ev.category]}`}>
                          {CATEGORY_LABEL[ev.category]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.eventDate + "T00:00:00").toLocaleDateString("pt-BR")}
                        </span>
                        {ev.source === "auto" && (
                          <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">
                            <Sparkles className="size-2.5" /> Automático
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-medium">{ev.title}</p>
                      {ev.description && <p className="mt-0.5 text-sm text-muted-foreground">{ev.description}</p>}
                      {ev.canais.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {ev.canais.map((c) => (
                            <span key={c} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              <Tag className="size-2.5" /> {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {!isPermanentDailySummary && <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => {
                          setEditing({ id: ev.id, eventDate: ev.eventDate, title: ev.title, description: ev.description ?? "", category: ev.category, canais: ev.canais });
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-critical" onClick={() => handleDelete(ev.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>}
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Análise IA</p>
                <Button size="sm" onClick={handleGenerateAnalysis} disabled={generating} className="gap-1.5">
                  <Sparkles className="size-3.5" />
                  {generating ? "Analisando..." : "Analisar"}
                </Button>
              </div>
              {!analysis && <p className="mt-2 text-sm text-muted-foreground">Nenhuma análise gerada ainda pra esse período.</p>}
              {analysis && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-muted-foreground">{analysis.resumo}</p>
                  <div className="space-y-2">
                    {analysis.insights.map((ins: any, i: number) => (
                      <div key={i} className="rounded-lg border border-border p-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE_CLASS[ins.tone] ?? "bg-muted text-muted-foreground"}`}>
                          {ins.title}
                        </span>
                        <p className="mt-1.5 text-xs text-muted-foreground">{ins.text}</p>
                      </div>
                    ))}
                  </div>
                  {analysis.recomendacoes?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recomendações</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        {analysis.recomendacoes.map((r: string, i: number) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {editing && (
        <EventDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["events-timeline"] });
            queryClient.invalidateQueries({ queryKey: ["crm-event-dates"] });
            queryClient.invalidateQueries({ queryKey: ["crm-events-day"] });
            refetch();
          }}
        />
      )}
    </div>
  );
}
