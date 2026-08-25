import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  MessageSquare,
  Plus,
  Save,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { RFM_SEGMENTS_CONFIG } from "@/lib/crm-rfm-shared";
import {
  BRAZIL_STATES,
  CRM_FILTER_CATEGORIES,
  getCRMFilterField,
  isSupportedCRMFilter,
  validateCRMFilterCondition,
  type CRMFilterCategory,
  type CRMFilterField,
} from "@/lib/crm-filter-catalog";
import { CRM_SEGMENT_TEMPLATES } from "@/lib/crm-segment-templates";
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
import { getCRMFilterOptions, previewSegmentAudience, saveSegment } from "@/lib/crm-segmentation.functions";
import { toast } from "sonner";

type RangeValue = { min: string | number; max: string | number };
type ProductMetricValue = {
  productId: string;
  amount?: string | number;
  min?: string | number;
  max?: string | number;
  days?: string | number;
  sku?: string;
};
type TaxonomyMetricValue = {
  taxonomyValue: string;
  amount?: string | number;
  min?: string | number;
  max?: string | number;
  days?: string | number;
};
type PeriodMetricValue = {
  days: string | number;
  amount?: string | number;
  min?: string | number;
  max?: string | number;
};
type RuleValue = string | number | boolean | string[] | RangeValue | ProductMetricValue | TaxonomyMetricValue | PeriodMetricValue;
type RuleCondition = { id: string; category: string; field: string; operator: string; value: RuleValue; label: string };
type RuleGroup = { id: string; type: "AND" | "OR"; conditions: RuleCondition[] };
type ProductOption = { id: string; title: string; skus: string[] };
type NamedOption = { id: string; name: string };
type CollectionOption = { id: string; title: string };
type FilterOptions = {
  cities: string[];
  customerTags: string[];
  customTags: string[];
  products: ProductOption[];
  productTypes: string[];
  collections: CollectionOption[];
  campaigns: NamedOption[];
  automations: NamedOption[];
};
type AudiencePreview = {
  count: number;
  totalContacts: number;
  sample: Array<{ id: string; name: string; email: string | null }>;
};

const EMPTY_FILTER_OPTIONS: FilterOptions = {
  cities: [],
  customerTags: [],
  customTags: [],
  products: [],
  productTypes: [],
  collections: [],
  campaigns: [],
  automations: [],
};

const CATEGORY_ICONS: Record<CRMFilterCategory["id"], typeof Users> = {
  pessoais: Users,
  comportamento: ShoppingCart,
  produtos: ShoppingCart,
  marketing: MessageSquare,
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
    { label: "Maior ou igual a", value: "gte" },
    { label: "Menor que", value: "lt" },
    { label: "Menor ou igual a", value: "lte" },
    { label: "Igual a", value: "eq" },
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
  relativeDate: [
    { label: "Nos últimos X dias", value: "last_days" },
    { label: "Há mais de X dias", value: "older_than_days" },
    { label: "Entre X e Y dias atrás", value: "between_days" },
  ],
  rfm: [
    { label: "É igual a", value: "eq" },
    { label: "Não é igual a", value: "neq" },
    { label: "É um dos", value: "in" },
    { label: "Não é nenhum dos", value: "not_in" },
  ],
  bought: [
    { label: "Comprou", value: "bought" },
    { label: "Não comprou", value: "not_bought" },
  ],
  campaign: [
    { label: "Foi enviada", value: "sent" },
    { label: "Não foi enviada", value: "not_sent" },
    { label: "Foi entregue", value: "delivered" },
    { label: "Não foi entregue", value: "not_delivered" },
    { label: "Foi lida", value: "read" },
    { label: "Não foi lida", value: "not_read" },
    { label: "Teve falha", value: "failed" },
    { label: "Não teve falha", value: "not_failed" },
  ],
  automation: [
    { label: "Entrou", value: "entered" },
    { label: "Não entrou", value: "not_entered" },
    { label: "Concluiu", value: "completed" },
    { label: "Não concluiu", value: "not_completed" },
  ],
} as const;

