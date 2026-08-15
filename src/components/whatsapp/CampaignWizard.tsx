import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, ChevronLeft as ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SEGMENT_TYPES, type SegmentType } from "@/lib/crm-mock";
import {
  getWhatsappMetaStatus,
  previewSegment,
  listMetaTemplates,
  createAndSendCampaign,
} from "@/lib/whatsapp-meta.functions";

const SEGMENT_LABEL: Record<SegmentType, { label: string; description: string }> = {
  ticket_alto: { label: "Ticket alto", description: "Clientes com ticket médio acima da meta." },
  sem_recompra: { label: "Sem recompra", description: "Compraram 1x há 14+ dias e nunca voltaram." },
  recompra_30d: { label: "Recompra 30d", description: "Compraram 1x nos últimos 30 dias." },
  recompra_60d: { label: "Recompra 60d", description: "Compraram 1x entre 31 e 60 dias atrás." },
  envio_atrasado: { label: "Envio atrasado", description: "Pedido recente demorou mais que a meta pra ser enviado." },
};

const STEPS = ["Identificação", "Público", "Mensagem", "Agendamento", "Revisão"] as const;

type TemplateOption = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: { type: string; text?: string; format?: string }[];
};

function countBodyVars(components: TemplateOption["components"]): number {
  const body = components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

function hasImageHeader(components: TemplateOption["components"]): boolean {
  return components.some((c) => c.type === "HEADER" && c.format === "IMAGE");
}

export function CampaignWizard({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [nome, setNome] = useState("");
  const [segmentType, setSegmentType] = useState<SegmentType | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [messageMode, setMessageMode] = useState<"template" | "comum">("template");
  const [templateName, setTemplateName] = useState<string>("");
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const { data: waStatus } = useQuery({ queryKey: ["whatsapp-meta-status"], queryFn: () => getWhatsappMetaStatus(), enabled: open });
  const { data: templatesResult } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listMetaTemplates(), enabled: open });
  const runPreview = useServerFn(previewSegment);
  const runCreate = useServerFn(createAndSendCampaign);

  const { data: preview } = useQuery({
    queryKey: ["whatsapp-segment-preview", segmentType],
    queryFn: () => runPreview({ data: { segmentType: segmentType! } }),
    enabled: open && Boolean(segmentType),
  });

  const templates = (templatesResult?.success ? templatesResult.templates : []) as TemplateOption[];
  const selectedTemplate = templates.find((t) => t.name === templateName);
  const bodyVarCount = selectedTemplate ? countBodyVars(selectedTemplate.components) : 0;
  const needsHeaderImage = selectedTemplate ? hasImageHeader(selectedTemplate.components) : false;

  const canAdvance = useMemo(() => {
    if (step === 0) return nome.trim().length > 0;
    if (step === 1) return Boolean(segmentType);
    if (step === 2) {
      if (messageMode !== "template") return false;
      if (!selectedTemplate) return false;
      if (needsHeaderImage && !headerImageUrl.trim()) return false;
      if (bodyParams.slice(0, bodyVarCount).some((p) => !p.trim())) return false;
      return true;
    }
    return true;
  }, [step, nome, segmentType, messageMode, selectedTemplate, needsHeaderImage, headerImageUrl, bodyParams, bodyVarCount]);

  const reset = () => {
    setStep(0);
    setNome("");
    setSegmentType(null);
    setCouponCode("");
    setMessageMode("template");
    setTemplateName("");
    setHeaderImageUrl("");
    setBodyParams([]);
  };

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  const handleSubmit = async () => {
    if (!segmentType || !selectedTemplate) return;
    setSending(true);
    try {
      const res = await runCreate({
        data: {
          nome: nome.trim(),
          segmentType,
          messageType: selectedTemplate.category.toLowerCase() === "utility" ? "utility" : "marketing",
          ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language,
          ...(headerImageUrl.trim() ? { headerImageUrl: headerImageUrl.trim() } : {}),
          bodyParams: bodyParams.slice(0, bodyVarCount),
        },
      });
      if (!res.success) {
        toast.error(res.error || "Falha ao criar a campanha.");
        return;
      }
      toast.success(`Campanha enviada: ${res.sent}/${res.total} mensagens (${res.failed} falharam).`);
      onCreated();
      handleClose();
    } catch (err: any) {
      toast.error("Erro ao criar campanha: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-2xl">
        <div>
          <h2 className="text-lg font-semibold">Criar Campanha</h2>
          <p className="text-sm text-muted-foreground">Configure o público, template e agendamento da campanha de WhatsApp.</p>
        </div>

        <div className="mt-4 rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    i < step ? "bg-brand text-primary-foreground" : i === step ? "bg-brand text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </div>
                <span className={cn("whitespace-nowrap text-sm", i === step ? "font-semibold" : "text-muted-foreground")}>{label}</span>
                {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
              </div>
            ))}
          </div>

          <div className="mt-5 min-h-[220px]">
            {step === 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Identificação da campanha</h3>
                <div className="space-y-2">
                  <Label htmlFor="wz-nome">Nome da campanha</Label>
                  <Input id="wz-nome" placeholder="Ex: Lançamento Coleção" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Conta de envio</Label>
                  <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {waStatus?.displayPhoneNumber ?? "Número não configurado ainda"} (padrão)
                  </div>
                  <p className="text-xs text-muted-foreground">Único número configurado em Configurações — ainda não há suporte pra múltiplas contas.</p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Público da campanha</h3>
                <div className="grid gap-2">
                  {SEGMENT_TYPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSegmentType(s)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        segmentType === s ? "border-brand bg-brand-soft" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <p className="font-medium">{SEGMENT_LABEL[s].label}</p>
                      <p className="text-xs text-muted-foreground">{SEGMENT_LABEL[s].description}</p>
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wz-cupom">Código de cupom (opcional)</Label>
                  <Input
                    id="wz-cupom"
                    placeholder="Ex: VOLTA10 — melhora a precisão da atribuição de vendas"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                  />
                </div>
                {segmentType && (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    {preview ? (
                      <>
                        <strong>{preview.comTelefone}</strong> clientes com telefone cadastrado
                        {preview.totalClientes !== preview.comTelefone && (
                          <span className="text-muted-foreground"> (de {preview.totalClientes} no segmento)</span>
                        )}
                      </>
                    ) : (
                      "Calculando público..."
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Mensagem da campanha</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMessageMode("template")}
                    className={cn("rounded-lg border p-3 text-left", messageMode === "template" ? "border-brand bg-brand-soft" : "border-border")}
                  >
                    <p className="font-medium">Template aprovado</p>
                    <p className="text-xs text-muted-foreground">Envio por template Meta aprovado.</p>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-lg border border-border p-3 text-left opacity-50"
                    title="Em breve — requer rastrear a janela de atendimento de 24h"
                  >
                    <p className="font-medium">Mensagem comum</p>
                    <p className="text-xs text-muted-foreground">Em breve (janela de 24h ainda não é rastreada).</p>
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wz-template">Template</Label>
                  <select
                    id="wz-template"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={templateName}
                    onChange={(e) => {
                      setTemplateName(e.target.value);
                      setBodyParams([]);
                      setHeaderImageUrl("");
                    }}
                  >
                    <option value="">Escolha um template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.name} disabled={t.status !== "APPROVED"}>
                        {t.name} {t.status !== "APPROVED" ? `(${t.status})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTemplate && (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    {needsHeaderImage && (
                      <div className="space-y-2">
                        <Label htmlFor="wz-header-img">URL da imagem do header</Label>
                        <Input
                          id="wz-header-img"
                          placeholder="https://..."
                          value={headerImageUrl}
                          onChange={(e) => setHeaderImageUrl(e.target.value)}
                        />
                      </div>
                    )}
                    {Array.from({ length: bodyVarCount }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Label htmlFor={`wz-var-${i}`}>{`{{${i + 1}}}`}</Label>
                        <Input
                          id={`wz-var-${i}`}
                          placeholder={`Texto pra substituir {{${i + 1}}} em todos os contatos`}
                          value={bodyParams[i] ?? ""}
                          onChange={(e) =>
                            setBodyParams((prev) => {
                              const next = [...prev];
                              next[i] = e.target.value;
                              return next;
                            })
                          }
                        />
                      </div>
                    ))}
                    {bodyVarCount === 0 && !needsHeaderImage && (
                      <p className="text-sm text-muted-foreground">Esse template não tem variáveis — pronto pra enviar.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Agendamento de envio</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg border border-brand bg-brand-soft p-3">
                    <Check className="size-4 text-brand" />
                    <span className="font-medium">Enviar agora</span>
                  </div>
                  <div className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-border p-3 opacity-50">
                    <div className="size-4 rounded-full border border-muted-foreground" />
                    <span>Agendar envio (em breve — requer agendador recorrente)</span>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && segmentType && selectedTemplate && (
              <div className="space-y-3">
                <h3 className="font-semibold">Revisão</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <dt className="text-muted-foreground">Nome</dt>
                  <dd className="font-medium">{nome}</dd>
                  <dt className="text-muted-foreground">Público</dt>
                  <dd className="font-medium">
                    {SEGMENT_LABEL[segmentType].label} ({preview?.comTelefone ?? "…"} contatos)
                  </dd>
                  <dt className="text-muted-foreground">Template</dt>
                  <dd className="font-medium">{selectedTemplate.name}</dd>
                  <dt className="text-muted-foreground">Cupom</dt>
                  <dd className="font-medium">{couponCode || "—"}</dd>
                  <dt className="text-muted-foreground">Envio</dt>
                  <dd className="font-medium">Agora</dd>
                </dl>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="mr-1 size-4" /> Anterior
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={!canAdvance}>
              Próximo <ChevronRight className="ml-1 size-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={sending}>
              {sending ? "Enviando..." : "Enviar campanha"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
