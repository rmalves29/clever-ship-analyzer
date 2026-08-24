import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Save, ShoppingCart, Tag, Trash2, Users, Zap, AlertTriangle, ShieldCheck } from "lucide-react";
import { RFM_SEGMENTS_CONFIG } from "@/lib/crm-rfm-shared";
import {
  BRAZIL_STATES,
  CRM_FILTER_CATEGORIES,
  getCRMFilterField,
  isSupportedCRMFilter,
  type CRMFilterCategory,
  type CRMFilterField,
  type CRMFilterKind,
} from "@/lib/crm-filter-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { getCRMFilterOptions, saveSegment } from "@/lib/crm-segmentation.functions";
import { toast } from "sonner";

type RangeValue = { min: string | number; max: string | number };
type RuleValue = string | number | boolean | string[] | RangeValue;

type RuleCondition = {
  id: string;
  category: string;
  field: string;
  operator: string;
  value: RuleValue;
  label: string;
};

type RuleGroup = {
  id: string;
  type: "AND" | "OR";
  conditions: RuleCondition[];
};

type FilterOptions = {
  cities: string[];
  customerTags: string[];
  customTags: string[];
};

const EMPTY_FILTER_OPTIONS: FilterOptions = { cities: [], customerTags: [], customTags: [] };

const CATEGORY_ICONS: Record<CRMFilterCategory["id"], typeof Users> = {
  pessoais: Users,
  comportamento: ShoppingCart,
  tags: Tag,
  rfm: Zap,
};

const OPERATORS = {
  string: [
    { label: "É igual a", value: "eq" },
    { label: "Não é igual a", value: "neq" },
    { label: "Contém", value: "contains" },
    { label: "Não contém", value: "not_contains" },
    { label: "Começa com", value: "starts_with" },
  ],
  exact: [
    { label: "É igual a", value: "eq" },
    { label: "Não é igual a", value: "neq" },
  ],
  number: [
    { label: "Maior que", value: "gt" },
    { label: "Menor que", value: "lt" },
    { label: "Igual a", value: "eq" },
    { label: "Maior ou igual a", value: "gte" },
    { label: "Menor ou igual a", value: "lte" },
    { label: "Diferente de", value: "neq" },
    { label: "Entre", value: "between" },
  ],
  date: [
    { label: "Antes de", value: "before" },
    { label: "Depois de", value: "after" },
    { label: "Nos últimos X dias", value: "last_days" },
    { label: "Há mais de X dias", value: "older_than_days" },
    { label: "Entre X e Y dias atrás", value: "between_days" },
    { label: "Exatamente em", value: "on" },
  ],
  rfm: [
    { label: "É igual a", value: "eq" },
    { label: "Não é igual a", value: "neq" },
    { label: "É um dos", value: "in" },
    { label: "Não é nenhum dos", value: "not_in" },
  ],
} as const;

function operatorsForField(field: CRMFilterField) {
  if (field.id === "estado") return OPERATORS.exact;
  if (field.kind === "number") return OPERATORS.number;
  if (field.kind === "date") return OPERATORS.date;
  if (field.kind === "rfm") return OPERATORS.rfm;
  if (["boolean", "status", "profile"].includes(field.kind)) return OPERATORS.exact;
  return OPERATORS.string;
}

function defaultOperatorForField(field: CRMFilterField) {
  if (field.kind === "date") return "on";
  return "eq";
}

function rangeValue(value: RuleValue): RangeValue {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as RangeValue;
  return { min: "", max: "" };
}

function isBlank(value: RuleValue) {
  if (value === "" || value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const range = value as RangeValue;
    return range.min === "" || range.max === "" || range.min === null || range.max === null;
  }
  return false;
}

function nextValueForOperator(field: CRMFilterField, operator: string, current: RuleValue): RuleValue {
  if (operator === "between" || operator === "between_days") return { min: "", max: "" };
  if (field.kind === "rfm" && (operator === "in" || operator === "not_in")) {
    return Array.isArray(current) ? current : [];
  }
  if (Array.isArray(current) || (current && typeof current === "object")) return "";
  if (field.kind === "date") return "";
  return current;
}

function isMoneyField(fieldId: string) {
  return fieldId === "total_gasto" || fieldId === "ticket_medio";
}

