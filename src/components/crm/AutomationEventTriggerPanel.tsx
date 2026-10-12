import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AUTOMATION_EVENTS,
  AUTOMATION_EVENT_BY_ID,
  DELIVERY_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  QUICK_FILTER_FIELDS,
  QUICK_FILTER_FIELD_BY_ID,
  defaultQuickFilter,
  isQuickFilterComplete,
  quickFilterOperators,
  type AutomationEventId,
  type QuickFilter,
  type QuickFilterFieldId,
} from "@/lib/automation-events";
import { getAutomationFilterOptions, previewEventTrigger } from "@/lib/automation-events.functions";

const SEGMENT_MODE = "__segmento__";
const NO_SEGMENT = "__nenhum__";

type Props = {
  open: boolean;
  eventId: AutomationEventId | "";
  lookbackHours: number;
  afterHours: number;
  filters: QuickFilter[];
  segmentId: string | undefined;
  customSegments: { id: string; nome: string }[];
  disabled?: boolean;
  onEventId: (id: AutomationEventId | "") => void;
  onLookbackHours: (hours: number) => void;
  onAfterHours: (hours: number) => void;
  onFilters: (filters: QuickFilter[]) => void;
  onSegmentId: (id: string | undefined) => void;
};

function newFilterId() {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function AutomationEventTriggerPanel({
  open,
  eventId,
  lookbackHours,
  afterHours,
  filters,
  segmentId,
  customSegments,
  disabled,
  onEventId,
  onLookbackHours,
  onAfterHours,
  onFilters,
  onSegmentId,
}: Props) {
  const loadOptions = useServerFn(getAutomationFilterOptions);
  const runPreview = useServerFn(previewEventTrigger);

  const { data: options } = useQuery({
    queryKey: ["automation-filter-options"],
    queryFn: () => loadOptions(),
    enabled: open && Boolean(eventId),
    staleTime: 5 * 60_000,
  });

  const completeFilters = useMemo(() => filters.filter(isQuickFilterComplete), [filters]);
  const { data: preview, isFetching: loadingPreview } = useQuery({
    queryKey: ["automation-event-preview", eventId, lookbackHours, afterHours, JSON.stringify(completeFilters), segmentId ?? null],
    queryFn: () =>
      runPreview({
        data: {
          event: eventId as AutomationEventId,
          lookbackHours,
          afterHours,
          filters: completeFilters.map((f) => ({ id: f.id, field: f.field, operator: f.operator, value: f.value })),
          ...(segmentId ? { segmentId } : {}),
        },
      }),
    enabled: open && Boolean(eventId),
    retry: 1,
    staleTime: 30_000,
  });

  const def = eventId ? AUTOMATION_EVENT_BY_ID.get(eventId) : undefined;

  const updateFilter = (id: string, patch: Partial<QuickFilter>) =>
    onFilters(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Quando a automação dispara</Label>
        <Select
          value={eventId || SEGMENT_MODE}
          {...(disabled ? { disabled: true } : {})}
          onValueChange={(v) => onEventId(v === SEGMENT_MODE ? "" : (v as AutomationEventId))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Por público</SelectLabel>
              <SelectItem value={SEGMENT_MODE}>Quando o cliente entra num segmento</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Por evento do pedido</SelectLabel>
              {AUTOMATION_EVENTS.filter((e) => e.subject === "order").map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Por carrinho e contato</SelectLabel>
              {AUTOMATION_EVENTS.filter((e) => e.subject !== "order").map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {def && <p className="text-xs text-muted-foreground">{def.hint}</p>}
      </div>

      {eventId && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Disparar só depois de (horas do evento)</Label>
            <Input
              type="number"
              min={0}
              max={1440}
              value={afterHours}
              onChange={(e) => onAfterHours(Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0))))}
            />
            <p className="text-xs text-muted-foreground">
              0 = assim que acontece. Ex.: 72 em "Pedido em produção" avisa só quem continua sem envio depois de 3 dias; 240 em
              "Pedido entregue" convida a pesquisa 10 dias depois. Os filtros são conferidos nesse momento.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pegar eventos das últimas (horas)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={lookbackHours}
              onChange={(e) => onLookbackHours(Math.max(1, Math.min(720, Math.round(Number(e.target.value) || 24))))}
            />
            <p className="text-xs text-muted-foreground">
              Quem já passou dessa janela não entra. Cada pedido/carrinho dispara uma única vez. A janela conta a partir do momento
              definido acima.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Filtros do cliente (todos precisam bater)</Label>
            {filters.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem filtros: todos os clientes com o evento entram.</p>
            )}
            {filters.map((filter) => {
              const fieldDef = QUICK_FILTER_FIELD_BY_ID.get(filter.field)!;
              const operators = quickFilterOperators(fieldDef.kind);
              const tagList = filter.field === "tag_sistema" ? options?.customTags : options?.customerTags;
              const listId = `tags-${filter.id}`;
              return (
                <div key={filter.id} className="rounded-lg border border-border p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={filter.field}
                      onValueChange={(v) => {
                        const next = defaultQuickFilter(filter.id, v as QuickFilterFieldId);
                        updateFilter(filter.id, { field: next.field, operator: next.operator, value: next.value });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUICK_FILTER_FIELDS.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label="Remover filtro"
                      onClick={() => onFilters(filters.filter((f) => f.id !== filter.id))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Select value={filter.operator} onValueChange={(v) => updateFilter(filter.id, { operator: v as QuickFilter["operator"] })}>
                      <SelectTrigger className="h-8 text-xs w-44 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {operators.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldDef.kind === "tag" && (
                      <>
                        <Input
                          className="h-8 text-xs"
                          list={listId}
                          placeholder="Digite ou escolha a tag"
                          value={filter.value}
                          onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        />
                        <datalist id={listId}>
                          {(tagList ?? []).map((tag) => (
                            <option key={tag} value={tag} />
                          ))}
                        </datalist>
                      </>
                    )}
                    {(fieldDef.kind === "number" || fieldDef.kind === "days") && (
                      <Input
                        className="h-8 text-xs"
                        type="number"
                        min={0}
                        placeholder={fieldDef.kind === "days" ? "dias" : "valor"}
                        value={filter.value}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                      />
                    )}
                    {fieldDef.kind === "text" && (
                      <Input
                        className="h-8 text-xs"
                        placeholder={filter.field === "estado" ? "UF, ex.: MG" : "Nome da cidade"}
                        value={filter.value}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                      />
                    )}
                    {fieldDef.kind === "rfm" && (
                      <Select value={filter.value} onValueChange={(v) => updateFilter(filter.id, { value: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Escolha o segmento" />
                        </SelectTrigger>
                        <SelectContent>
                          {(options?.rfmSegments ?? []).map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {(fieldDef.kind === "payment" || fieldDef.kind === "delivery") && (
                      <Select value={filter.value} onValueChange={(v) => updateFilter(filter.id, { value: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Escolha o status" />
                        </SelectTrigger>
                        <SelectContent>
                          {(fieldDef.kind === "payment" ? PAYMENT_STATUS_OPTIONS : DELIVERY_STATUS_OPTIONS).map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={filters.length >= 12}
              onClick={() => onFilters([...filters, defaultQuickFilter(newFilterId())])}
            >
              <Plus className="size-3.5 mr-1" /> Adicionar filtro
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Filtro extra: segmento salvo (opcional)</Label>
            <Select value={segmentId ?? NO_SEGMENT} onValueChange={(v) => onSegmentId(v === NO_SEGMENT ? undefined : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SEGMENT}>Nenhum</SelectItem>
                {customSegments.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Use para filtros mais avançados (produto, coleção, campanha…) criados em Contatos → Segmentos. O cliente precisa estar no
              segmento <em>e</em> passar nos filtros acima.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            {loadingPreview && !preview ? (
              <span className="text-muted-foreground">Calculando quem entraria agora…</span>
            ) : preview ? (
              <div className="space-y-0.5">
                <p>
                  <strong>{preview.eventos}</strong> {preview.eventos === 1 ? "evento" : "eventos"} na janela de {lookbackHours}h
                  {completeFilters.length > 0 || segmentId ? (
                    <>
                      {" "}
                      → <strong>{preview.eventosFiltrados}</strong> depois dos filtros
                    </>
                  ) : null}
                </p>
                <p className="text-muted-foreground">
                  {preview.comTelefone} cliente(s) com WhatsApp válido entrariam assim que a automação for ativada.
                </p>
              </div>
            ) : (
              <span className="text-muted-foreground">Não foi possível calcular a prévia.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