function operatorsForField(field: CRMFilterField) {
  if (field.id === "estado") return OPERATORS.exact;
  if (["number", "product_number", "product_money", "period_number", "period_money", "product_taxonomy_number", "product_taxonomy_money"].includes(field.kind)) return OPERATORS.number;
  if (field.kind === "date") return OPERATORS.date;
  if (field.kind === "product_date" || field.kind === "product_taxonomy_date") return OPERATORS.relativeDate;
  if (field.kind === "rfm") return OPERATORS.rfm;
  if (field.kind === "product" || field.kind === "product_sku" || field.kind === "product_taxonomy") return OPERATORS.bought;
  if (field.kind === "campaign_behavior") return OPERATORS.campaign;
  if (field.kind === "automation_behavior") return OPERATORS.automation;
  if (["boolean", "status", "profile"].includes(field.kind)) return OPERATORS.exact;
  return OPERATORS.string;
}

function defaultOperatorForField(field: CRMFilterField) {
  if (field.kind === "date") return "on";
  if (["product", "product_sku", "product_taxonomy"].includes(field.kind)) return "bought";
  if (field.kind === "product_date" || field.kind === "product_taxonomy_date") return "last_days";
  if (["product_number", "product_money", "period_number", "period_money", "product_taxonomy_number", "product_taxonomy_money"].includes(field.kind)) return "gte";
  if (field.kind === "campaign_behavior") return "sent";
  if (field.kind === "automation_behavior") return "entered";
  return "eq";
}

function initialValueForField(field: CRMFilterField): RuleValue {
  if (field.kind === "product_date") return { productId: "", days: "" };
  if (field.kind === "product_number" || field.kind === "product_money") return { productId: "", amount: "" };
  if (field.kind === "product_sku") return { productId: "", sku: "" };
  if (field.kind === "product_taxonomy_date") return { taxonomyValue: "", days: "" };
  if (field.kind === "product_taxonomy_number" || field.kind === "product_taxonomy_money") return { taxonomyValue: "", amount: "" };
  if (field.kind === "period_number" || field.kind === "period_money") return { days: 30, amount: "" };
  return "";
}

function rangeValue(value: RuleValue): RangeValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = value as Partial<RangeValue>;
    return { min: raw.min ?? "", max: raw.max ?? "" };
  }
  return { min: "", max: "" };
}

function productMetricValue(value: RuleValue): ProductMetricValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = value as ProductMetricValue;
    return { ...raw, productId: String(raw.productId ?? "") };
  }
  return { productId: "" };
}

function taxonomyMetricValue(value: RuleValue): TaxonomyMetricValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = value as TaxonomyMetricValue;
    return { ...raw, taxonomyValue: String(raw.taxonomyValue ?? "") };
  }
  return { taxonomyValue: "" };
}

function periodMetricValue(value: RuleValue): PeriodMetricValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = value as PeriodMetricValue;
    return { ...raw, days: raw.days ?? 30 };
  }
  return { days: 30, amount: "" };
}

function nextValueForOperator(field: CRMFilterField, operator: string, current: RuleValue): RuleValue {
  if (field.kind === "product_date") {
    const base = productMetricValue(current);
    return operator === "between_days" ? { productId: base.productId, min: "", max: "" } : { productId: base.productId, days: "" };
  }
  if (field.kind === "product_taxonomy_date") {
    const base = taxonomyMetricValue(current);
    return operator === "between_days"
      ? { taxonomyValue: base.taxonomyValue, min: "", max: "" }
      : { taxonomyValue: base.taxonomyValue, days: "" };
  }
  if (field.kind === "product_number" || field.kind === "product_money") {
    const base = productMetricValue(current);
    return operator === "between" ? { productId: base.productId, min: "", max: "" } : { productId: base.productId, amount: "" };
  }
  if (field.kind === "product_taxonomy_number" || field.kind === "product_taxonomy_money") {
    const base = taxonomyMetricValue(current);
    return operator === "between" ? { taxonomyValue: base.taxonomyValue, min: "", max: "" } : { taxonomyValue: base.taxonomyValue, amount: "" };
  }
  if (field.kind === "period_number" || field.kind === "period_money") {
    const base = periodMetricValue(current);
    return operator === "between" ? { days: base.days, min: "", max: "" } : { days: base.days, amount: "" };
  }
  if (operator === "between" || operator === "between_days") return { min: "", max: "" };
  if (field.kind === "rfm" && (operator === "in" || operator === "not_in")) return Array.isArray(current) ? current : [];
  if (field.kind === "product" || field.kind === "product_taxonomy" || field.kind === "campaign_behavior" || field.kind === "automation_behavior") return typeof current === "string" ? current : "";
  if (field.kind === "product_sku") return productMetricValue(current);
  if (Array.isArray(current) || (current && typeof current === "object")) return "";
  if (field.kind === "date") return "";
  return current;
}

