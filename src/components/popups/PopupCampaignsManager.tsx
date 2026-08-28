import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  BadgePercent,
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
  onBack,
}: {
  selected: PopupTemplateKey;
  onSelect: (key: PopupTemplateKey) => void;
  onUse: () => void;
  onBack: () => void;
}) {
  const selectedPreset = getPopupTemplatePreset(selected);
  return (
    <div className="min-h-[680px] overflow-hidden rounded-2xl border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="size-4" /></Button>
          <div>
            <p className="font-semibold">Escolha um template</p>
            <p className="text-xs text-muted-foreground">Use um modelo pronto e personalize tudo no editor.</p>
          </div>
        </div>
        <Button onClick={onUse} className="gap-2"><Sparkles className="size-4" /> Usar este template</Button>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
        {POPUP_TEMPLATE_PRESETS.map((preset) => {
          const draft = createEmptyForm(preset.key);
          const active = selected === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onSelect(preset.key)}
              className={`overflow-hidden rounded-2xl border bg-card text-left transition-all ${active ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50 hover:shadow-md"}`}
            >
              <div className="flex min-h-[230px] items-center justify-center overflow-hidden bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-4">
                <div className="origin-center scale-[0.52]">
                  <PopupPreview campaign={draft} design={draft.design_config} compact />
                </div>
              </div>
              <div className="space-y-2 border-t p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{preset.name}</p>
                  <Badge variant="outline" className="text-[10px]">{preset.category}</Badge>
                </div>
                <p className="min-h-10 text-xs leading-relaxed text-muted-foreground">{preset.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between border-t bg-background/95 px-5 py-3 backdrop-blur">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Template selecionado</p>
          <p className="font-semibold">{selectedPreset.name}</p>
        </div>
        <Button onClick={onUse}>Usar este template →</Button>
      </div>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input type="color" className="h-9 w-12 p-1" value={value} onChange={(e) => onChange(e.target.value)} />
        <Input className="h-9 font-mono text-xs uppercase" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function PopupCampaignsManager() {
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
    return <div className="py-4"><TemplateGallery selected={selectedPreset} onSelect={setSelectedPreset} onUse={startTemplate} onBack={() => setMode("list")} /></div>;
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
      <div className="py-4">
        <div className="overflow-hidden rounded-2xl border bg-background">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setMode("list")}><ArrowLeft className="size-4" /></Button>
              <Input className="h-9 min-w-[220px] max-w-md font-semibold" value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Nome do pop-up (obrigatório)" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-2" onClick={() => { setSelectedPreset(form.design_config.templateKey); setMode("templates"); }}><LayoutTemplate className="size-4" /> Trocar template</Button>
              <Button className="gap-2" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name.trim() || !form.headline.trim()}>
                <Save className="size-4" /> {saveMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>

          <div className="grid min-h-[760px] xl:grid-cols-[285px_minmax(0,1fr)_330px]">
            <aside className="border-r bg-muted/20">
              <div className="grid grid-cols-2 gap-1 border-b p-3">
                <Button size="sm" variant={sideTab === "elements" ? "default" : "ghost"} onClick={() => setSideTab("elements")}>Elementos</Button>
                <Button size="sm" variant={sideTab === "rules" ? "default" : "ghost"} onClick={() => setSideTab("rules")}>Regras</Button>
              </div>

              <div className="max-h-[710px] space-y-4 overflow-y-auto p-4">
                {sideTab === "elements" ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold">Adicionar e configurar</p>
                      <p className="text-xs text-muted-foreground">Os blocos abaixo atualizam a prévia em tempo real.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        [Type, "Título"], [BadgePercent, "Badge"], [ImageIcon, "Imagem"], [MousePointerClick, "Botão"], [Gift, "Cupom"], [Timer, "Timer"], [Layers3, "Etapas"], [Palette, "Aparência"],
                      ].map(([Icon, label]: any) => (
                        <div key={label} className="flex min-h-20 flex-col items-center justify-center rounded-xl border bg-background p-2 text-center shadow-sm">
                          <Icon className="mb-1 size-5 text-primary" /><span className="text-xs font-medium">{label}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 rounded-xl border bg-background p-3">
                      <Label className="text-xs">Badge superior</Label>
                      <Input value={form.design_config.badgeText} onChange={(e) => patchDesign({ badgeText: e.target.value })} />
                    </div>

                    <div className="space-y-2 rounded-xl border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <div><p className="text-xs font-semibold">Pedir nome</p><p className="text-[10px] text-muted-foreground">Além do WhatsApp.</p></div>
                        <Switch checked={form.collect_name} onCheckedChange={(value) => patch({ collect_name: value })} />
                      </div>
                      <Input value={form.design_config.namePlaceholder} onChange={(e) => patchDesign({ namePlaceholder: e.target.value })} placeholder="Placeholder do nome" />
                      <Input value={form.design_config.inputPlaceholder} onChange={(e) => patchDesign({ inputPlaceholder: e.target.value })} placeholder="Placeholder do WhatsApp" />
                    </div>

                    <div className="space-y-2 rounded-xl border bg-background p-3">
                      <Label className="text-xs">Imagem (URL)</Label>
                      <Input value={form.image_url} onChange={(e) => patch({ image_url: e.target.value })} placeholder="https://..." />
                      <Select value={form.design_config.imagePosition} onValueChange={(value: any) => patchDesign({ imagePosition: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem imagem</SelectItem><SelectItem value="left">Imagem à esquerda</SelectItem><SelectItem value="right">Imagem à direita</SelectItem><SelectItem value="top">Imagem no topo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 rounded-xl border bg-background p-3">
                      <Label className="text-xs">Jornada</Label>
                      <Select value={form.design_config.journey} onValueChange={(value: any) => { patchDesign({ journey: value }); setPreviewStage(value === "progressive" ? (form.collect_name ? "name" : "phone") : "capture"); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="single">Formulário em uma tela</SelectItem><SelectItem value="progressive">Captação progressiva</SelectItem></SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Progressiva separa nome, WhatsApp e resultado em até 3 telas.</p>
                    </div>

                    <div className="space-y-2 rounded-xl border bg-background p-3">
                      <Label className="text-xs">Interação</Label>
                      <Select value={form.design_config.interaction} onValueChange={(value: any) => patchDesign({ interaction: value, layout: value === "wheel" ? "split" : form.design_config.layout })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="form">Formulário clássico</SelectItem><SelectItem value="wheel">Roleta</SelectItem></SelectContent>
                      </Select>
                      {form.design_config.interaction === "wheel" && (
                        <div className="space-y-2 pt-2">
                          <Button size="sm" variant="outline" className="w-full" onClick={() => setWheelDialogOpen(true)}>
                            Configurar cores e prêmios da roleta ({form.design_config.wheelPrizes.length})
                          </Button>
                          <p className="text-[10px] text-muted-foreground">Cada prêmio pode ter cor, cupom e probabilidade próprios — o sorteio é feito no servidor.</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div><p className="text-sm font-semibold">Regras de exibição</p><p className="text-xs text-muted-foreground">Defina quando e com que frequência aparece.</p></div>
                    <div className="space-y-2 rounded-xl border bg-background p-3">
                      <Label className="text-xs">Aparecer após (segundos)</Label>
                      <Input type="number" min={0} value={form.trigger_time_seconds} onChange={(e) => patch({ trigger_time_seconds: e.target.value })} placeholder="Em branco desativa" />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border bg-background p-3">
                      <div><p className="text-xs font-semibold">Exit intent</p><p className="text-[10px] text-muted-foreground">Mostra ao mover o mouse para sair.</p></div>
                      <Switch checked={form.trigger_exit_intent} onCheckedChange={(value) => patch({ trigger_exit_intent: value })} />
                    </div>
                    <div className="space-y-2 rounded-xl border bg-background p-3">
                      <Label className="text-xs">Se fechar sem cadastrar</Label>
                      <Select value={form.reshow_mode} onValueChange={(value: any) => patch({ reshow_mode: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="after_days">Reaparecer depois de N dias</SelectItem><SelectItem value="once_ever">Não mostrar novamente</SelectItem></SelectContent>
                      </Select>
                      {form.reshow_mode === "after_days" && <Input type="number" min={1} value={form.reshow_after_days} onChange={(e) => patch({ reshow_after_days: e.target.value })} />}
                    </div>
                  </>
                )}
              </div>
            </aside>

            <main className="flex min-w-0 flex-col bg-[#f5f6f7]">
              <div className="flex flex-wrap items-center justify-center gap-3 border-b bg-background/70 px-4 py-3">
                <div className="flex items-center rounded-lg border bg-background p-1">
                  <Button size="sm" variant={viewport === "desktop" ? "default" : "ghost"} onClick={() => setViewport("desktop")} className="gap-1"><Monitor className="size-3.5" /> Desktop</Button>
                  <Button size="sm" variant={viewport === "mobile" ? "default" : "ghost"} onClick={() => setViewport("mobile")} className="gap-1"><Smartphone className="size-3.5" /> Celular</Button>
                </div>
                <div className="flex flex-wrap items-center rounded-lg border bg-background p-1">
                  {stageButtons.map((stage) => <Button key={stage.value} size="sm" variant={previewStage === stage.value ? "default" : "ghost"} onClick={() => setPreviewStage(stage.value)}>{stage.label}</Button>)}
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center overflow-auto p-8">
                <PopupPreview campaign={form} design={form.design_config} viewport={viewport} stage={previewStage} />
              </div>
            </main>

            <aside className="border-l bg-background">
              <div className="flex items-center gap-2 border-b px-4 py-3"><div className="rounded-lg border border-primary/30 bg-primary/10 p-2"><Palette className="size-4 text-primary" /></div><div><p className="text-sm font-semibold">Configurações do pop-up</p><p className="text-[10px] text-muted-foreground">Conteúdo, estrutura e aparência</p></div></div>
              <div className="max-h-[710px] space-y-4 overflow-y-auto p-4">
                <details open className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Conteúdo</summary>
                  <div className="mt-3 space-y-3">
                    <div><Label className="text-xs">Título</Label><Textarea rows={2} value={form.headline} onChange={(e) => patch({ headline: e.target.value })} /></div>
                    <div><Label className="text-xs">Texto</Label><Textarea rows={3} value={form.body_text} onChange={(e) => patch({ body_text: e.target.value })} /></div>
                    <div><Label className="text-xs">Texto do botão</Label><Input value={form.button_text} onChange={(e) => patch({ button_text: e.target.value })} /></div>
                  </div>
                </details>

                <details open className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Dimensões e layout</summary>
                  <div className="mt-3 space-y-3">
                    <div><div className="flex justify-between text-xs"><Label>Largura no desktop</Label><span>{form.design_config.width}px</span></div><input className="w-full accent-primary" type="range" min={320} max={820} step={10} value={form.design_config.width} onChange={(e) => patchDesign({ width: Number(e.target.value) })} /></div>
                    <div><div className="flex justify-between text-xs"><Label>Bordas arredondadas</Label><span>{form.design_config.borderRadius}px</span></div><input className="w-full accent-primary" type="range" min={0} max={48} value={form.design_config.borderRadius} onChange={(e) => patchDesign({ borderRadius: Number(e.target.value) })} /></div>
                    <div><Label className="text-xs">Estrutura</Label><Select value={form.design_config.layout} onValueChange={(value: any) => patchDesign({ layout: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="centered">Centralizado</SelectItem><SelectItem value="split">Dividido em 2 colunas</SelectItem></SelectContent></Select></div>
                  </div>
                </details>

                <details open className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Aparência</summary>
                  <div className="mt-3 grid gap-3">
                    <ColorInput label="Cor de fundo" value={form.design_config.backgroundColor} onChange={(value) => patchDesign({ backgroundColor: value })} />
                    <ColorInput label="Cor de destaque" value={form.design_config.accentColor} onChange={(value) => patchDesign({ accentColor: value })} />
                    <ColorInput label="Cor do texto" value={form.design_config.textColor} onChange={(value) => patchDesign({ textColor: value })} />
                    <ColorInput label="Cor do botão" value={form.design_config.buttonColor} onChange={(value) => patchDesign({ buttonColor: value })} />
                    {form.design_config.interaction === "wheel" && (
                      <Button size="sm" variant="outline" onClick={() => setWheelDialogOpen(true)}>
                        Cores e prêmios da roleta ({form.design_config.wheelPrizes.length})
                      </Button>
                    )}
                  </div>
                </details>

                <details className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Tela de resultado</summary>
                  <div className="mt-3 space-y-2">
                    <Input value={form.design_config.resultHeadline} onChange={(e) => patchDesign({ resultHeadline: e.target.value })} placeholder="Título do resultado" />
                    <Textarea rows={2} value={form.design_config.resultBody} onChange={(e) => patchDesign({ resultBody: e.target.value })} />
                    <Input value={form.design_config.resultButtonText} onChange={(e) => patchDesign({ resultButtonText: e.target.value })} />
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setPreviewStage("result")}>Ver tela de resultado</Button>
                  </div>
                </details>

                <details open className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Cupom / benefício</summary>
                  <div className="mt-3 space-y-2">
                    <Select value={form.coupon_mode} onValueChange={(value: any) => patch({ coupon_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem cupom</SelectItem><SelectItem value="fixed">Cupom fixo</SelectItem><SelectItem value="unique">Cupom único por lead</SelectItem></SelectContent></Select>
                    {form.coupon_mode === "fixed" && <Input value={form.fixed_coupon_code} onChange={(e) => patch({ fixed_coupon_code: e.target.value.toUpperCase() })} placeholder="CÓDIGO" />}
                    {form.coupon_mode === "unique" && <div className="grid grid-cols-2 gap-2"><Select value={form.discount_type} onValueChange={(value: any) => patch({ discount_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">% desconto</SelectItem><SelectItem value="fixed_amount">R$ fixo</SelectItem></SelectContent></Select><Input type="number" min={0} value={form.discount_value} onChange={(e) => patch({ discount_value: e.target.value })} /><div className="col-span-2"><Label className="text-[10px]">Validade em dias</Label><Input type="number" min={1} value={form.discount_expires_days} onChange={(e) => patch({ discount_expires_days: e.target.value })} /></div></div>}
                  </div>
                </details>

                <details className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Mensagem de boas-vindas no WhatsApp</summary>
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] text-muted-foreground">Opcional. Usa apenas templates aprovados na Meta.</p>
                    <Select value={form.template_name ? `${form.template_name}::${form.template_language}` : ""} onValueChange={(value) => { const [name, language] = value.split("::"); patch({ template_name: name ?? "", template_language: language ?? "", template_var_mapping: {} }); }}>
                      <SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                      <SelectContent>{approved.map((item: any) => <SelectItem key={`${item.name}-${item.language}`} value={`${item.name}::${item.language}`}>{item.name} ({item.language})</SelectItem>)}</SelectContent>
                    </Select>
                    {tokens.map((token) => {
                      const mapped = form.template_var_mapping[token] ?? "";
                      const source = mapped.startsWith("static:") ? "static" : mapped || "";
                      const staticValue = mapped.startsWith("static:") ? mapped.slice("static:".length) : "";
                      return <div key={token} className="space-y-1 rounded-lg border p-2"><span className="font-mono text-[10px]">{`{{${token}}}`}</span><Select value={source} onValueChange={(value) => { const next = { ...form.template_var_mapping }; next[token] = value === "static" ? "static:" : value; patch({ template_var_mapping: next }); }}><SelectTrigger className="h-8"><SelectValue placeholder="Origem" /></SelectTrigger><SelectContent><SelectItem value="name">Nome capturado</SelectItem><SelectItem value="coupon_code">Código do cupom</SelectItem><SelectItem value="static">Texto fixo</SelectItem></SelectContent></Select>{source === "static" && <Input className="h-8" value={staticValue} onChange={(e) => { const next = { ...form.template_var_mapping }; next[token] = `static:${e.target.value}`; patch({ template_var_mapping: next }); }} />}</div>;
                    })}
                  </div>
                </details>

                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div><p className="text-xs font-semibold">Publicar este pop-up</p><p className="text-[10px] text-muted-foreground">Ao ativar, os outros são desativados.</p></div>
                  <Switch checked={form.is_active} onCheckedChange={(value) => patch({ is_active: value })} />
                </div>

                <Button variant="outline" className="w-full gap-2" onClick={() => applyPresetToCurrent(form.design_config.templateKey)}><RotateCcw className="size-4" /> Restaurar visual do template</Button>
              </div>
            </aside>
          </div>
        </div>

        <WheelPrizesDialog
          open={wheelDialogOpen}
          onOpenChange={setWheelDialogOpen}
          prizes={form.design_config.wheelPrizes}
          onChange={(wheelPrizes) => patchDesign({ wheelPrizes })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Pop-ups configurados</p>
          <p className="text-xs text-muted-foreground">Crie campanhas visuais, capture WhatsApp e entregue benefícios automaticamente.</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { setSelectedPreset("essential"); setMode("templates"); }}><Plus className="size-4" /> Novo pop-up</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {(campaigns ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed px-6 py-14 text-center xl:col-span-2">
            <LayoutTemplate className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-semibold">Nenhum pop-up ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">Comece escolhendo um dos templates prontos.</p>
            <Button className="mt-4" onClick={() => setMode("templates")}>Escolher template</Button>
          </div>
        )}
        {(campaigns ?? []).map((campaign: any) => {
          const design = normalizePopupDesignConfig(campaign.design_config);
          const previewForm = rowToForm(campaign);
          return (
            <article key={campaign.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex min-h-[250px] items-center justify-center overflow-hidden bg-muted/30 p-4">
                <div className="origin-center scale-[0.58]"><PopupPreview campaign={previewForm} design={design} compact /></div>
              </div>
              <div className="space-y-3 border-t p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{campaign.name}</p><p className="text-sm text-muted-foreground">{campaign.headline}</p></div>
                  <div className="flex items-center gap-2"><Badge variant={campaign.is_active ? "default" : "outline"}>{campaign.is_active ? "Ativo" : "Rascunho"}</Badge><Switch checked={campaign.is_active} onCheckedChange={(value) => toggleMut.mutate({ id: campaign.id, is_active: value })} /></div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">{getPopupTemplatePreset(design.templateKey === "custom" ? "essential" : design.templateKey).name}</Badge><Badge variant="outline">{campaign.coupon_mode === "none" ? "Sem cupom" : campaign.coupon_mode === "fixed" ? "Cupom fixo" : "Cupom único"}</Badge>{design.journey === "progressive" && <Badge variant="outline">{popupStageCount(design, campaign.collect_name)} etapas</Badge>}{design.interaction === "wheel" && <Badge variant="outline">Roleta</Badge>}</div>
                <div className="flex gap-2"><Button size="sm" variant="outline" className="gap-1" onClick={() => { setForm(rowToForm(campaign)); setPreviewStage("capture"); setMode("editor"); }}><Pencil className="size-3.5" /> Editar</Button><Button size="sm" variant="ghost" className="gap-1 text-critical" onClick={() => { if (confirm(`Excluir o pop-up “${campaign.name}”?`)) deleteMut.mutate(campaign.id); }}><Trash2 className="size-3.5" /> Excluir</Button></div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
