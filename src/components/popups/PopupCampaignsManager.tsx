import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  ArrowLeft,
  BadgePercent,
  ChevronDown,
  Gift,
  Image as ImageIcon,
  Layers3,
  LayoutTemplate,
  Monitor,
  MousePointerClick,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Timer,
  Trash2,
  Type,
} from "lucide-react";
import { listPopupCampaigns, savePopupCampaign, togglePopupCampaign, deletePopupCampaign } from "@/lib/popup.functions";
import { listMetaTemplates } from "@/lib/whatsapp-meta.functions";
import { extractTemplateBodyTokens } from "@/lib/whatsapp-template-body-tokens";
import {
  POPUP_TEMPLATE_PRESETS,
  buildPopupTemplateDraft,
  getPopupTemplatePreset,
  normalizePopupDesignConfig,
  popupStageCount,
  type PopupDesignConfig,
  type PopupTemplateKey,
} from "@/lib/popup-designer";
import { PopupPreview, type PopupPreviewStage } from "./PopupPreview";
import { WheelPrizesDialog } from "./WheelPrizesDialog";

const CHECKER_BG = {
  backgroundImage:
    "linear-gradient(45deg,#f4f4f5 25%,transparent 25%),linear-gradient(-45deg,#f4f4f5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f4f4f5 75%),linear-gradient(-45deg,transparent 75%,#f4f4f5 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
};

type FormState = {
  id?: string;
  name: string;
  is_active: boolean;
  collect_name: boolean;
  headline: string;
  body_text: string;
  button_text: string;
  image_url: string;
  trigger_time_seconds: string;
  trigger_exit_intent: boolean;
  reshow_mode: "once_ever" | "after_days";
  reshow_after_days: string;
  coupon_mode: "none" | "fixed" | "unique";
  fixed_coupon_code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: string;
  discount_expires_days: string;
  template_name: string;
  template_language: string;
  template_var_mapping: Record<string, string>;
  design_config: PopupDesignConfig;
};

function createEmptyForm(templateKey: PopupTemplateKey = "essential"): FormState {
  const draft = buildPopupTemplateDraft(templateKey);
  return {
    name: "",
    is_active: false,
    collect_name: draft.collect_name,
    headline: draft.headline,
    body_text: draft.body_text,
    button_text: draft.button_text,
    image_url: draft.image_url,
    trigger_time_seconds: "8",
    trigger_exit_intent: false,
    reshow_mode: "after_days",
    reshow_after_days: "7",
    coupon_mode: draft.coupon_mode,
    fixed_coupon_code: "",
    discount_type: draft.discount_type,
    discount_value: String(draft.discount_value),
    discount_expires_days: "7",
    template_name: "",
    template_language: "",
    template_var_mapping: {},
    design_config: draft.design_config,
  };
}

function rowToForm(row: any): FormState {
  return {
    id: row.id,
    name: row.name,
    is_active: row.is_active,
    collect_name: row.collect_name,
    headline: row.headline,
    body_text: row.body_text,
    button_text: row.button_text,
    image_url: row.image_url ?? "",
    trigger_time_seconds: row.trigger_time_seconds != null ? String(row.trigger_time_seconds) : "",
    trigger_exit_intent: row.trigger_exit_intent,
    reshow_mode: row.reshow_mode,
    reshow_after_days: row.reshow_after_days != null ? String(row.reshow_after_days) : "",
    coupon_mode: row.coupon_mode,
    fixed_coupon_code: row.fixed_coupon_code ?? "",
    discount_type: row.discount_type ?? "percentage",
    discount_value: row.discount_value != null ? String(row.discount_value) : "",
    discount_expires_days: row.discount_expires_days != null ? String(row.discount_expires_days) : "7",
    template_name: row.template_name ?? "",
    template_language: row.template_language ?? "",
    template_var_mapping: row.template_var_mapping ?? {},
    design_config: normalizePopupDesignConfig(row.design_config),
  };
}

