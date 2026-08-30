import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, MessageCircle, Gift, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCalendarMonthDataFn } from "@/lib/events.functions";
import type { CalendarDay } from "@/lib/events.server";
import type { EventCategory } from "@/lib/events.server";
import { AiBatchDialog } from "./AiBatchDialog";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** No calendário, "outro" (categoria dos resumos automáticos da Linha do Tempo) aparece como
 *  "Evento" em vez de "Outro" — mais claro pra quem só quer saber que teve algo registrado no dia. */
function displayCategoryLabel(category: EventCategory, categoryLabel: Record<EventCategory, string>): string {
  return category === "outro" ? "Evento" : categoryLabel[category];
}

export function CalendarView({
  categoryLabel,
  categoryColor,
  onNewEvent,
}: {
  categoryLabel: Record<EventCategory, string>;
  categoryColor: Record<EventCategory, string>;
  onNewEvent: (dateISO: string) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

  const runCalendar = useServerFn(getCalendarMonthDataFn);
  const { data: days, isLoading } = useQuery({
    queryKey: ["calendar-month", year, month],
    queryFn: () => runCalendar({ data: { year, month } }),
  });

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); } else { setMonth((m) => m - 1); }
  };
  const goNext = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); } else { setMonth((m) => m + 1); }
  };

  const weeks = useMemo(() => {
    if (!days || days.length === 0) return [];
    const firstDate = new Date(`${days[0]!.date}T12:00:00Z`);
    const leadingBlanks = firstDate.getUTCDay(); // 0 = domingo
    const cells: (CalendarDay | null)[] = [...Array(leadingBlanks).fill(null), ...days];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (CalendarDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [days]);

  const today = todayISO();

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-border bg-card px-4 py-3">
        <p className="font-semibold">{MONTH_LABELS[month - 1]} de {year}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => setAiDialogOpen(true)}>
            <Sparkles className="size-3.5" /> Criar calendário com IA
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={goPrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={goNext}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border border-b-0 border-border bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="border-r border-border p-2 last:border-r-0">{w}</div>
        ))}
      </div>

      {isLoading && <div className="rounded-b-xl border border-border p-8 text-center text-sm text-muted-foreground">Carregando...</div>}

      {!isLoading && (
        <div className="overflow-hidden rounded-b-xl border border-border">
          {weeks.map((row, i) => (
            <div key={i} className="grid grid-cols-7 border-t border-border first:border-t-0">
              {row.map((d, j) => {
                if (!d) return <div key={j} className="min-h-[92px] border-r border-border bg-muted/20 last:border-r-0" />;
                const dayNum = Number(d.date.slice(-2));
                const isToday = d.date === today;
                const messageTotal = d.envioMensagens + d.whatsappCampanhas;
                return (
                  <button
                    key={j}
                    onClick={() => setSelected(d)}
                    className="flex min-h-[92px] flex-col items-start gap-1 border-r border-border p-1.5 text-left last:border-r-0 hover:bg-muted/50"
                  >
                    <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                      {dayNum}
                    </span>
                    {d.commercialDate && (
                      <span className="flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        <Gift className="size-2.5 shrink-0" />
                        <span className="truncate">{d.commercialDate}</span>
                      </span>
                    )}
                    {d.crmEvents.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {d.crmEvents.slice(0, 2).map((ev) => (
                          <span key={ev.id} className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${categoryColor[ev.category]}`}>
                            {displayCategoryLabel(ev.category, categoryLabel)}
                          </span>
                        ))}
                      </span>
                    )}
                    {messageTotal > 0 && (
                      <span className="mt-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MessageCircle className="size-2.5" /> {messageTotal}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{new Date(`${selected.date}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {selected.commercialDate && (
                <div className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
                  <Gift className="size-4" /> {selected.commercialDate}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Faturamento</p>
                  <p className="font-semibold">R$ {selected.faturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Pedidos</p>
                  <p className="font-semibold">{selected.pedidos}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Fluxo de Envio</p>
                  <p className="font-semibold">{selected.envioMensagens} mensagem(ns)</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">WhatsApp API</p>
                  <p className="font-semibold">{selected.whatsappCampanhas} campanha(s)</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">Eventos do dia</p>
                {selected.crmEvents.length === 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">Nenhum evento registrado nesse dia.</p>
                )}
                <div className="mt-2 space-y-2">
                  {selected.crmEvents.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-border p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryColor[ev.category]}`}>
                        {displayCategoryLabel(ev.category, categoryLabel)}
                      </span>
                      <p className="mt-1 font-medium">{ev.title}</p>
                      {ev.description && <p className="mt-0.5 text-sm text-muted-foreground">{ev.description}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => { onNewEvent(selected.date); setSelected(null); }}
              >
                <Plus className="size-4" /> Novo evento nesse dia
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AiBatchDialog open={aiDialogOpen} onOpenChange={setAiDialogOpen} />
    </div>
  );
}
