import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
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
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Menu from "@mui/material/Menu";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
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
  if (["boolean", "status", "fulfillment_status", "profile"].includes(field.kind)) return OPERATORS.exact;
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
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Estilo compacto reaproveitado em todos os inputs/selects de valor de condição.
const compactFieldSx = { "& .MuiInputBase-root": { height: 32, fontSize: 12, bgcolor: "action.hover" }, "& fieldset": { border: "none" } };

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
  const [addFilterAnchor, setAddFilterAnchor] = useState<{ el: HTMLElement; groupId: string } | null>(null);
  const [menuCategory, setMenuCategory] = useState<CRMFilterCategory | null>(null);

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

  const closeAddFilterMenu = () => {
    setAddFilterAnchor(null);
    setFilterSearch("");
    setMenuCategory(null);
  };

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
    closeAddFilterMenu();
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

  const conditionNumericControls = (
    value: { amount?: string | number; min?: string | number; max?: string | number },
    setValue: (next: any) => void,
    money: boolean,
    operator: string,
  ) => {
    if (operator === "between") {
      return (
        <>
          {money && <Typography variant="caption" color="text.secondary">R$</Typography>}
          <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 96 }} slotProps={{ htmlInput: { min: 0, step: money ? "0.01" : "1" } }} placeholder="Mínimo" value={String(value.min ?? "")} onChange={(event) => setValue({ ...value, min: event.target.value })} />
          <Typography variant="caption" color="text.secondary">até</Typography>
          {money && <Typography variant="caption" color="text.secondary">R$</Typography>}
          <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 96 }} slotProps={{ htmlInput: { min: 0, step: money ? "0.01" : "1" } }} placeholder="Máximo" value={String(value.max ?? "")} onChange={(event) => setValue({ ...value, max: event.target.value })} />
        </>
      );
    }
    return (
      <>
        {money && <Typography variant="caption" color="text.secondary">R$</Typography>}
        <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 112 }} slotProps={{ htmlInput: { min: 0, step: money ? "0.01" : "1" } }} placeholder={money ? "0,00" : "Quantidade"} value={String(value.amount ?? "")} onChange={(event) => setValue({ ...value, amount: event.target.value })} />
      </>
    );
  };

  const renderValueControl = (groupId: string, condition: RuleCondition, field: CRMFilterField) => {
    const setValue = (value: RuleValue) => updateCondition(groupId, condition.id, { value });
    const productSelect = (selectedProductId: string, onSelect: (productId: string) => void) => (
      <Select size="small" displayEmpty sx={{ ...compactFieldSx, minWidth: 260, flex: 1 }} value={selectedProductId} onChange={(e) => onSelect(e.target.value)}>
        <MenuItem value=""><em>Selecionar produto...</em></MenuItem>
        {filterOptions.products.map((product) => (
          <MenuItem key={product.id} value={product.id}>{product.title}{product.skus.length ? ` · SKU ${product.skus.slice(0, 2).join(", ")}` : ""}</MenuItem>
        ))}
      </Select>
    );
    const taxonomyOptions = (fieldId: string) => fieldId.startsWith("categoria_")
      ? filterOptions.productTypes.map((value) => ({ id: value, title: value }))
      : filterOptions.collections;
    const taxonomySelect = (fieldId: string, selected: string, onSelect: (value: string) => void) => {
      const options = taxonomyOptions(fieldId);
      const category = fieldId.startsWith("categoria_");
      return (
        <Select size="small" displayEmpty sx={{ ...compactFieldSx, minWidth: 280, flex: 1 }} value={selected} onChange={(e) => onSelect(e.target.value)}>
          <MenuItem value=""><em>{category ? "Selecionar categoria/tipo..." : "Selecionar coleção..."}</em></MenuItem>
          {options.map((option) => <MenuItem key={option.id} value={option.id}>{option.title}</MenuItem>)}
        </Select>
      );
    };

    if (field.id === "estado") return (
      <Select size="small" displayEmpty sx={{ ...compactFieldSx, flex: 1 }} value={String(condition.value || "")} onChange={(e) => setValue(e.target.value)}>
        <MenuItem value=""><em>Selecionar UF...</em></MenuItem>
        {BRAZIL_STATES.map((uf) => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
      </Select>
    );

    if (field.kind === "campaign_behavior") return (
      <Select size="small" displayEmpty sx={{ ...compactFieldSx, minWidth: 300, flex: 1 }} value={String(condition.value || "")} onChange={(e) => setValue(e.target.value)}>
        <MenuItem value=""><em>Selecionar campanha...</em></MenuItem>
        {filterOptions.campaigns.map((option) => <MenuItem key={option.id} value={option.id}>{option.name}</MenuItem>)}
      </Select>
    );

    if (field.kind === "automation_behavior") return (
      <Select size="small" displayEmpty sx={{ ...compactFieldSx, minWidth: 300, flex: 1 }} value={String(condition.value || "")} onChange={(e) => setValue(e.target.value)}>
        <MenuItem value=""><em>Selecionar automação...</em></MenuItem>
        {filterOptions.automations.map((option) => <MenuItem key={option.id} value={option.id}>{option.name}</MenuItem>)}
      </Select>
    );

    if (field.kind === "period_number" || field.kind === "period_money") {
      const value = periodMetricValue(condition.value);
      return (
        <Stack direction="row" spacing={1} sx={{ minWidth: 470, flex: 1, alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary">últimos</Typography>
          <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 80 }} slotProps={{ htmlInput: { min: 0 } }} placeholder="Dias" value={String(value.days ?? "")} onChange={(event) => setValue({ ...value, days: event.target.value })} />
          <Typography variant="caption" color="text.secondary">dias</Typography>
          {conditionNumericControls(value, setValue, field.kind === "period_money", condition.operator)}
        </Stack>
      );
    }

    if (field.kind === "product_taxonomy") return taxonomySelect(field.id, String(condition.value || ""), setValue);

    if (field.kind === "product_taxonomy_date") {
      const value = taxonomyMetricValue(condition.value);
      return (
        <Stack direction="row" spacing={1} sx={{ minWidth: 500, flex: 1, alignItems: "center" }}>
          {taxonomySelect(field.id, value.taxonomyValue, (taxonomyValue) => setValue({ ...value, taxonomyValue }))}
          {condition.operator === "between_days" ? (
            <>
              <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 96 }} slotProps={{ htmlInput: { min: 0 } }} placeholder="Mín. dias" value={String(value.min ?? "")} onChange={(event) => setValue({ ...value, min: event.target.value })} />
              <Typography variant="caption" color="text.secondary">até</Typography>
              <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 96 }} slotProps={{ htmlInput: { min: 0 } }} placeholder="Máx. dias" value={String(value.max ?? "")} onChange={(event) => setValue({ ...value, max: event.target.value })} />
            </>
          ) : (
            <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 112 }} slotProps={{ htmlInput: { min: 0 } }} placeholder="Dias" value={String(value.days ?? "")} onChange={(event) => setValue({ ...value, days: event.target.value })} />
          )}
        </Stack>
      );
    }

    if (field.kind === "product_taxonomy_number" || field.kind === "product_taxonomy_money") {
      const value = taxonomyMetricValue(condition.value);
      return (
        <Stack direction="row" spacing={1} sx={{ minWidth: 520, flex: 1, alignItems: "center" }}>
          {taxonomySelect(field.id, value.taxonomyValue, (taxonomyValue) => setValue({ ...value, taxonomyValue }))}
          {conditionNumericControls(value, setValue, field.kind === "product_taxonomy_money", condition.operator)}
        </Stack>
      );
    }

    if (field.kind === "product") return productSelect(String(condition.value || ""), setValue);

    if (field.kind === "product_date") {
      const value = productMetricValue(condition.value);
      return (
        <Stack direction="row" spacing={1} sx={{ minWidth: 480, flex: 1, alignItems: "center" }}>
          {productSelect(value.productId, (productId) => setValue({ ...value, productId }))}
          {condition.operator === "between_days" ? (
            <>
              <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 96 }} slotProps={{ htmlInput: { min: 0 } }} placeholder="Mín. dias" value={String(value.min ?? "")} onChange={(event) => setValue({ ...value, min: event.target.value })} />
              <Typography variant="caption" color="text.secondary">até</Typography>
              <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 96 }} slotProps={{ htmlInput: { min: 0 } }} placeholder="Máx. dias" value={String(value.max ?? "")} onChange={(event) => setValue({ ...value, max: event.target.value })} />
            </>
          ) : (
            <TextField type="number" size="small" sx={{ ...compactFieldSx, width: 112 }} slotProps={{ htmlInput: { min: 0 } }} placeholder="Dias" value={String(value.days ?? "")} onChange={(event) => setValue({ ...value, days: event.target.value })} />
          )}
        </Stack>
      );
    }

    if (field.kind === "product_number" || field.kind === "product_money") {
      const value = productMetricValue(condition.value);
      return (
        <Stack direction="row" spacing={1} sx={{ minWidth: 520, flex: 1, alignItems: "center" }}>
          {productSelect(value.productId, (productId) => setValue({ ...value, productId }))}
          {conditionNumericControls(value, setValue, field.kind === "product_money", condition.operator)}
        </Stack>
      );
    }

    if (field.kind === "product_sku") {
      const value = productMetricValue(condition.value);
      const options = filterOptions.products.flatMap((product) => product.skus.map((sku) => ({ productId: product.id, title: product.title, sku })));
      const encoded = value.productId && value.sku ? `${value.productId}::${value.sku}` : "";
      return (
        <Select
          size="small"
          displayEmpty
          sx={{ ...compactFieldSx, minWidth: 360, flex: 1 }}
          value={encoded}
          onChange={(e) => {
            const selected = e.target.value;
            const separator = selected.indexOf("::");
            setValue({ productId: selected.slice(0, separator), sku: selected.slice(separator + 2) });
          }}
        >
          <MenuItem value=""><em>Selecionar SKU / variação...</em></MenuItem>
          {options.map((option) => (
            <MenuItem key={`${option.productId}:${option.sku}`} value={`${option.productId}::${option.sku}`}>{option.title} · SKU {option.sku}</MenuItem>
          ))}
        </Select>
      );
    }

    if (field.kind === "status") return (
      <Select size="small" displayEmpty sx={{ ...compactFieldSx, flex: 1 }} value={String(condition.value || "")} onChange={(e) => setValue(e.target.value)}>
        <MenuItem value=""><em>Selecionar status...</em></MenuItem>
        <MenuItem value="paid">Pago</MenuItem>
        <MenuItem value="partially_paid">Parcialmente Pago</MenuItem>
        <MenuItem value="pending">Pendente</MenuItem>
        <MenuItem value="authorized">Autorizado</MenuItem>
        <MenuItem value="refunded">Reembolsado</MenuItem>
        <MenuItem value="partially_refunded">Parcialmente Reembolsado</MenuItem>
        <MenuItem value="voided">Anulado</MenuItem>
        <MenuItem value="expired">Expirado</MenuItem>
        <MenuItem value="unpaid">Não Pago</MenuItem>
        <MenuItem value="cancelled">Cancelado</MenuItem>
      </Select>
    );

    if (field.kind === "fulfillment_status") return (
      <Select size="small" displayEmpty sx={{ ...compactFieldSx, flex: 1 }} value={String(condition.value || "")} onChange={(e) => setValue(e.target.value)}>
        <MenuItem value=""><em>Selecionar status de entrega...</em></MenuItem>
        <MenuItem value="fulfilled">Rastreamento Adicionado</MenuItem>
        <MenuItem value="in_transit">Em Trânsito</MenuItem>
        <MenuItem value="out_for_delivery">Saiu para Entrega</MenuItem>
        <MenuItem value="attempted_delivery">Tentativa de Entrega</MenuItem>
        <MenuItem value="delivered">Entregue</MenuItem>
        <MenuItem value="canceled">Cancelado</MenuItem>
      </Select>
    );

    if (field.kind === "rfm") {
      if (condition.operator === "in" || condition.operator === "not_in") {
        const selected = Array.isArray(condition.value) ? condition.value : [];
        return (
          <Stack direction="row" spacing={0.5} sx={{ minWidth: 320, flex: 1, flexWrap: "wrap", borderRadius: 1.5, bgcolor: "action.hover", p: 0.75 }}>
            {Object.keys(RFM_SEGMENTS_CONFIG).map((segment) => (
              <Chip
                key={segment}
                size="small"
                label={segment}
                variant={selected.includes(segment) ? "filled" : "outlined"}
                color={selected.includes(segment) ? "primary" : "default"}
                onClick={() => setValue(selected.includes(segment) ? selected.filter((item) => item !== segment) : [...selected, segment])}
                sx={{ fontSize: 10 }}
              />
            ))}
          </Stack>
        );
      }
      return (
        <Select size="small" displayEmpty sx={{ ...compactFieldSx, flex: 1 }} value={String(condition.value || "")} onChange={(e) => setValue(e.target.value)}>
          <MenuItem value=""><em>Selecionar segmento...</em></MenuItem>
          {Object.keys(RFM_SEGMENTS_CONFIG).map((segment) => <MenuItem key={segment} value={segment}>{segment}</MenuItem>)}
        </Select>
      );
    }

    if (field.kind === "profile") return (
      <Select size="small" displayEmpty sx={{ ...compactFieldSx, flex: 1 }} value={String(condition.value || "")} onChange={(e) => setValue(e.target.value)}>
        <MenuItem value=""><em>Selecionar perfil...</em></MenuItem>
        <MenuItem value="carrinho">Checkout Abandonado Ativo</MenuItem>
        <MenuItem value="primeira_compra">Exatamente 1 Compra Válida</MenuItem>
        <MenuItem value="sem_compra">Sem Compra Válida</MenuItem>
      </Select>
    );

    if (field.kind === "boolean") return (
      <Select size="small" displayEmpty sx={{ ...compactFieldSx, flex: 1 }} value={String(condition.value || "")} onChange={(e) => setValue(e.target.value)}>
        <MenuItem value=""><em>Selecionar...</em></MenuItem>
        <MenuItem value="sim">Sim</MenuItem>
        <MenuItem value="nao">Não</MenuItem>
      </Select>
    );

    if (field.kind === "date") {
      if (condition.operator === "between_days") {
        const range = rangeValue(condition.value);
        return (
          <Stack direction="row" spacing={1} sx={{ flex: 1, alignItems: "center" }}>
            <TextField type="number" size="small" sx={compactFieldSx} slotProps={{ htmlInput: { min: 0 } }} placeholder="Mín. dias" value={String(range.min)} onChange={(event) => setValue({ ...range, min: event.target.value })} />
            <Typography variant="caption" color="text.secondary">até</Typography>
            <TextField type="number" size="small" sx={compactFieldSx} slotProps={{ htmlInput: { min: 0 } }} placeholder="Máx. dias" value={String(range.max)} onChange={(event) => setValue({ ...range, max: event.target.value })} />
          </Stack>
        );
      }
      const relative = condition.operator === "last_days" || condition.operator === "older_than_days";
      return (
        <TextField
          type={relative ? "number" : "date"}
          size="small"
          sx={{ ...compactFieldSx, flex: 1 }}
          slotProps={{ htmlInput: { min: relative ? 0 : undefined } }}
          value={String(condition.value ?? "")}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }

    if (field.kind === "number") {
      const money = isMoneyField(field);
      if (condition.operator === "between") {
        const range = rangeValue(condition.value);
        return (
          <Stack direction="row" spacing={1} sx={{ flex: 1, alignItems: "center" }}>
            {money && <Typography variant="caption" color="text.secondary">R$</Typography>}
            <TextField type="number" size="small" sx={compactFieldSx} slotProps={{ htmlInput: { step: money ? "0.01" : "1" } }} placeholder="Mínimo" value={String(range.min)} onChange={(event) => setValue({ ...range, min: event.target.value })} />
            <Typography variant="caption" color="text.secondary">até</Typography>
            {money && <Typography variant="caption" color="text.secondary">R$</Typography>}
            <TextField type="number" size="small" sx={compactFieldSx} slotProps={{ htmlInput: { step: money ? "0.01" : "1" } }} placeholder="Máximo" value={String(range.max)} onChange={(event) => setValue({ ...range, max: event.target.value })} />
          </Stack>
        );
      }
      return (
        <TextField
          type="number"
          size="small"
          sx={{ ...compactFieldSx, flex: 1 }}
          slotProps={{ htmlInput: { step: money ? "0.01" : "1" } }}
          placeholder={money ? "R$ 0,00" : "Valor numérico..."}
          value={String(condition.value ?? "")}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }

    const suggestions = field.id === "cidade" ? filterOptions.cities : field.id === "customer_tag" ? filterOptions.customerTags : field.id === "tags_custom" ? filterOptions.customTags : [];
    const listId = suggestions.length ? `crm-filter-options-${condition.id}` : undefined;
    return (
      <Box sx={{ flex: 1 }}>
        <TextField
          size="small"
          fullWidth
          sx={compactFieldSx}
          slotProps={{ htmlInput: { list: listId } }}
          placeholder={suggestions.length ? "Digite ou escolha uma opção..." : "Valor..."}
          value={String(condition.value ?? "")}
          onChange={(event) => setValue(event.target.value)}
        />
        {listId && <datalist id={listId}>{suggestions.map((option) => <option key={option} value={option} />)}</datalist>}
      </Box>
    );
  };

  const searchTerm = normalizeSearch(filterSearch);
  const searchResults = searchTerm
    ? CRM_FILTER_CATEGORIES.flatMap((category) => category.fields.map((field) => ({ category, field })))
        .filter(({ category, field }) => normalizeSearch(`${category.label} ${field.label} ${field.description ?? ""} ${field.id}`).includes(searchTerm))
    : [];

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }} spacing={2}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <IconButton onClick={onCancel}>
            <ArrowLeft size={20} />
          </IconButton>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {initialData?.id ? "Editar Segmento" : "Criar Segmento"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Defina regras reais para agrupar seus clientes automaticamente.
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button variant="contained" startIcon={<Save size={16} />} onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar Segmento"}
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ border: "1px solid", borderColor: "success.main", bgcolor: "success.50", borderRadius: 2, p: 1.5 }}>
        <ShieldCheck size={16} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-success-main, #28C76F)" />
        <Typography variant="body2" color="text.secondary">
          <strong style={{ color: "inherit" }}>Filtros validados:</strong> compras, produtos, categorias, coleções, campanhas e automações usam fontes reais do CRM. Métricas de compra seguem somente pedidos válidos.
        </Typography>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField fullWidth label="Nome do Segmento" placeholder="Ex: 3+ compras nos últimos 60 dias" value={nome} onChange={(event) => setNome(event.target.value)} />
        <TextField fullWidth label="Descrição (opcional)" value={descricao} onChange={(event) => setDescricao(event.target.value)} />
      </Stack>

      {!initialData?.id && (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
            <Sparkles size={16} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Modelos rápidos</Typography>
              <Typography variant="caption" color="text.secondary">Comece com um segmento pronto e ajuste se quiser.</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {CRM_SEGMENT_TEMPLATES.map((template) => (
              <Button key={template.id} variant="outline" size="small" sx={{ height: "auto", py: 1, textAlign: "left" }} onClick={() => applyTemplate(template.id)}>
                {template.name}
              </Button>
            ))}
          </Stack>
        </Box>
      )}

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>Regras de Segmentação</Typography>
              <Chip size="small" label="Dinâmico" />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              Dentro de cada grupo usamos E. Entre grupos usamos OU.
            </Typography>
          </Box>
          <Box sx={{ minWidth: 260, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "action.hover", px: 1.5, py: 1, textAlign: "right" }}>
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
              Prévia da audiência
            </Typography>
            {previewLoading ? (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Calculando...</Typography>
            ) : preview ? (
              <>
                <Typography sx={{ fontWeight: 600 }}>{preview.count.toLocaleString("pt-BR")} clientes</Typography>
                <Typography variant="caption" color="text.secondary">de {preview.totalContacts.toLocaleString("pt-BR")} contatos</Typography>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 260, display: "block" }}>{previewMessage}</Typography>
            )}
          </Box>
        </Stack>
        {preview?.sample?.length ? (
          <Box sx={{ mb: 2, borderRadius: 2, bgcolor: "action.hover", px: 1.5, py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              <strong style={{ color: "inherit" }}>Exemplos:</strong> {preview.sample.map((item) => item.name).join(", ")}
            </Typography>
          </Box>
        ) : null}

        <Stack spacing={3}>
          {groups.map((group, groupIndex) => (
            <Box key={group.id} sx={{ position: "relative" }}>
              {groupIndex > 0 && (
                <Stack direction="row" sx={{ justifyContent: "center", position: "relative", mb: 2 }}>
                  <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
                    <Box sx={{ width: "100%", borderTop: "1px solid", borderColor: "divider" }} />
                  </Box>
                  <Chip label="OU" color="primary" sx={{ position: "relative", zIndex: 1, px: 1.5 }} />
                </Stack>
              )}
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "action.hover", p: 2 }}>
                <Chip
                  size="small"
                  variant="outlined"
                  color="primary"
                  label="Corresponder a TODAS as regras (E)"
                  sx={{ mb: 1.5, fontSize: 10, textTransform: "uppercase", fontWeight: 400 }}
                />
                <Stack spacing={1.5}>
                  {group.conditions.map((condition) => {
                    const field = getCRMFilterField(condition.field);
                    if (!field) return (
                      <Stack key={condition.id} direction="row" spacing={1.5} sx={{ alignItems: "center", border: "1px solid", borderColor: "warning.main", bgcolor: "warning.50", borderRadius: 2, p: 1.5 }}>
                        <AlertTriangle size={16} color="var(--mui-palette-warning-main, #FF9F43)" />
                        <Typography variant="caption" sx={{ flex: 1, fontWeight: 500 }}>Filtro antigo sem suporte: {condition.label || condition.field}</Typography>
                        <IconButton size="small" onClick={() => removeCondition(group.id, condition.id)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Stack>
                    );
                    const category = CRM_FILTER_CATEGORIES.find((item) => item.id === condition.category) ?? CRM_FILTER_CATEGORIES.find((item) => item.fields.some((candidate) => candidate.id === field.id));
                    const Icon = category ? CATEGORY_ICONS[category.id] : Users;
                    return (
                      <Stack key={condition.id} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: { xs: "wrap", lg: "nowrap" }, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: 2, p: 1, pr: 1.5, boxShadow: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", width: { xs: "100%", lg: 250 } }}>
                          <Box sx={{ borderRadius: 1, bgcolor: "action.hover", p: 0.5 }}>
                            <Icon size={12} />
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="caption" sx={{ fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{field.label}</Typography>
                            {field.description && (
                              <Typography variant="caption" color="text.secondary" title={field.description} sx={{ fontSize: 10, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {field.description}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                        <Select
                          size="small"
                          sx={{ ...compactFieldSx, width: 185, fontWeight: 500 }}
                          value={condition.operator}
                          onChange={(e) => updateCondition(group.id, condition.id, { operator: e.target.value, value: nextValueForOperator(field, e.target.value, condition.value) })}
                        >
                          {operatorsForField(field).map((operator) => <MenuItem key={operator.value} value={operator.value}>{operator.label}</MenuItem>)}
                        </Select>
                        {renderValueControl(group.id, condition, field)}
                        <IconButton size="small" sx={{ flexShrink: 0, color: "text.secondary", "&:hover": { color: "error.main" } }} onClick={() => removeCondition(group.id, condition.id)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Stack>
                    );
                  })}

                  <Button
                    variant="outline"
                    fullWidth
                    startIcon={<Plus size={16} />}
                    sx={{ borderStyle: "dashed", borderWidth: 2, color: "text.secondary" }}
                    onClick={(e) => setAddFilterAnchor({ el: e.currentTarget, groupId: group.id })}
                  >
                    Adicionar Filtro
                  </Button>
                </Stack>
              </Box>
            </Box>
          ))}
          <Button
            variant="ghost"
            fullWidth
            startIcon={<Plus size={16} />}
            sx={{ border: "1px dashed", borderColor: "primary.main", color: "primary.main" }}
            onClick={() => setGroups((prev) => [...prev, { id: crypto.randomUUID(), type: "OR", conditions: [] }])}
          >
            Adicionar novo grupo de regras (OU)
          </Button>
        </Stack>
      </Box>

      <Menu
        anchorEl={addFilterAnchor?.el}
        open={Boolean(addFilterAnchor)}
        onClose={closeAddFilterMenu}
        slotProps={{ paper: { sx: { width: 360, maxHeight: 420 } } }}
      >
        <Box sx={{ p: 1 }} onKeyDown={(event) => event.stopPropagation()}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="Buscar filtro: produto, RFM, campanha..."
            value={filterSearch}
            onChange={(event) => { setFilterSearch(event.target.value); setMenuCategory(null); }}
            slotProps={{ input: { startAdornment: <Search size={14} style={{ marginRight: 6, opacity: 0.6 }} /> } }}
          />
        </Box>
        {searchTerm ? (
          searchResults.length ? (
            searchResults.map(({ category, field }) => {
              const Icon = CATEGORY_ICONS[category.id];
              return (
                <MenuItem key={`${category.id}-${field.id}`} onClick={() => addCondition(addFilterAnchor!.groupId, category, field)}>
                  <Icon size={16} style={{ marginRight: 8, opacity: 0.6 }} />
                  <Box>
                    <Typography variant="body2">{field.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{category.label}</Typography>
                  </Box>
                </MenuItem>
              );
            })
          ) : (
            <Typography variant="caption" color="text.secondary" align="center" sx={{ display: "block", py: 2 }}>
              Nenhum filtro encontrado.
            </Typography>
          )
        ) : menuCategory ? (
          <>
            <MenuItem onClick={() => setMenuCategory(null)} sx={{ color: "text.secondary" }}>
              <ArrowLeft size={14} style={{ marginRight: 8 }} /> Voltar
            </MenuItem>
            {menuCategory.fields.map((field) => (
              <MenuItem key={field.id} onClick={() => addCondition(addFilterAnchor!.groupId, menuCategory, field)}>
                <Box>
                  <Typography variant="body2">{field.label}</Typography>
                  {field.description && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", maxWidth: 288 }}>
                      {field.description}
                    </Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </>
        ) : (
          CRM_FILTER_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.id];
            return (
              <MenuItem key={category.id} onClick={() => setMenuCategory(category)}>
                <Icon size={16} style={{ marginRight: 8 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{category.label}</Typography>
                <ChevronRight size={14} style={{ opacity: 0.5 }} />
              </MenuItem>
            );
          })
        )}
      </Menu>
    </Stack>
  );
}