function TemplateGallery({
  selected,
  onSelect,
  onUse,
  onOpenSocialProof,
  onBack,
}: {
  selected: PopupTemplateKey;
  onSelect: (key: PopupTemplateKey) => void;
  onUse: () => void;
  onOpenSocialProof: () => void;
  onBack: () => void;
}) {
  const selectedPreset = getPopupTemplatePreset(selected);
  return (
    <Box sx={{ minHeight: 680, overflow: "hidden", borderRadius: 4, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid", borderColor: "divider", px: 2.5, py: 2 }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <IconButton onClick={onBack}>
            <ArrowLeft size={16} />
          </IconButton>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>Escolha um template</Typography>
            <Typography variant="caption" color="text.secondary">
              Use um modelo pronto e personalize tudo no editor.
            </Typography>
          </Box>
        </Stack>
        <Button variant="contained" startIcon={<Sparkles size={16} />} onClick={onUse}>
          Usar este template
        </Button>
      </Stack>

      <Box sx={{ display: "grid", gap: 2.5, p: 2.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" } }}>
        {POPUP_TEMPLATE_PRESETS.map((preset) => {
          const draft = createEmptyForm(preset.key);
          const active = selected === preset.key;
          return (
            <Box
              key={preset.key}
              component="button"
              type="button"
              onClick={() => onSelect(preset.key)}
              sx={{
                overflow: "hidden",
                borderRadius: 4,
                border: "1px solid",
                borderColor: active ? "primary.main" : "divider",
                boxShadow: active ? (theme) => `0 0 0 2px ${theme.palette.primary.main}33` : "none",
                bgcolor: "background.paper",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.15s",
                p: 0,
                "&:hover": active ? undefined : { borderColor: "primary.light" },
              }}
            >
              <Box sx={{ display: "flex", minHeight: 230, alignItems: "center", justifyContent: "center", overflow: "hidden", p: 2, ...CHECKER_BG }}>
                <Box sx={{ transform: "scale(0.52)", transformOrigin: "center" }}>
                  <PopupPreview campaign={draft} design={draft.design_config} compact />
                </Box>
              </Box>
              <Stack spacing={1} sx={{ borderTop: "1px solid", borderColor: "divider", p: 2 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }} spacing={1}>
                  <Typography sx={{ fontWeight: 600 }}>{preset.name}</Typography>
                  <Chip size="small" variant="outlined" label={preset.category} sx={{ fontSize: 10 }} />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ minHeight: 40, lineHeight: 1.5 }}>
                  {preset.description}
                </Typography>
              </Stack>
            </Box>
          );
        })}
        <Box
          component="button"
          type="button"
          onClick={onOpenSocialProof}
          sx={{
            overflow: "hidden",
            borderRadius: 4,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            textAlign: "left",
            cursor: "pointer",
            transition: "all 0.15s",
            p: 0,
            "&:hover": { borderColor: "primary.light" },
          }}
        >
          <Box sx={{ display: "flex", minHeight: 230, alignItems: "center", justifyContent: "center", overflow: "hidden", p: 2, ...CHECKER_BG }}>
            <Box sx={{ position: "relative", display: "flex", width: "100%", maxWidth: 310, gap: 1.5, borderRadius: 2, border: "1px solid #e5e7eb", bgcolor: "#fff", p: "10px 32px 10px 10px", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
              <Typography sx={{ position: "absolute", right: 8, top: 4, fontSize: 20, color: "text.secondary" }}>×</Typography>
              <Box sx={{ display: "grid", size: 80, width: 80, height: 80, flexShrink: 0, placeItems: "center", borderRadius: 1, bgcolor: "#f6f1ef" }}>
                <ShoppingBag size={28} color="#9b6f63" />
              </Box>
              <Box sx={{ minWidth: 0, pt: 0.5, fontSize: 12, lineHeight: 1.3 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Maria S. de Diamantina/MG</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 12 }}>comprou</Typography>
                <Typography sx={{ mt: 0.25, fontWeight: 500, fontSize: 12 }}>Kit Ayla Azul Turquesa</Typography>
                <Typography color="text.secondary" sx={{ mt: 1, fontSize: 10 }}>ontem</Typography>
              </Box>
            </Box>
          </Box>
          <Stack spacing={1} sx={{ borderTop: "1px solid", borderColor: "divider", p: 2 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }} spacing={1}>
              <Typography sx={{ fontWeight: 600 }}>Compras recentes</Typography>
              <Chip size="small" variant="outlined" label="Prova social" sx={{ fontSize: 10 }} />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ minHeight: 40, lineHeight: 1.5 }}>
              Pedidos pagos de ontem, exibidos aleatoriamente após fechar o pop-up principal.
            </Typography>
          </Stack>
        </Box>
      </Box>

      <Stack
        direction="row"
        sx={{ position: "sticky", bottom: 0, justifyContent: "space-between", alignItems: "center", borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper", px: 2.5, py: 1.5 }}
      >
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
            Template selecionado
          </Typography>
          <Typography sx={{ fontWeight: 600 }}>{selectedPreset.name}</Typography>
        </Box>
        <Button variant="contained" onClick={onUse}>
          Usar este template →
        </Button>
      </Stack>
    </Box>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ display: "block", mb: 0.5 }}>
        {label}
      </Typography>
      <Stack direction="row" spacing={1}>
        <input
          type="color"
          style={{ height: 36, width: 48, padding: 4, border: "1px solid #d1d5db", borderRadius: 6 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <TextField size="small" fullWidth value={value} onChange={(e) => onChange(e.target.value)} sx={{ "& input": { fontFamily: "monospace", fontSize: 12, textTransform: "uppercase" } }} />
      </Stack>
    </Box>
  );
}

export function PopupCampaignsManager({ onOpenSocialProof }: { onOpenSocialProof?: () => void } = {}) {
  const qc = useQueryClient();
  const list = useServerFn(listPopupCampaigns);
  const save = useServerFn(savePopupCampaign);
  const toggle = useServerFn(togglePopupCampaign);
  const del = useServerFn(deletePopupCampaign);
  const listTemplates = useServerFn(listMetaTemplates);

  const { data: campaigns } = useQuery({ queryKey: ["popup-campaigns"], queryFn: () => list() });
  const { data: templatesResult } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listTemplates() });
  const approved = (templatesResult?.success ? templatesResult.templates : []).filter((t: { status: string }) => t.status === "APPROVED");

  const [mode, setMode] = useState<"list" | "templates" | "editor">("list");
  const [selectedPreset, setSelectedPreset] = useState<PopupTemplateKey>("essential");
  const [form, setForm] = useState<FormState>(() => createEmptyForm());
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [previewStage, setPreviewStage] = useState<PopupPreviewStage>("capture");
  const [sideTab, setSideTab] = useState<"elements" | "rules">("elements");
  const [wheelDialogOpen, setWheelDialogOpen] = useState(false);

  const patch = (p: Partial<FormState>) => setForm((current) => ({ ...current, ...p }));
  const patchDesign = (p: Partial<PopupDesignConfig>) => setForm((current) => ({
    ...current,
    design_config: normalizePopupDesignConfig({ ...current.design_config, ...p, templateKey: p.templateKey ?? current.design_config.templateKey }),
  }));

  const template = approved.find((t: any) => t.name === form.template_name && t.language === form.template_language);
  const bodyComponent = template?.components?.find((c: any) => c.type === "BODY");
  const tokens = useMemo(() => extractTemplateBodyTokens(bodyComponent?.text), [bodyComponent?.text]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["popup-campaigns"] });

  const saveMut = useMutation({
    mutationFn: () => save({ data: {
      id: form.id,
      name: form.name,
      is_active: form.is_active,
      collect_name: form.collect_name,
      headline: form.headline,
      body_text: form.body_text,
      button_text: form.button_text,
      image_url: form.image_url || null,
      trigger_time_seconds: form.trigger_time_seconds === "" ? null : Number(form.trigger_time_seconds),
      trigger_exit_intent: form.trigger_exit_intent,
      reshow_mode: form.reshow_mode,
      reshow_after_days: form.reshow_mode === "after_days" && form.reshow_after_days ? Number(form.reshow_after_days) : null,
      coupon_mode: form.coupon_mode,
      fixed_coupon_code: form.coupon_mode === "fixed" ? form.fixed_coupon_code || null : null,
      discount_type: form.coupon_mode === "unique" ? form.discount_type : null,
      discount_value: form.coupon_mode === "unique" ? Number(form.discount_value) : null,
      discount_expires_days: form.coupon_mode === "unique" ? Number(form.discount_expires_days) : null,
      template_id: template?.id ?? null,
      template_name: form.template_name || null,
      template_language: form.template_language || null,
      template_var_mapping: form.template_var_mapping,
      design_config: form.design_config,
    } }),
    onSuccess: () => {
      toast.success("Pop-up salvo com o novo design.");
      invalidate();
      setMode("list");
      setForm(createEmptyForm());
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMut = useMutation({ mutationFn: (input: { id: string; is_active: boolean }) => toggle({ data: input }), onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: invalidate });

  const startTemplate = () => {
    setForm(createEmptyForm(selectedPreset));
    setPreviewStage("capture");
    setMode("editor");
  };

  const applyPresetToCurrent = (key: PopupTemplateKey) => {
    const draft = createEmptyForm(key);
    setForm((current) => ({
      ...current,
      collect_name: draft.collect_name,
      headline: draft.headline,
      body_text: draft.body_text,
      button_text: draft.button_text,
      image_url: draft.image_url,
      coupon_mode: draft.coupon_mode,
      discount_type: draft.discount_type,
      discount_value: draft.discount_value,
      design_config: draft.design_config,
    }));
    setSelectedPreset(key);
    setPreviewStage("capture");
    setMode("editor");
  };

  if (mode === "templates") {
    return (
      <Box sx={{ py: 2 }}>
        <TemplateGallery selected={selectedPreset} onSelect={setSelectedPreset} onUse={startTemplate} onOpenSocialProof={() => onOpenSocialProof?.()} onBack={() => setMode("list")} />
      </Box>
    );
  }

  if (mode === "editor") {
    const progressive = form.design_config.journey === "progressive";
    const stageCount = popupStageCount(form.design_config, form.collect_name);
    const stageButtons: { value: PopupPreviewStage; label: string }[] = progressive
      ? [
          ...(form.collect_name ? [{ value: "name" as const, label: "1 · Nome" }] : []),
          { value: "phone" as const, label: `${form.collect_name ? 2 : 1} · WhatsApp` },
          { value: "result" as const, label: `${stageCount} · Seu cupom` },
        ]
      : [{ value: "capture", label: "Tela inicial" }, { value: "result", label: "Resultado" }];

    return (
      <Box sx={{ py: 2 }}>
        <Box sx={{ overflow: "hidden", borderRadius: 4, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.5 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
              <IconButton onClick={() => setMode("list")}>
                <ArrowLeft size={16} />
              </IconButton>
              <TextField
                size="small"
                sx={{ minWidth: 220, maxWidth: 400, "& input": { fontWeight: 600 } }}
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Nome do pop-up (obrigatório)"
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outline"
                startIcon={<LayoutTemplate size={16} />}
                onClick={() => { setSelectedPreset(form.design_config.templateKey); setMode("templates"); }}
              >
                Trocar template
              </Button>
              <Button
                variant="contained"
                startIcon={<Save size={16} />}
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !form.name.trim() || !form.headline.trim()}
              >
                {saveMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </Stack>
          </Stack>

          <Box sx={{ display: "grid", minHeight: 760, gridTemplateColumns: { xs: "1fr", xl: "285px minmax(0,1fr) 330px" } }}>
            <Box component="aside" sx={{ borderRight: { xl: "1px solid" }, borderColor: "divider", bgcolor: "action.hover" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.5, borderBottom: "1px solid", borderColor: "divider", p: 1.5 }}>
                <Button size="small" variant={sideTab === "elements" ? "contained" : "ghost"} onClick={() => setSideTab("elements")}>
                  Elementos
                </Button>
                <Button size="small" variant={sideTab === "rules" ? "contained" : "ghost"} onClick={() => setSideTab("rules")}>
                  Regras
                </Button>
              </Box>

              <Stack spacing={2} sx={{ maxHeight: 710, overflowY: "auto", p: 2 }}>
                {sideTab === "elements" ? (
                  <>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Adicionar e configurar
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Os blocos abaixo atualizam a prévia em tempo real.
                      </Typography>
                    </Box>

                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                      {([
                        [Type, "Título"], [BadgePercent, "Badge"], [ImageIcon, "Imagem"], [MousePointerClick, "Botão"], [Gift, "Cupom"], [Timer, "Timer"], [Layers3, "Etapas"], [Palette, "Aparência"],
                      ] as const).map(([Icon, label]) => (
                        <Box key={label} sx={{ display: "flex", minHeight: 80, flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1, textAlign: "center", boxShadow: 1 }}>
                          <Icon size={20} color="var(--mui-palette-primary-main, #7367F0)" style={{ marginBottom: 4 }} />
                          <Typography variant="caption" sx={{ fontWeight: 500 }}>{label}</Typography>
                        </Box>
                      ))}
                    </Box>

                    <Stack spacing={1} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1.5 }}>
                      <Typography variant="caption">Badge superior</Typography>
                      <TextField size="small" value={form.design_config.badgeText} onChange={(e) => patchDesign({ badgeText: e.target.value })} />
                    </Stack>

                    <Stack spacing={1} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1.5 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>Pedir nome</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Além do WhatsApp.</Typography>
                        </Box>
                        <Switch checked={form.collect_name} onChange={(e) => patch({ collect_name: e.target.checked })} />
                      </Stack>
                      <TextField size="small" value={form.design_config.namePlaceholder} onChange={(e) => patchDesign({ namePlaceholder: e.target.value })} placeholder="Placeholder do nome" />
                      <TextField size="small" value={form.design_config.inputPlaceholder} onChange={(e) => patchDesign({ inputPlaceholder: e.target.value })} placeholder="Placeholder do WhatsApp" />
                    </Stack>

                    <Stack spacing={1} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1.5 }}>
                      <Typography variant="caption">Imagem (URL)</Typography>
                      <TextField size="small" value={form.image_url} onChange={(e) => patch({ image_url: e.target.value })} placeholder="https://..." />
                      <Select size="small" value={form.design_config.imagePosition} onChange={(e) => patchDesign({ imagePosition: e.target.value as any })}>
                        <MenuItem value="none">Sem imagem</MenuItem>
                        <MenuItem value="left">Imagem à esquerda</MenuItem>
                        <MenuItem value="right">Imagem à direita</MenuItem>
                        <MenuItem value="top">Imagem no topo</MenuItem>
                      </Select>
                    </Stack>

                    <Stack spacing={1} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1.5 }}>
                      <Typography variant="caption">Jornada</Typography>
                      <Select
                        size="small"
                        value={form.design_config.journey}
                        onChange={(e) => { patchDesign({ journey: e.target.value as any }); setPreviewStage(e.target.value === "progressive" ? (form.collect_name ? "name" : "phone") : "capture"); }}
                      >
                        <MenuItem value="single">Formulário em uma tela</MenuItem>
                        <MenuItem value="progressive">Captação progressiva</MenuItem>
                      </Select>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                        Progressiva separa nome, WhatsApp e resultado em até 3 telas.
                      </Typography>
                    </Stack>

                    <Stack spacing={1} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1.5 }}>
                      <Typography variant="caption">Interação</Typography>
                      <Select
                        size="small"
                        value={form.design_config.interaction}
                        onChange={(e) => patchDesign({ interaction: e.target.value as any, layout: e.target.value === "wheel" ? "split" : form.design_config.layout })}
                      >
                        <MenuItem value="form">Formulário clássico</MenuItem>
                        <MenuItem value="wheel">Roleta</MenuItem>
                      </Select>
                      {form.design_config.interaction === "wheel" && (
                        <Stack spacing={1} sx={{ pt: 1 }}>
                          <Button size="small" variant="outline" fullWidth onClick={() => setWheelDialogOpen(true)}>
                            Configurar cores e prêmios da roleta ({form.design_config.wheelPrizes.length})
                          </Button>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                            Cada prêmio pode ter cor, cupom e probabilidade próprios — o sorteio é feito no servidor.
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  </>
                ) : (
                  <>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Regras de exibição</Typography>
                      <Typography variant="caption" color="text.secondary">Defina quando e com que frequência aparece.</Typography>
                    </Box>
                    <Stack spacing={1} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1.5 }}>
                      <Typography variant="caption">Aparecer após (segundos)</Typography>
                      <TextField size="small" type="number" slotProps={{ htmlInput: { min: 0 } }} value={form.trigger_time_seconds} onChange={(e) => patch({ trigger_time_seconds: e.target.value })} placeholder="Em branco desativa" />
                    </Stack>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1.5 }}>
                      <Box>
                        <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>Exit intent</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Mostra ao mover o mouse para sair.</Typography>
                      </Box>
                      <Switch checked={form.trigger_exit_intent} onChange={(e) => patch({ trigger_exit_intent: e.target.checked })} />
                    </Stack>
                    <Stack spacing={1} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", p: 1.5 }}>
                      <Typography variant="caption">Se fechar sem cadastrar</Typography>
                      <Select size="small" value={form.reshow_mode} onChange={(e) => patch({ reshow_mode: e.target.value as any })}>
                        <MenuItem value="after_days">Reaparecer depois de N dias</MenuItem>
                        <MenuItem value="once_ever">Não mostrar novamente</MenuItem>
                      </Select>
                      {form.reshow_mode === "after_days" && (
                        <TextField size="small" type="number" slotProps={{ htmlInput: { min: 1 } }} value={form.reshow_after_days} onChange={(e) => patch({ reshow_after_days: e.target.value })} />
                      )}
                    </Stack>
                  </>
                )}
              </Stack>
            </Box>

            <Box component="main" sx={{ display: "flex", minWidth: 0, flexDirection: "column", bgcolor: "#f5f6f7" }}>
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", justifyContent: "center", alignItems: "center", borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper", px: 2, py: 1.5 }}>
                <Stack direction="row" sx={{ alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", p: 0.5 }}>
                  <Button size="small" variant={viewport === "desktop" ? "contained" : "ghost"} startIcon={<Monitor size={14} />} onClick={() => setViewport("desktop")}>
                    Desktop
                  </Button>
                  <Button size="small" variant={viewport === "mobile" ? "contained" : "ghost"} startIcon={<Smartphone size={14} />} onClick={() => setViewport("mobile")}>
                    Celular
                  </Button>
                </Stack>
                <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", p: 0.5 }}>
                  {stageButtons.map((stage) => (
                    <Button key={stage.value} size="small" variant={previewStage === stage.value ? "contained" : "ghost"} onClick={() => setPreviewStage(stage.value)}>
                      {stage.label}
                    </Button>
                  ))}
                </Stack>
              </Stack>
              <Box sx={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", overflow: "auto", p: 4 }}>
                <PopupPreview campaign={form} design={form.design_config} viewport={viewport} stage={previewStage} />
              </Box>
            </Box>

            <Box component="aside" sx={{ borderLeft: { xl: "1px solid" }, borderColor: "divider", bgcolor: "background.paper" }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.5 }}>
                <Box sx={{ borderRadius: 2, border: "1px solid", borderColor: "primary.main", bgcolor: "action.hover", p: 1 }}>
                  <Palette size={16} color="var(--mui-palette-primary-main, #7367F0)" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Configurações do pop-up</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Conteúdo, estrutura e aparência</Typography>
                </Box>
              </Stack>
              <Stack spacing={1.5} sx={{ maxHeight: 710, overflowY: "auto", p: 2 }}>
                <Accordion defaultExpanded disableGutters sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}>
                  <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Conteúdo</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      <TextField size="small" label="Título" multiline rows={2} fullWidth value={form.headline} onChange={(e) => patch({ headline: e.target.value })} />
                      <TextField size="small" label="Texto" multiline rows={3} fullWidth value={form.body_text} onChange={(e) => patch({ body_text: e.target.value })} />
                      <TextField size="small" label="Texto do botão" fullWidth value={form.button_text} onChange={(e) => patch({ button_text: e.target.value })} />
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                <Accordion defaultExpanded disableGutters sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}>
                  <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Dimensões e layout</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={2}>
                      <Box>
                        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                          <Typography variant="caption">Largura no desktop</Typography>
                          <Typography variant="caption">{form.design_config.width}px</Typography>
                        </Stack>
                        <Slider size="small" min={320} max={820} step={10} value={form.design_config.width} onChange={(_, value) => patchDesign({ width: value as number })} />
                      </Box>
                      <Box>
                        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                          <Typography variant="caption">Bordas arredondadas</Typography>
                          <Typography variant="caption">{form.design_config.borderRadius}px</Typography>
                        </Stack>
                        <Slider size="small" min={0} max={48} value={form.design_config.borderRadius} onChange={(_, value) => patchDesign({ borderRadius: value as number })} />
                      </Box>
                      <FormControl size="small" fullWidth>
                        <Typography variant="caption" sx={{ mb: 0.5 }}>Estrutura</Typography>
                        <Select value={form.design_config.layout} onChange={(e) => patchDesign({ layout: e.target.value as any })}>
                          <MenuItem value="centered">Centralizado</MenuItem>
                          <MenuItem value="split">Dividido em 2 colunas</MenuItem>
                        </Select>
                      </FormControl>
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                <Accordion defaultExpanded disableGutters sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}>
                  <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Aparência</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      <ColorInput label="Cor de fundo" value={form.design_config.backgroundColor} onChange={(value) => patchDesign({ backgroundColor: value })} />
                      <ColorInput label="Cor de destaque" value={form.design_config.accentColor} onChange={(value) => patchDesign({ accentColor: value })} />
                      <ColorInput label="Cor do texto" value={form.design_config.textColor} onChange={(value) => patchDesign({ textColor: value })} />
                      <ColorInput label="Cor do botão" value={form.design_config.buttonColor} onChange={(value) => patchDesign({ buttonColor: value })} />
                      {form.design_config.interaction === "wheel" && (
                        <Button size="small" variant="outline" onClick={() => setWheelDialogOpen(true)}>
                          Cores e prêmios da roleta ({form.design_config.wheelPrizes.length})
                        </Button>
                      )}
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                <Accordion disableGutters sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}>
                  <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Tela de resultado</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      <TextField size="small" fullWidth value={form.design_config.resultHeadline} onChange={(e) => patchDesign({ resultHeadline: e.target.value })} placeholder="Título do resultado" />
                      <TextField size="small" multiline rows={2} fullWidth value={form.design_config.resultBody} onChange={(e) => patchDesign({ resultBody: e.target.value })} />
                      <TextField size="small" fullWidth value={form.design_config.resultButtonText} onChange={(e) => patchDesign({ resultButtonText: e.target.value })} />
                      <Button size="small" variant="outline" fullWidth onClick={() => setPreviewStage("result")}>Ver tela de resultado</Button>
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                <Accordion defaultExpanded disableGutters sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}>
                  <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Cupom / benefício</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      <Select size="small" value={form.coupon_mode} onChange={(e) => patch({ coupon_mode: e.target.value as any })}>
                        <MenuItem value="none">Sem cupom</MenuItem>
                        <MenuItem value="fixed">Cupom fixo</MenuItem>
                        <MenuItem value="unique">Cupom único por lead</MenuItem>
                      </Select>
                      {form.coupon_mode === "fixed" && (
                        <TextField size="small" value={form.fixed_coupon_code} onChange={(e) => patch({ fixed_coupon_code: e.target.value.toUpperCase() })} placeholder="CÓDIGO" />
                      )}
                      {form.coupon_mode === "unique" && (
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                          <Select size="small" value={form.discount_type} onChange={(e) => patch({ discount_type: e.target.value as any })}>
                            <MenuItem value="percentage">% desconto</MenuItem>
                            <MenuItem value="fixed_amount">R$ fixo</MenuItem>
                          </Select>
                          <TextField size="small" type="number" slotProps={{ htmlInput: { min: 0 } }} value={form.discount_value} onChange={(e) => patch({ discount_value: e.target.value })} />
                          <Box sx={{ gridColumn: "span 2" }}>
                            <Typography variant="caption" sx={{ fontSize: 10 }}>Validade em dias</Typography>
                            <TextField size="small" fullWidth type="number" slotProps={{ htmlInput: { min: 1 } }} value={form.discount_expires_days} onChange={(e) => patch({ discount_expires_days: e.target.value })} />
                          </Box>
                        </Box>
                      )}
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                <Accordion disableGutters sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}>
                  <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Mensagem de boas-vindas no WhatsApp</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Opcional. Usa apenas templates aprovados na Meta.</Typography>
                      <Select
                        size="small"
                        displayEmpty
                        value={form.template_name ? `${form.template_name}::${form.template_language}` : ""}
                        onChange={(e) => { const [name, language] = e.target.value.split("::"); patch({ template_name: name ?? "", template_language: language ?? "", template_var_mapping: {} }); }}
                      >
                        <MenuItem value="">
                          <em>Escolha um template</em>
                        </MenuItem>
                        {approved.map((item: any) => (
                          <MenuItem key={`${item.name}-${item.language}`} value={`${item.name}::${item.language}`}>
                            {item.name} ({item.language})
                          </MenuItem>
                        ))}
                      </Select>
                      {tokens.map((token) => {
                        const mapped = form.template_var_mapping[token] ?? "";
                        const source = mapped.startsWith("static:") ? "static" : mapped || "";
                        const staticValue = mapped.startsWith("static:") ? mapped.slice("static:".length) : "";
                        return (
                          <Stack key={token} spacing={0.75} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", p: 1 }}>
                            <Typography sx={{ fontFamily: "monospace", fontSize: 10 }}>{`{{${token}}}`}</Typography>
                            <Select
                              size="small"
                              displayEmpty
                              value={source}
                              onChange={(e) => { const next = { ...form.template_var_mapping }; next[token] = e.target.value === "static" ? "static:" : e.target.value; patch({ template_var_mapping: next }); }}
                            >
                              <MenuItem value="">
                                <em>Origem</em>
                              </MenuItem>
                              <MenuItem value="name">Nome capturado</MenuItem>
                              <MenuItem value="coupon_code">Código do cupom</MenuItem>
                              <MenuItem value="static">Texto fixo</MenuItem>
                            </Select>
                            {source === "static" && (
                              <TextField
                                size="small"
                                value={staticValue}
                                onChange={(e) => { const next = { ...form.template_var_mapping }; next[token] = `static:${e.target.value}`; patch({ template_var_mapping: next }); }}
                              />
                            )}
                          </Stack>
                        );
                      })}
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", borderRadius: 3, border: "1px solid", borderColor: "divider", p: 1.5 }}>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>Publicar este pop-up</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Ao ativar, os outros são desativados.</Typography>
                  </Box>
                  <Switch checked={form.is_active} onChange={(e) => patch({ is_active: e.target.checked })} />
                </Stack>

                <Button variant="outline" fullWidth startIcon={<RotateCcw size={16} />} onClick={() => applyPresetToCurrent(form.design_config.templateKey)}>
                  Restaurar visual do template
                </Button>
              </Stack>
            </Box>
          </Box>
        </Box>

        <WheelPrizesDialog
          open={wheelDialogOpen}
          onOpenChange={setWheelDialogOpen}
          prizes={form.design_config.wheelPrizes}
          onChange={(wheelPrizes) => patchDesign({ wheelPrizes })}
        />
      </Box>
    );
  }

  return (
    <Stack spacing={2.5} sx={{ py: 2 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>Pop-ups configurados</Typography>
          <Typography variant="caption" color="text.secondary">Crie campanhas visuais, capture WhatsApp e entregue benefícios automaticamente.</Typography>
        </Box>
        <Button size="small" variant="contained" startIcon={<Plus size={16} />} onClick={() => { setSelectedPreset("essential"); setMode("templates"); }}>
          Novo pop-up
        </Button>
      </Stack>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" } }}>
        {(campaigns ?? []).length === 0 && (
          <Box sx={{ gridColumn: { xl: "span 2" }, borderRadius: 4, border: "1px dashed", borderColor: "divider", px: 3, py: 7, textAlign: "center" }}>
            <LayoutTemplate size={32} color="var(--mui-palette-text-secondary)" style={{ margin: "0 auto 12px" }} />
            <Typography sx={{ fontWeight: 600 }}>Nenhum pop-up ainda</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Comece escolhendo um dos templates prontos.</Typography>
            <Button variant="contained" sx={{ mt: 2 }} onClick={() => setMode("templates")}>Escolher template</Button>
          </Box>
        )}
        {(campaigns ?? []).map((campaign: any) => {
          const design = normalizePopupDesignConfig(campaign.design_config);
          const previewForm = rowToForm(campaign);
          return (
            <Box key={campaign.id} sx={{ overflow: "hidden", borderRadius: 4, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
              <Box sx={{ display: "flex", minHeight: 250, alignItems: "center", justifyContent: "center", overflow: "hidden", bgcolor: "action.hover", p: 2 }}>
                <Box sx={{ transform: "scale(0.58)", transformOrigin: "center" }}>
                  <PopupPreview campaign={previewForm} design={design} compact />
                </Box>
              </Box>
              <Stack spacing={1.5} sx={{ borderTop: "1px solid", borderColor: "divider", p: 2 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }} spacing={1.5}>
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>{campaign.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{campaign.headline}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Chip size="small" color={campaign.is_active ? "success" : "default"} variant={campaign.is_active ? "filled" : "outlined"} label={campaign.is_active ? "Ativo" : "Rascunho"} />
                    <Switch checked={campaign.is_active} onChange={(e) => toggleMut.mutate({ id: campaign.id, is_active: e.target.checked })} />
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <Chip size="small" variant="outlined" label={getPopupTemplatePreset(design.templateKey === "custom" ? "essential" : design.templateKey).name} />
                  <Chip size="small" variant="outlined" label={campaign.coupon_mode === "none" ? "Sem cupom" : campaign.coupon_mode === "fixed" ? "Cupom fixo" : "Cupom único"} />
                  {design.journey === "progressive" && <Chip size="small" variant="outlined" label={`${popupStageCount(design, campaign.collect_name)} etapas`} />}
                  {design.interaction === "wheel" && <Chip size="small" variant="outlined" label="Roleta" />}
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outline" startIcon={<Pencil size={14} />} onClick={() => { setForm(rowToForm(campaign)); setPreviewStage("capture"); setMode("editor"); }}>
                    Editar
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    startIcon={<Trash2 size={14} />}
                    sx={{ color: "error.main" }}
                    onClick={() => { if (confirm(`Excluir o pop-up "${campaign.name}"?`)) deleteMut.mutate(campaign.id); }}
                  >
                    Excluir
                  </Button>
                </Stack>
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}