function isMoneyField(field: CRMFilterField) {
  return field.id === "total_gasto" || field.id === "ticket_medio" || field.kind === "product_money" || field.kind === "period_money" || field.kind === "product_taxonomy_money";
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function SegmentEditor({ onCancel, onSave, initialData }: {
  onCancel: () => void;
  onSave: () => void;
  initialData?: { id: string; nome: string; descricao: string; regras: any };
}) {
  const runSave = useServerFn(saveSegment);
  const runPreview = useServerFn(previewSegmentAudience);
  const loadFilterOptions = useServerFn(getCRMFilterOptions);
  const [nome, setNome] = useState(initialData?.nome || "");
  const [descricao, setDescricao] = useState(initialData?.descricao || "");
  const [groups, setGroups] = useState<RuleGroup[]>(initialData?.regras?.groups || [{ id: "1", type: "AND", conditions: [] }]);
  const [isSaving, setIsSaving] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);
  const [filterSearch, setFilterSearch] = useState("");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("Adicione filtros válidos para calcular a audiência.");

  useEffect(() => {
    let active = true;
    void loadFilterOptions()
      .then((options) => { if (active) setFilterOptions(options as FilterOptions); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const conditions = groups.flatMap((group) => group.conditions);
    if (conditions.length === 0) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewMessage("Adicione filtros válidos para calcular a audiência.");
      return;
    }
    const invalid = conditions.find((condition) => validateCRMFilterCondition(condition));
    if (invalid) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewMessage("Complete os valores dos filtros para calcular a audiência.");
      return;
    }

    setPreviewLoading(true);
    setPreviewMessage("Calculando audiência...");
    let active = true;
    const timer = window.setTimeout(() => {
      void runPreview({ data: { regras: { groups }, sampleSize: 5 } })
        .then((result) => {
          if (!active) return;
          setPreview(result as AudiencePreview);
          setPreviewMessage("");
        })
        .catch(() => {
          if (!active) return;
          setPreview(null);
          setPreviewMessage("Não foi possível calcular a prévia agora.");
        })
        .finally(() => { if (active) setPreviewLoading(false); });
    }, 650);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [groups]);

  const addCondition = (groupId: string, category: CRMFilterCategory, field: CRMFilterField) => {
    setGroups((prev) => prev.map((group) => group.id !== groupId ? group : ({
      ...group,
      conditions: [...group.conditions, {
        id: crypto.randomUUID(),
        category: category.id,
        field: field.id,
        label: field.label,
        operator: defaultOperatorForField(field),
        value: initialValueForField(field),
      }],
    })));
    setFilterSearch("");
  };

  const removeCondition = (groupId: string, conditionId: string) => setGroups((prev) => prev.map((group) =>
    group.id === groupId ? { ...group, conditions: group.conditions.filter((condition) => condition.id !== conditionId) } : group,
  ));

  const updateCondition = (groupId: string, conditionId: string, patch: Partial<RuleCondition>) => setGroups((prev) => prev.map((group) =>
    group.id === groupId ? { ...group, conditions: group.conditions.map((condition) => condition.id === conditionId ? { ...condition, ...patch } : condition) } : group,
  ));

  const applyTemplate = (templateId: string) => {
    const template = CRM_SEGMENT_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const conditions: RuleCondition[] = template.conditions.flatMap((condition) => {
      const field = getCRMFilterField(condition.field);
      if (!field) return [];
      const category = CRM_FILTER_CATEGORIES.find((item) => item.fields.some((candidate) => candidate.id === field.id));
      if (!category) return [];
      return [{
        id: crypto.randomUUID(),
        category: category.id,
        field: field.id,
        label: field.label,
        operator: condition.operator,
        value: JSON.parse(JSON.stringify(condition.value)) as RuleValue,
      }];
    });
    setGroups([{ id: crypto.randomUUID(), type: "AND", conditions }]);
    setNome(template.name);
    setDescricao(template.description);
    toast.success("Modelo aplicado. Você pode ajustar os filtros antes de salvar.");
  };

  const handleSave = async () => {
    if (!nome.trim()) return void toast.error("Dê um nome ao segmento.");
    const conditions = groups.flatMap((group) => group.conditions);
    if (conditions.length === 0) return void toast.error("Adicione pelo menos um filtro ao segmento.");
    if (conditions.some((condition) => !isSupportedCRMFilter(condition.field))) {
      return void toast.error("Este segmento possui filtro antigo sem suporte. Remova o filtro marcado antes de salvar.");
    }
    const invalid = conditions.map((condition) => ({ condition, error: validateCRMFilterCondition(condition) })).find((item) => item.error);
    if (invalid) return void toast.error(`${invalid.condition.label}: ${invalid.error}`);

    setIsSaving(true);
    try {
      await runSave({ data: { id: initialData?.id, nome: nome.trim(), descricao: descricao.trim(), regras: { groups } } });
      toast.success(initialData?.id ? "Segmento atualizado com sucesso!" : "Segmento criado com sucesso!");
      onSave();
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err?.message || "erro desconhecido"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const renderNumericInputs = (
    value: { amount?: string | number; min?: string | number; max?: string | number },
    setValue: (next: any) => void,
    money: boolean,
  ) => conditionNumericControls(value, setValue, money);

  const conditionNumericControls = (
    value: { amount?: string | number; min?: string | number; max?: string | number },
    setValue: (next: any) => void,
    money: boolean,
  ) => {
    const activeOperator = currentRenderingCondition?.operator ?? "eq";
    if (activeOperator === "between") {
      return <>
        {money && <span className="text-[11px] text-muted-foreground">R$</span>}
        <Input type="number" min={0} step={money ? "0.01" : "1"} className="h-8 w-24 border-none bg-muted/50 text-xs" placeholder="Mínimo" value={String(value.min ?? "")} onChange={(event) => setValue({ ...value, min: event.target.value })} />
        <span className="text-[11px] text-muted-foreground">até</span>
        {money && <span className="text-[11px] text-muted-foreground">R$</span>}
        <Input type="number" min={0} step={money ? "0.01" : "1"} className="h-8 w-24 border-none bg-muted/50 text-xs" placeholder="Máximo" value={String(value.max ?? "")} onChange={(event) => setValue({ ...value, max: event.target.value })} />
      </>;
    }
    return <>
      {money && <span className="text-[11px] text-muted-foreground">R$</span>}
      <Input type="number" min={0} step={money ? "0.01" : "1"} className="h-8 w-28 border-none bg-muted/50 text-xs" placeholder={money ? "0,00" : "Quantidade"} value={String(value.amount ?? "")} onChange={(event) => setValue({ ...value, amount: event.target.value })} />
    </>;
  };

  let currentRenderingCondition: RuleCondition | null = null;

  const renderValueControl = (groupId: string, condition: RuleCondition, field: CRMFilterField) => {
    currentRenderingCondition = condition;
    const setValue = (value: RuleValue) => updateCondition(groupId, condition.id, { value });
    const productSelect = (selectedProductId: string, onSelect: (productId: string) => void) => (
      <Select value={selectedProductId} onValueChange={onSelect}>
        <SelectTrigger className="h-8 min-w-[260px] flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar produto..." /></SelectTrigger>
        <SelectContent className="max-h-[360px]">
          {filterOptions.products.map((product) => <SelectItem key={product.id} value={product.id}>{product.title}{product.skus.length ? ` · SKU ${product.skus.slice(0, 2).join(", ")}` : ""}</SelectItem>)}
        </SelectContent>
      </Select>
    );
    const taxonomyOptions = (fieldId: string) => fieldId.startsWith("categoria_")
      ? filterOptions.productTypes.map((value) => ({ id: value, title: value }))
      : filterOptions.collections;
    const taxonomySelect = (fieldId: string, selected: string, onSelect: (value: string) => void) => {
      const options = taxonomyOptions(fieldId);
      const category = fieldId.startsWith("categoria_");
      return <Select value={selected} onValueChange={onSelect}>
        <SelectTrigger className="h-8 min-w-[280px] flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder={category ? "Selecionar categoria/tipo..." : "Selecionar coleção..."} /></SelectTrigger>
        <SelectContent className="max-h-[360px]">{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.title}</SelectItem>)}</SelectContent>
      </Select>;
    };

    if (field.id === "estado") return (
      <Select value={String(condition.value || "")} onValueChange={setValue}>
        <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar UF..." /></SelectTrigger>
        <SelectContent>{BRAZIL_STATES.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
      </Select>
    );

    if (field.kind === "campaign_behavior") return (
      <Select value={String(condition.value || "")} onValueChange={setValue}>
        <SelectTrigger className="h-8 min-w-[300px] flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar campanha..." /></SelectTrigger>
        <SelectContent className="max-h-[360px]">{filterOptions.campaigns.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent>
      </Select>
    );

    if (field.kind === "automation_behavior") return (
      <Select value={String(condition.value || "")} onValueChange={setValue}>
        <SelectTrigger className="h-8 min-w-[300px] flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar automação..." /></SelectTrigger>
        <SelectContent className="max-h-[360px]">{filterOptions.automations.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent>
      </Select>
    );

    if (field.kind === "period_number" || field.kind === "period_money") {
      const value = periodMetricValue(condition.value);
      return <div className="flex min-w-[470px] flex-1 items-center gap-2">
        <span className="text-[11px] text-muted-foreground">últimos</span>
        <Input type="number" min={0} className="h-8 w-20 border-none bg-muted/50 text-xs" placeholder="Dias" value={String(value.days ?? "")} onChange={(event) => setValue({ ...value, days: event.target.value })} />
        <span className="text-[11px] text-muted-foreground">dias</span>
        {renderNumericInputs(value, setValue, field.kind === "period_money")}
      </div>;
    }

    if (field.kind === "product_taxonomy") return taxonomySelect(field.id, String(condition.value || ""), setValue);

    if (field.kind === "product_taxonomy_date") {
      const value = taxonomyMetricValue(condition.value);
      return <div className="flex min-w-[500px] flex-1 items-center gap-2">
        {taxonomySelect(field.id, value.taxonomyValue, (taxonomyValue) => setValue({ ...value, taxonomyValue }))}
        {condition.operator === "between_days" ? <>
          <Input type="number" min={0} className="h-8 w-24 border-none bg-muted/50 text-xs" placeholder="Mín. dias" value={String(value.min ?? "")} onChange={(event) => setValue({ ...value, min: event.target.value })} />
          <span className="text-[11px] text-muted-foreground">até</span>
          <Input type="number" min={0} className="h-8 w-24 border-none bg-muted/50 text-xs" placeholder="Máx. dias" value={String(value.max ?? "")} onChange={(event) => setValue({ ...value, max: event.target.value })} />
        </> : <Input type="number" min={0} className="h-8 w-28 border-none bg-muted/50 text-xs" placeholder="Dias" value={String(value.days ?? "")} onChange={(event) => setValue({ ...value, days: event.target.value })} />}
      </div>;
    }

    if (field.kind === "product_taxonomy_number" || field.kind === "product_taxonomy_money") {
      const value = taxonomyMetricValue(condition.value);
      return <div className="flex min-w-[520px] flex-1 items-center gap-2">
        {taxonomySelect(field.id, value.taxonomyValue, (taxonomyValue) => setValue({ ...value, taxonomyValue }))}
        {renderNumericInputs(value, setValue, field.kind === "product_taxonomy_money")}
      </div>;
    }

    if (field.kind === "product") return productSelect(String(condition.value || ""), setValue);

    if (field.kind === "product_date") {
      const value = productMetricValue(condition.value);
      return <div className="flex min-w-[480px] flex-1 items-center gap-2">
        {productSelect(value.productId, (productId) => setValue({ ...value, productId }))}
        {condition.operator === "between_days" ? <>
          <Input type="number" min={0} className="h-8 w-24 border-none bg-muted/50 text-xs" placeholder="Mín. dias" value={String(value.min ?? "")} onChange={(event) => setValue({ ...value, min: event.target.value })} />
          <span className="text-[11px] text-muted-foreground">até</span>
          <Input type="number" min={0} className="h-8 w-24 border-none bg-muted/50 text-xs" placeholder="Máx. dias" value={String(value.max ?? "")} onChange={(event) => setValue({ ...value, max: event.target.value })} />
        </> : <Input type="number" min={0} className="h-8 w-28 border-none bg-muted/50 text-xs" placeholder="Dias" value={String(value.days ?? "")} onChange={(event) => setValue({ ...value, days: event.target.value })} />}
      </div>;
    }

    if (field.kind === "product_number" || field.kind === "product_money") {
      const value = productMetricValue(condition.value);
      return <div className="flex min-w-[520px] flex-1 items-center gap-2">
        {productSelect(value.productId, (productId) => setValue({ ...value, productId }))}
        {renderNumericInputs(value, setValue, field.kind === "product_money")}
      </div>;
    }

    if (field.kind === "product_sku") {
      const value = productMetricValue(condition.value);
      const options = filterOptions.products.flatMap((product) => product.skus.map((sku) => ({ productId: product.id, title: product.title, sku })));
      const encoded = value.productId && value.sku ? `${value.productId}::${value.sku}` : "";
      return <Select value={encoded} onValueChange={(selected) => {
        const separator = selected.indexOf("::");
        setValue({ productId: selected.slice(0, separator), sku: selected.slice(separator + 2) });
      }}>
        <SelectTrigger className="h-8 min-w-[360px] flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar SKU / variação..." /></SelectTrigger>
        <SelectContent className="max-h-[360px]">{options.map((option) => <SelectItem key={`${option.productId}:${option.sku}`} value={`${option.productId}::${option.sku}`}>{option.title} · SKU {option.sku}</SelectItem>)}</SelectContent>
      </Select>;
    }

    if (field.kind === "status") return <Select value={String(condition.value || "")} onValueChange={setValue}>
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
    </Select>;

    if (field.kind === "rfm") {
      if (condition.operator === "in" || condition.operator === "not_in") {
        const selected = Array.isArray(condition.value) ? condition.value : [];
        return <div className="flex min-w-[320px] flex-1 flex-wrap gap-1 rounded-md bg-muted/30 p-1.5">{Object.keys(RFM_SEGMENTS_CONFIG).map((segment) => <button key={segment} type="button" onClick={() => setValue(selected.includes(segment) ? selected.filter((item) => item !== segment) : [...selected, segment])} className={`rounded border px-2 py-1 text-[10px] ${selected.includes(segment) ? "border-brand bg-brand/10 text-brand" : "border-border bg-background text-muted-foreground"}`}>{segment}</button>)}</div>;
      }
      return <Select value={String(condition.value || "")} onValueChange={setValue}>
        <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar segmento..." /></SelectTrigger>
        <SelectContent>{Object.keys(RFM_SEGMENTS_CONFIG).map((segment) => <SelectItem key={segment} value={segment}>{segment}</SelectItem>)}</SelectContent>
      </Select>;
    }

    if (field.kind === "profile") return <Select value={String(condition.value || "")} onValueChange={setValue}>
      <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar perfil..." /></SelectTrigger>
      <SelectContent>
        <SelectItem value="carrinho">Checkout Abandonado Ativo</SelectItem>
        <SelectItem value="primeira_compra">Exatamente 1 Compra Válida</SelectItem>
        <SelectItem value="sem_compra">Sem Compra Válida</SelectItem>
      </SelectContent>
    </Select>;

    if (field.kind === "boolean") return <Select value={String(condition.value || "")} onValueChange={setValue}>
      <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
      <SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent>
    </Select>;

    if (field.kind === "date") {
      if (condition.operator === "between_days") {
        const range = rangeValue(condition.value);
        return <div className="flex flex-1 items-center gap-2">
          <Input type="number" min={0} className="h-8 border-none bg-muted/50 text-xs" placeholder="Mín. dias" value={String(range.min)} onChange={(event) => setValue({ ...range, min: event.target.value })} />
          <span className="text-[11px] text-muted-foreground">até</span>
          <Input type="number" min={0} className="h-8 border-none bg-muted/50 text-xs" placeholder="Máx. dias" value={String(range.max)} onChange={(event) => setValue({ ...range, max: event.target.value })} />
        </div>;
      }
      const relative = condition.operator === "last_days" || condition.operator === "older_than_days";
      return <Input type={relative ? "number" : "date"} min={relative ? 0 : undefined} className="h-8 flex-1 border-none bg-muted/50 text-xs" value={String(condition.value ?? "")} onChange={(event) => setValue(event.target.value)} />;
    }

    if (field.kind === "number") {
      const money = isMoneyField(field);
      if (condition.operator === "between") {
        const range = rangeValue(condition.value);
        return <div className="flex flex-1 items-center gap-2">
          {money && <span className="text-[11px] text-muted-foreground">R$</span>}
          <Input type="number" step={money ? "0.01" : "1"} className="h-8 border-none bg-muted/50 text-xs" placeholder="Mínimo" value={String(range.min)} onChange={(event) => setValue({ ...range, min: event.target.value })} />
          <span className="text-[11px] text-muted-foreground">até</span>
          {money && <span className="text-[11px] text-muted-foreground">R$</span>}
          <Input type="number" step={money ? "0.01" : "1"} className="h-8 border-none bg-muted/50 text-xs" placeholder="Máximo" value={String(range.max)} onChange={(event) => setValue({ ...range, max: event.target.value })} />
        </div>;
      }
      return <Input type="number" step={money ? "0.01" : "1"} className="h-8 flex-1 border-none bg-muted/50 text-xs" placeholder={money ? "R$ 0,00" : "Valor numérico..."} value={String(condition.value ?? "")} onChange={(event) => setValue(event.target.value)} />;
    }

    const suggestions = field.id === "cidade" ? filterOptions.cities : field.id === "customer_tag" ? filterOptions.customerTags : field.id === "tags_custom" ? filterOptions.customTags : [];
    const listId = suggestions.length ? `crm-filter-options-${condition.id}` : undefined;
    return <div className="flex-1">
      <Input list={listId} className="h-8 border-none bg-muted/50 text-xs" placeholder={suggestions.length ? "Digite ou escolha uma opção..." : "Valor..."} value={String(condition.value ?? "")} onChange={(event) => setValue(event.target.value)} />
      {listId && <datalist id={listId}>{suggestions.map((option) => <option key={option} value={option} />)}</datalist>}
    </div>;
  };

  const searchTerm = normalizeSearch(filterSearch);
  const searchResults = searchTerm
    ? CRM_FILTER_CATEGORIES.flatMap((category) => category.fields.map((field) => ({ category, field })))
        .filter(({ category, field }) => normalizeSearch(`${category.label} ${field.label} ${field.description ?? ""} ${field.id}`).includes(searchTerm))
    : [];

  return <div className="space-y-6">
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
        <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-brand text-white hover:bg-brand/90">{isSaving ? "Salvando..." : <><Save className="size-4" /> Salvar Segmento</>}</Button>
      </div>
    </div>

    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-muted-foreground">
      <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /><p><strong className="text-foreground">Filtros validados:</strong> compras, produtos, categorias, coleções, campanhas e automações usam fontes reais do CRM. Métricas de compra seguem somente pedidos válidos.</p></div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="nome">Nome do Segmento</Label><Input id="nome" placeholder="Ex: 3+ compras nos últimos 60 dias" value={nome} onChange={(event) => setNome(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="desc">Descrição (opcional)</Label><Input id="desc" value={descricao} onChange={(event) => setDescricao(event.target.value)} /></div>
    </div>

    {!initialData?.id && <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><Sparkles className="size-4 text-brand" /><div><h3 className="text-sm font-semibold">Modelos rápidos</h3><p className="text-xs text-muted-foreground">Comece com um segmento pronto e ajuste se quiser.</p></div></div>
      <div className="flex flex-wrap gap-2">{CRM_SEGMENT_TEMPLATES.map((template) => <Button key={template.id} type="button" variant="outline" size="sm" className="h-auto whitespace-normal py-2 text-left" onClick={() => applyTemplate(template.id)}>{template.name}</Button>)}</div>
    </div>}

    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-lg font-medium">Regras de Segmentação <Badge variant="secondary">Dinâmico</Badge></h3><p className="mt-1 text-xs text-muted-foreground">Dentro de cada grupo usamos E. Entre grupos usamos OU.</p></div>
        <div className="min-w-[260px] rounded-lg border bg-muted/20 px-3 py-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prévia da audiência</p>
          {previewLoading ? <p className="text-sm font-semibold">Calculando...</p> : preview ? <><p className="text-lg font-semibold">{preview.count.toLocaleString("pt-BR")} clientes</p><p className="text-[10px] text-muted-foreground">de {preview.totalContacts.toLocaleString("pt-BR")} contatos</p></> : <p className="max-w-[260px] text-xs text-muted-foreground">{previewMessage}</p>}
        </div>
      </div>
      {preview?.sample?.length ? <div className="mb-4 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><strong className="text-foreground">Exemplos:</strong> {preview.sample.map((item) => item.name).join(", ")}</div> : null}

      <div className="space-y-6">
        {groups.map((group, groupIndex) => <div key={group.id} className="relative space-y-4">
          {groupIndex > 0 && <div className="relative flex justify-center"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div><Badge className="relative z-10 bg-brand px-4 text-white">OU</Badge></div>}
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="mb-4"><Badge variant="outline" className="border-brand/20 text-[10px] font-normal uppercase tracking-wider text-brand">Corresponder a TODAS as regras (E)</Badge></div>
            <div className="space-y-3">
              {group.conditions.map((condition) => {
                const field = getCRMFilterField(condition.field);
                if (!field) return <div key={condition.id} className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3"><AlertTriangle className="size-4 text-amber-600" /><div className="flex-1"><p className="text-xs font-medium">Filtro antigo sem suporte: {condition.label || condition.field}</p></div><Button variant="ghost" size="icon" onClick={() => removeCondition(group.id, condition.id)}><Trash2 className="size-4" /></Button></div>;
                const category = CRM_FILTER_CATEGORIES.find((item) => item.id === condition.category) ?? CRM_FILTER_CATEGORIES.find((item) => item.fields.some((candidate) => candidate.id === field.id));
                const Icon = category ? CATEGORY_ICONS[category.id] : Users;
                return <div key={condition.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2 pr-3 shadow-sm lg:flex-nowrap">
                  <div className="flex w-full items-center gap-2 lg:w-[250px]"><div className="rounded bg-muted p-1"><Icon className="size-3 text-muted-foreground" /></div><div className="min-w-0"><p className="truncate text-xs font-medium">{field.label}</p>{field.description && <p className="truncate text-[10px] text-muted-foreground" title={field.description}>{field.description}</p>}</div></div>
                  <Select value={condition.operator} onValueChange={(operator) => updateCondition(group.id, condition.id, { operator, value: nextValueForOperator(field, operator, condition.value) })}>
                    <SelectTrigger className="h-8 w-[185px] border-none bg-muted/50 text-xs font-medium"><SelectValue /></SelectTrigger>
                    <SelectContent>{operatorsForField(field).map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {renderValueControl(group.id, condition, field)}
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCondition(group.id, condition.id)}><Trash2 className="size-4" /></Button>
                </div>;
              })}

              <DropdownMenu onOpenChange={(open) => { if (!open) setFilterSearch(""); }}>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="w-full gap-2 border-2 border-dashed text-muted-foreground"><Plus className="size-4" /> Adicionar Filtro</Button></DropdownMenuTrigger>
                <DropdownMenuContent className="w-[360px]" align="start">
                  <div className="p-2" onKeyDown={(event) => event.stopPropagation()}>
                    <div className="relative"><Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" /><Input autoFocus className="h-8 pl-7 text-xs" placeholder="Buscar filtro: produto, RFM, campanha..." value={filterSearch} onChange={(event) => setFilterSearch(event.target.value)} /></div>
                  </div>
                  {searchTerm ? (
                    searchResults.length ? searchResults.map(({ category, field }) => {
                      const Icon = CATEGORY_ICONS[category.id];
                      return <DropdownMenuItem key={`${category.id}-${field.id}`} onClick={() => addCondition(group.id, category, field)}><Icon className="mr-2 size-4 text-muted-foreground" /><div><p>{field.label}</p><p className="text-[10px] text-muted-foreground">{category.label}</p></div></DropdownMenuItem>;
                    }) : <div className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum filtro encontrado.</div>
                  ) : CRM_FILTER_CATEGORIES.map((category) => {
                    const Icon = CATEGORY_ICONS[category.id];
                    return <DropdownMenuSub key={category.id}>
                      <DropdownMenuSubTrigger className="gap-2"><Icon className="size-4" /><span>{category.label}</span></DropdownMenuSubTrigger>
                      <DropdownMenuPortal><DropdownMenuSubContent className="w-80">{category.fields.map((field) => <DropdownMenuItem key={field.id} onClick={() => addCondition(group.id, category, field)}><div><p>{field.label}</p>{field.description && <p className="max-w-72 text-[10px] text-muted-foreground">{field.description}</p>}</div></DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuPortal>
                    </DropdownMenuSub>;
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>)}
        <Button variant="ghost" className="w-full gap-2 border border-dashed border-brand/30 text-brand" onClick={() => setGroups((prev) => [...prev, { id: crypto.randomUUID(), type: "OR", conditions: [] }])}><Plus className="size-4" /> Adicionar novo grupo de regras (OU)</Button>
      </div>
    </div>
  </div>;
}