export function SegmentEditor({
  onCancel,
  onSave,
  initialData,
}: {
  onCancel: () => void;
  onSave: () => void;
  initialData?: { id: string; nome: string; descricao: string; regras: any };
}) {
  const runSave = useServerFn(saveSegment);
  const loadFilterOptions = useServerFn(getCRMFilterOptions);
  const [nome, setNome] = useState(initialData?.nome || "");
  const [descricao, setDescricao] = useState(initialData?.descricao || "");
  const [groups, setGroups] = useState<RuleGroup[]>(
    initialData?.regras?.groups || [{ id: "1", type: "AND", conditions: [] }],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);

  useEffect(() => {
    let active = true;
    void loadFilterOptions()
      .then((options) => {
        if (active) setFilterOptions(options as FilterOptions);
      })
      .catch(() => {
        // Sugestões são apenas melhoria de UX; filtros continuam funcionando sem elas.
      });
    return () => { active = false; };
  }, []);

  const addCondition = (groupId: string, category: CRMFilterCategory, field: CRMFilterField) => {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          conditions: [
            ...group.conditions,
            {
              id: crypto.randomUUID(),
              category: category.id,
              field: field.id,
              label: field.label,
              operator: defaultOperatorForField(field),
              value: "",
            },
          ],
        };
      }),
    );
  };

  const removeCondition = (groupId: string, conditionId: string) => {
    setGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, conditions: group.conditions.filter((condition) => condition.id !== conditionId) }
          : group,
      ),
    );
  };

  const updateCondition = (groupId: string, conditionId: string, patch: Partial<RuleCondition>) => {
    setGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              conditions: group.conditions.map((condition) =>
                condition.id === conditionId ? { ...condition, ...patch } : condition,
              ),
            }
          : group,
      ),
    );
  };

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error("Dê um nome ao segmento.");
      return;
    }

    const conditions = groups.flatMap((group) => group.conditions);
    const unsupported = conditions.filter((condition) => !isSupportedCRMFilter(condition.field));
    if (unsupported.length > 0) {
      toast.error("Este segmento possui filtro antigo sem suporte. Remova o filtro marcado antes de salvar.");
      return;
    }

    const incomplete = conditions.find((condition) => isBlank(condition.value));
    if (incomplete) {
      toast.error(`Preencha o valor do filtro “${incomplete.label}”.`);
      return;
    }

    setIsSaving(true);
    try {
      await runSave({
        data: {
          id: initialData?.id,
          nome: nome.trim(),
          descricao: descricao.trim(),
          regras: { groups },
        },
      });
      toast.success(initialData?.id ? "Segmento atualizado com sucesso!" : "Segmento criado com sucesso!");
      onSave();
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err?.message || "erro desconhecido"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const renderValueControl = (groupId: string, condition: RuleCondition, field: CRMFilterField) => {
    const setValue = (value: RuleValue) => updateCondition(groupId, condition.id, { value });

    if (field.id === "estado") {
      return (
        <Select value={String(condition.value || "")} onValueChange={setValue}>
          <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar UF..." /></SelectTrigger>
          <SelectContent>
            {BRAZIL_STATES.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }

    if (field.kind === "status") {
      return (
        <Select value={String(condition.value || "")} onValueChange={setValue}>
          <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar status..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="partially_paid">Parcialmente Pago</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="authorized">Autorizado</SelectItem>
            <SelectItem value="refunded">Reembolsado</SelectItem>
            <SelectItem value="partially_refunded">Parcialmente Reembolsado</SelectItem>
            <SelectItem value="voided">Anulado</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
            <SelectItem value="unpaid">Não Pago</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (field.kind === "rfm") {
      if (condition.operator === "in" || condition.operator === "not_in") {
        const selected = Array.isArray(condition.value) ? condition.value : [];
        const toggle = (segment: string) => {
          const next = selected.includes(segment)
            ? selected.filter((item) => item !== segment)
            : [...selected, segment];
          setValue(next);
        };
        return (
          <div className="flex min-w-[320px] flex-1 flex-wrap gap-1 rounded-md bg-muted/30 p-1.5">
            {(Object.keys(RFM_SEGMENTS_CONFIG) as (keyof typeof RFM_SEGMENTS_CONFIG)[]).map((segment) => (
              <button
                key={segment}
                type="button"
                onClick={() => toggle(segment)}
                className={`rounded border px-2 py-1 text-[10px] transition-colors ${selected.includes(segment) ? "border-brand bg-brand/10 text-brand" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {segment}
              </button>
            ))}
          </div>
        );
      }
      return (
        <Select value={String(condition.value || "")} onValueChange={setValue}>
          <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar segmento..." /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RFM_SEGMENTS_CONFIG) as (keyof typeof RFM_SEGMENTS_CONFIG)[]).map((segment) => (
              <SelectItem key={segment} value={segment}>{segment}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field.kind === "profile") {
      return (
        <Select value={String(condition.value || "")} onValueChange={setValue}>
          <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar perfil..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="carrinho">Checkout Abandonado Ativo</SelectItem>
            <SelectItem value="primeira_compra">Exatamente 1 Compra Válida</SelectItem>
            <SelectItem value="sem_compra">Sem Compra Válida</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (field.kind === "boolean") {
      return (
        <Select value={String(condition.value || "")} onValueChange={setValue}>
          <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sim">Sim</SelectItem>
            <SelectItem value="nao">Não</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (field.kind === "date") {
      if (condition.operator === "between_days") {
        const range = rangeValue(condition.value);
        return (
          <div className="flex flex-1 items-center gap-2">
            <Input type="number" min={0} className="h-8 border-none bg-muted/50 text-xs" placeholder="Mín. dias" value={String(range.min)} onChange={(event) => setValue({ ...range, min: event.target.value })} />
            <span className="text-[11px] text-muted-foreground">até</span>
            <Input type="number" min={0} className="h-8 border-none bg-muted/50 text-xs" placeholder="Máx. dias" value={String(range.max)} onChange={(event) => setValue({ ...range, max: event.target.value })} />
          </div>
        );
      }
      const relativeDays = condition.operator === "last_days" || condition.operator === "older_than_days";
      return (
        <Input
          type={relativeDays ? "number" : "date"}
          min={relativeDays ? 0 : undefined}
          className="h-8 flex-1 border-none bg-muted/50 text-xs"
          placeholder={relativeDays ? "Número de dias" : undefined}
          value={String(condition.value ?? "")}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }

    if (field.kind === "number") {
      const money = isMoneyField(field.id);
      if (condition.operator === "between") {
        const range = rangeValue(condition.value);
        return (
          <div className="flex flex-1 items-center gap-2">
            {money && <span className="text-[11px] text-muted-foreground">R$</span>}
            <Input type="number" step={money ? "0.01" : "1"} className="h-8 border-none bg-muted/50 text-xs" placeholder="Mínimo" value={String(range.min)} onChange={(event) => setValue({ ...range, min: event.target.value })} />
            <span className="text-[11px] text-muted-foreground">até</span>
            {money && <span className="text-[11px] text-muted-foreground">R$</span>}
            <Input type="number" step={money ? "0.01" : "1"} className="h-8 border-none bg-muted/50 text-xs" placeholder="Máximo" value={String(range.max)} onChange={(event) => setValue({ ...range, max: event.target.value })} />
          </div>
        );
      }
      return (
        <div className="flex flex-1 items-center gap-1 rounded-md bg-muted/50 pl-2">
          {money && <span className="text-[11px] text-muted-foreground">R$</span>}
          <Input
            type="number"
            step={money ? "0.01" : "1"}
            className="h-8 flex-1 border-none bg-transparent text-xs shadow-none focus-visible:ring-0"
            placeholder={money ? "0,00" : "Valor numérico..."}
            value={String(condition.value ?? "")}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      );
    }

    const suggestions = field.id === "cidade"
      ? filterOptions.cities
      : field.id === "customer_tag"
        ? filterOptions.customerTags
        : field.id === "tags_custom"
          ? filterOptions.customTags
          : [];
    const listId = suggestions.length > 0 ? `crm-filter-options-${condition.id}` : undefined;

    return (
      <div className="flex-1">
        <Input
          list={listId}
          type="text"
          className="h-8 border-none bg-muted/50 text-xs"
          placeholder={suggestions.length ? "Digite ou escolha uma opção..." : "Valor..."}
          value={String(condition.value ?? "")}
          onChange={(event) => setValue(event.target.value)}
        />
        {listId && (
          <datalist id={listId}>
            {suggestions.map((option) => <option key={option} value={option} />)}
          </datalist>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="size-5" /></Button>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{initialData?.id ? "Editar Segmento" : "Criar Segmento"}</h2>
            <p className="text-sm text-muted-foreground">Defina regras reais para agrupar seus clientes automaticamente.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-brand text-white hover:bg-brand/90">
            {isSaving ? "Salvando..." : <><Save className="size-4" /> Salvar Segmento</>}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <p><strong className="text-foreground">Filtros validados:</strong> o editor mostra somente critérios que já possuem implementação real no CRM. Métricas de compra usam apenas pedidos válidos, seguindo a mesma regra do RFM.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nome">Nome do Segmento</Label>
          <Input id="nome" placeholder="Ex: Clientes VIPs" value={nome} onChange={(event) => setNome(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Descrição (opcional)</Label>
          <Input id="desc" placeholder="Ex: Clientes que gastaram mais de R$ 500" value={descricao} onChange={(event) => setDescricao(event.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 text-lg font-medium">Regras de Segmentação <Badge variant="secondary">Dinâmico</Badge></h3>
        <p className="mb-4 text-xs text-muted-foreground">Dentro de cada grupo usamos E. Entre grupos usamos OU.</p>

        <div className="space-y-6">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className="relative space-y-4">
              {groupIndex > 0 && (
                <div className="relative flex justify-center">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <Badge className="relative z-10 bg-brand px-4 text-white">OU</Badge>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="mb-4"><Badge variant="outline" className="border-brand/20 text-[10px] font-normal uppercase tracking-wider text-brand">Corresponder a TODAS as regras (E)</Badge></div>

                <div className="space-y-3">
                  {group.conditions.map((condition) => {
                    const field = getCRMFilterField(condition.field);
                    if (!field) {
                      return (
                        <div key={condition.id} className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium">Filtro antigo sem suporte: {condition.label || condition.field}</p>
                            <p className="text-[11px] text-muted-foreground">Este critério não é executado pelo motor atual. Remova-o antes de salvar.</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCondition(group.id, condition.id)}><Trash2 className="size-4" /></Button>
                        </div>
                      );
                    }

                    const category = CRM_FILTER_CATEGORIES.find((item) => item.id === condition.category) ?? CRM_FILTER_CATEGORIES.find((item) => item.fields.some((itemField) => itemField.id === field.id));
                    const Icon = category ? CATEGORY_ICONS[category.id] : Users;
                    const operators = operatorsForField(field);

                    return (
                      <div key={condition.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2 pr-3 shadow-sm lg:flex-nowrap">
                        <div className="flex w-full items-center gap-2 lg:w-[250px]">
                          <div className="rounded bg-muted p-1"><Icon className="size-3 text-muted-foreground" /></div>
                          <div className="min-w-0"><p className="truncate text-xs font-medium">{field.label}</p>{field.description && <p className="truncate text-[10px] text-muted-foreground" title={field.description}>{field.description}</p>}</div>
                        </div>

                        <Select
                          value={condition.operator}
                          onValueChange={(operator) => updateCondition(group.id, condition.id, { operator, value: nextValueForOperator(field, operator, condition.value) })}
                        >
                          <SelectTrigger className="h-8 w-[185px] border-none bg-muted/50 text-xs font-medium"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {operators.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}
                          </SelectContent>
                        </Select>

                        {renderValueControl(group.id, condition, field)}

                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => removeCondition(group.id, condition.id)}><Trash2 className="size-4" /></Button>
                      </div>
                    );
                  })}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full gap-2 border-2 border-dashed text-muted-foreground hover:border-brand/50 hover:text-brand"><Plus className="size-4" /> Adicionar Filtro</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-72" align="start">
                      {CRM_FILTER_CATEGORIES.map((category) => {
                        const Icon = CATEGORY_ICONS[category.id];
                        return (
                          <DropdownMenuSub key={category.id}>
                            <DropdownMenuSubTrigger className="gap-2"><Icon className="size-4" /><span>{category.label}</span></DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="w-80">
                                {category.fields.map((field) => (
                                  <DropdownMenuItem key={field.id} onClick={() => addCondition(group.id, category, field)}>
                                    <div><p>{field.label}</p>{field.description && <p className="max-w-72 text-[10px] text-muted-foreground">{field.description}</p>}</div>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}

          <Button variant="ghost" className="w-full gap-2 border border-dashed border-brand/30 text-brand hover:bg-brand/5 hover:text-brand" onClick={() => setGroups((prev) => [...prev, { id: crypto.randomUUID(), type: "OR", conditions: [] }])}>
            <Plus className="size-4" /> Adicionar novo grupo de regras (OU)
          </Button>
        </div>
      </div>
    </div>
  );
}
