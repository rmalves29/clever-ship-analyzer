import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  MessageSquare,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SegmentType } from "@/lib/crm-mock";
import { maskWhatsappRecipientPhone, normalizeWhatsappAudienceSelection } from "@/lib/whatsapp-audience-selection";
import { previewWhatsappAudience } from "@/lib/whatsapp-audience-preview.functions";
import { createAndSendCampaign, listMetaTemplates } from "@/lib/whatsapp-meta.functions";
import { extractTemplateBodyTokens, isNamedParameterToken } from "@/lib/whatsapp-template-body-tokens";

export type SendDialogSeed = {
  nome: string;
  segmentType: SegmentType | string;
  segmentId?: string;
  oferta: string;
};

type TemplateOption = {
  name: string;
  language: string;
  status: string;
  category: string;
  components: { type: string; text?: string }[];
};

type RecipientSample = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

function templateBodyTokens(components: TemplateOption["components"]): string[] {
  const body = components.find((component) => component.type === "BODY");
  return extractTemplateBodyTokens(body?.text);
}

function templateMessageType(category: string | null | undefined): "marketing" | "utility" {
  return String(category ?? "").toUpperCase() === "UTILITY" ? "utility" : "marketing";
}

function templateCategoryLabel(category: string | null | undefined): string {
  const normalized = String(category ?? "").toUpperCase();
  if (normalized === "UTILITY") return "Utilidade";
  if (normalized === "MARKETING") return "Marketing";
  if (normalized === "AUTHENTICATION") return "Autenticação";
  return category || "Categoria não informada";
}

function futureScheduleIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return null;
  return date.toISOString();
}

function formatSchedule(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Agendado";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function WhatsappSendDialog({
  seed,
  open,
  onOpenChange,
  onDone,
  segments = [],
}: {
  seed: SendDialogSeed | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onDone?: () => void;
  segments?: { id: string; nome: string }[];
}) {
  const runCreateCampaign = useServerFn(createAndSendCampaign);
  const runPreview = useServerFn(previewWhatsappAudience);

  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [coupon, setCoupon] = useState("");
  const [segmentType, setSegmentType] = useState<string>("sem_recompra");
  const [segmentId, setSegmentId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [campaignTag, setCampaignTag] = useState("");

  useEffect(() => {
    if (!seed || !open) return;
    setNome(seed.nome);
    setSegmentType(String(seed.segmentType || "sem_recompra"));
    setSegmentId(seed.segmentId);
    setStep(1);
    setSendNow(true);
    setScheduledAt("");
    setTemplateName("");
    setBodyParams([]);
    setCoupon("");
    setCampaignTag("");
  }, [seed, open]);

  const audienceSelection = useMemo(() => {
    try {
      return normalizeWhatsappAudienceSelection(segmentType, segmentId);
    } catch {
      return null;
    }
  }, [segmentType, segmentId]);

  const selectedSegmentName = useMemo(() => {
    const id = audienceSelection?.segmentId;
    if (id) return segments.find((segment) => segment.id === id)?.nome ?? "Segmento customizado";
    if (audienceSelection?.segmentType === "sem_recompra") return "Sem Recompra (Padrão)";
    return audienceSelection?.segmentType ?? "Público não definido";
  }, [audienceSelection, segments]);

  const { data: templatesResult } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => listMetaTemplates(),
    enabled: open,
  });

  const approved: TemplateOption[] = (templatesResult?.success ? templatesResult.templates : []).filter(
    (template: { status: string }) => template.status === "APPROVED",
  );
  const selectedTemplate = approved.find((template) => template.name === templateName);
  const messageType = templateMessageType(selectedTemplate?.category);
  const bodyTokens = selectedTemplate ? templateBodyTokens(selectedTemplate.components) : [];
  const bodyVarCount = bodyTokens.length;

  const {
    data: preview,
    isLoading: loadingPreview,
    isError: previewError,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: ["segment-preview-detailed", audienceSelection?.segmentType, audienceSelection?.segmentId, open, step],
    queryFn: () =>
      runPreview({
        data: {
          segmentType: audienceSelection!.segmentType,
          segmentId: audienceSelection!.segmentId,
        },
      }),
    enabled: Boolean(open && step >= 2 && audienceSelection),
    retry: 1,
  });

  const recipients = (preview?.recipientSamples ?? []) as RecipientSample[];
  const hasRecipients = (preview?.destinatarios ?? 0) > 0;

  const submit = async (requireApproval: boolean) => {
    if (!audienceSelection) {
      toast.error("O público selecionado ficou inconsistente. Volte à etapa Público e selecione o segmento novamente.");
      return;
    }

    const sendAt = sendNow ? undefined : futureScheduleIso(scheduledAt);
    if (!sendNow && !sendAt) {
      toast.error("Escolha uma data e hora futura para o agendamento.");
      return;
    }
    if (!hasRecipients) {
      toast.error("Esse público está com 0 destinatários válidos. O sistema não criará a campanha até o público ser identificado.");
      return;
    }

    setBusy(true);
    try {
      const result = await runCreateCampaign({
        data: {
          nome: nome.trim() || "Campanha",
          segmentType: audienceSelection.segmentType,
          segmentId: audienceSelection.segmentId,
          messageType,
          templateName: templateName || undefined,
          couponCode: coupon.trim() || undefined,
          bodyParams: selectedTemplate ? bodyParams.slice(0, bodyVarCount).map((value) => value.trim()) : [],
          bodyParamTokens: selectedTemplate ? bodyTokens : undefined,
          requireApproval,
          campaignTag: campaignTag.trim() || undefined,
          sendAt,
        },
      });

      if (!result.success) {
        toast.error(result.error || "Falha ao criar a campanha.");
        return;
      }

      toast.success(
        requireApproval
          ? "Campanha salva para aprovação. Nenhuma mensagem foi enfileirada ainda."
          : sendAt
            ? `Campanha agendada para ${formatSchedule(sendAt)}.`
            : "Campanha enfileirada — o worker vai processar os envios.",
      );
      onOpenChange(false);
      onDone?.();
    } catch (error: any) {
      toast.error("Erro: " + (error?.message ?? "falha"));
    } finally {
      setBusy(false);
    }
  };

  const steps = ["Identificação", "Público", "Mensagem", "Agendamento", "Revisão"];
  const reviewBlocked = loadingPreview || previewError || !audienceSelection || !hasRecipients;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden border-none p-0 shadow-2xl">
        <div className="flex h-[650px]">
          <div className="flex w-64 flex-col gap-8 bg-slate-900 p-8">
            <div className="mb-4 flex items-center gap-3 text-white">
              <div className="flex size-8 items-center justify-center rounded-lg bg-brand">
                <Send className="size-4" />
              </div>
              <span className="font-bold tracking-tight">WhatsApp API</span>
            </div>

            <div className="space-y-6">
              {steps.map((label, index) => {
                const stepNumber = index + 1;
                const active = stepNumber === step;
                const completed = stepNumber < step;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <div
                      className={`flex size-6 items-center justify-center rounded-full border text-[10px] font-bold transition-colors ${
                        active
                          ? "border-brand bg-brand text-white"
                          : completed
                            ? "border-brand/40 bg-brand/20 text-brand"
                            : "border-slate-700 text-slate-500"
                      }`}
                    >
                      {completed ? <CheckCircle2 className="size-3" /> : stepNumber}
                    </div>
                    <span className={`text-xs font-medium ${active ? "text-white" : "text-slate-500"}`}>{label}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-auto rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="size-3 text-success" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conta Oficial</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Confirmar apenas cria/enfileira. O envio real é processado pelo worker da fila.
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-col bg-background">
            <div className="flex-1 overflow-y-auto p-8">
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight">{steps[step - 1]}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {step === 1 && "Defina o nome da campanha e uma tag opcional."}
                  {step === 2 && "Selecione o segmento e confirme exatamente quem será considerado para o envio."}
                  {step === 3 && "Configure o template aprovado e suas variáveis dinâmicas."}
                  {step === 4 && "Escolha envio imediato ou uma data futura."}
                  {step === 5 && "Revise o segmento e os clientes que receberão antes de confirmar."}
                </p>
              </div>

              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Nome da campanha</Label>
                    <Input
                      value={nome}
                      onChange={(event) => setNome(event.target.value)}
                      placeholder="Ex: Promoção de Inverno 2026"
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Conta de envio</Label>
                    <div className="flex items-center gap-3 rounded-xl border border-dashed p-4">
                      <div className="flex size-10 items-center justify-center rounded-full bg-success/10">
                        <MessageSquare className="size-5 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Conta Meta configurada</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">API oficial do WhatsApp</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <Label className="text-sm font-semibold">Tag da campanha (opcional)</Label>
                    <Input
                      value={campaignTag}
                      onChange={(event) => setCampaignTag(event.target.value)}
                      placeholder="Ex: promo_inverno_2026"
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Selecione o segmento</Label>
                    <Select
                      value={segmentId || segmentType}
                      onValueChange={(value) => {
                        const custom = segments.some((segment) => segment.id === value);
                        if (custom) {
                          setSegmentType("custom");
                          setSegmentId(value);
                        } else {
                          setSegmentType(value);
                          setSegmentId(undefined);
                        }
                      }}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem_recompra">Sem Recompra (Padrão)</SelectItem>
                        {segments.map((segment) => (
                          <SelectItem key={segment.id} value={segment.id}>{segment.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Selecionado: <strong>{selectedSegmentName}</strong></p>
                  </div>

                  {!audienceSelection && (
                    <div className="rounded-xl border border-critical/30 bg-critical/5 p-4 text-sm text-critical">
                      O identificador do segmento não chegou corretamente. Selecione o público novamente.
                    </div>
                  )}

                  {previewError && (
                    <div className="rounded-xl border border-critical/30 bg-critical/5 p-4 text-sm text-critical">
                      Não foi possível calcular o público. O envio ficará bloqueado até a prévia carregar corretamente.
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <Card className="shadow-none">
                      <CardContent className="p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">No segmento</p>
                        <p className="text-xl font-bold">{loadingPreview ? "..." : (preview?.clientes ?? 0)}</p>
                      </CardContent>
                    </Card>
                    <Card className="shadow-none">
                      <CardContent className="p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Com telefone</p>
                        <p className="text-xl font-bold">{loadingPreview ? "..." : (preview?.comTelefone ?? 0)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-brand/20 bg-brand/5 shadow-none">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <Users className="size-4 text-brand" />
                          <p className="text-[10px] font-bold uppercase tracking-wider text-brand">Destinatários</p>
                        </div>
                        <p className="text-xl font-bold">{loadingPreview ? "..." : (preview?.destinatarios ?? 0)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {recipients.length > 0 && (
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Clientes identificados</p>
                          <p className="text-xs text-muted-foreground">Amostra dos destinatários que o sistema encontrou.</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => refetchPreview()}>
                          Atualizar
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {recipients.slice(0, 5).map((recipient) => (
                          <div key={recipient.id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{recipient.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{recipient.email || "Sem e-mail"}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">{maskWhatsappRecipientPhone(recipient.phone)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!loadingPreview && audienceSelection && !previewError && !hasRecipients && (
                    <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
                      <Info className="mt-0.5 size-4 shrink-0" />
                      <span>
                        Nenhum destinatário foi identificado. O sistema não permitirá avançar para um envio real com público vazio.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="grid grid-cols-1 gap-8 md:grid-cols-5">
                  <div className="space-y-6 md:col-span-3">
                    <div className="space-y-4">
                      <Label className="text-sm font-semibold">Tipo de mensagem</Label>
                      <RadioGroup value="template" className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-3 rounded-xl border border-brand bg-brand/5 p-4">
                          <RadioGroupItem value="template" id="template-official" />
                          <Label htmlFor="template-official" className="cursor-pointer text-sm font-semibold">Template Oficial</Label>
                        </div>
                        <div className="flex cursor-not-allowed items-center space-x-3 rounded-xl border p-4 opacity-40">
                          <RadioGroupItem value="comum" id="message-common" disabled />
                          <Label htmlFor="message-common" className="text-sm font-semibold">Msg Comum</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Template aprovado</Label>
                      <Select
                        value={templateName}
                        onValueChange={(value) => {
                          setTemplateName(value);
                          setBodyParams([]);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {approved.map((template) => (
                            <SelectItem key={`${template.name}-${template.language}`} value={template.name}>
                              {template.name} · {templateCategoryLabel(template.category)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedTemplate && (
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                          <Badge variant="outline">{templateCategoryLabel(selectedTemplate.category)}</Badge>
                          <span className="text-xs text-muted-foreground">Categoria definida na Meta para este template.</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="campaign-coupon" className="text-sm font-semibold">
                        Cupom da Shopify (opcional)
                      </Label>
                      <Input
                        id="campaign-coupon"
                        value={coupon}
                        placeholder="Ex: 12PIX"
                        onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                      />
                      <p className="text-xs text-muted-foreground">
                        O telefone continua sendo a regra principal em até 72 horas; o cupom serve como confirmação da conversão.
                      </p>
                    </div>

                    {selectedTemplate && bodyVarCount > 0 && (
                      <div className="space-y-4 border-t pt-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Variáveis dinâmicas</p>
                        <div className="rounded-lg bg-blue-50/50 p-3 text-[10px] text-blue-600 dark:bg-blue-900/10 dark:text-blue-400">
                          Use tokens como {"{{NOME_CLIENTE}}"}, {"{{NUMERO_PEDIDO}}"}, {"{{VALOR_TOTAL}}"}, {"{{ITENS_COMPRADOS}}"}, {"{{RASTREIO}}"}, {"{{LINK_CHECKOUT}}"}, {"{{CUPOM_CASHBACK}}"}, {"{{VALOR_CASHBACK}}"}, {"{{COMPRA_MINIMA_CASHBACK}}"} ou {"{{VALIDADE_CASHBACK}}"}.
                        </div>
                        {bodyTokens.map((token, index) => (
                          <div key={token} className="space-y-1.5">
                            <Label className="text-xs font-bold">
                              {isNamedParameterToken(token) ? `Variável {{${token}}}` : `Variável {{${index + 1}}}`}
                            </Label>
                            <Input
                              value={bodyParams[index] ?? ""}
                              placeholder="Ex: {{NOME_CLIENTE}}"
                              onChange={(event) => {
                                const next = [...bodyParams];
                                next[index] = event.target.value;
                                setBodyParams(next);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prévia do WhatsApp</p>
                    <div className="rounded-2xl border bg-muted/30 p-4">
                      {selectedTemplate ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{templateCategoryLabel(selectedTemplate.category)}</Badge>
                            <span className="text-[10px] text-muted-foreground">classificação da Meta</span>
                          </div>
                          <div className="whitespace-pre-wrap rounded-lg bg-background p-3 text-sm">
                            {selectedTemplate.components.find((component) => component.type === "BODY")?.text?.replace(
                              /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
                              (full, token) => {
                                const index = bodyTokens.indexOf(token);
                                return index >= 0 ? bodyParams[index] || full : full;
                              },
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm italic text-muted-foreground">Selecione um template...</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="mx-auto max-w-md space-y-8 py-8">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand">
                      <Calendar className="size-8" />
                    </div>
                    <h3 className="text-lg font-bold">Quando disparar?</h3>
                  </div>

                  <RadioGroup
                    value={sendNow ? "agora" : "agendar"}
                    onValueChange={(value) => setSendNow(value === "agora")}
                    className="grid gap-4"
                  >
                    <div className={`flex items-center space-x-3 rounded-xl border p-5 ${sendNow ? "border-brand bg-brand/5" : ""}`}>
                      <RadioGroupItem value="agora" id="send-now" />
                      <div>
                        <Label htmlFor="send-now" className="cursor-pointer font-bold">Enviar imediatamente</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">As mensagens entram na fila prontas para o worker.</p>
                      </div>
                    </div>
                    <div className={`flex items-center space-x-3 rounded-xl border p-5 ${!sendNow ? "border-brand bg-brand/5" : ""}`}>
                      <RadioGroupItem value="agendar" id="schedule-send" />
                      <div>
                        <Label htmlFor="schedule-send" className="cursor-pointer font-bold">Agendar horário</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">A fila libera as mensagens na data selecionada.</p>
                      </div>
                    </div>
                  </RadioGroup>

                  {!sendNow && (
                    <div className="space-y-2">
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(event) => setScheduledAt(event.target.value)}
                        min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                      />
                      {scheduledAt && !futureScheduleIso(scheduledAt) && <p className="text-xs text-critical">Escolha um horário futuro.</p>}
                    </div>
                  )}
                </div>
              )}

              {step === 5 && (
                <div className="mx-auto max-w-2xl space-y-6 py-4">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
                      <CheckCircle2 className="size-8" />
                    </div>
                    <h3 className="text-xl font-bold">Revisão final</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Confira exatamente qual segmento e quais clientes serão usados.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-muted">
                    <div className="space-y-1 bg-background p-5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Campanha</span>
                      <p className="font-bold">{nome || "Sem nome"}</p>
                    </div>
                    <div className="space-y-1 bg-background p-5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Público</span>
                      <p className="font-bold">{preview?.destinatarios ?? 0} destinatários</p>
                      <p className="text-xs text-muted-foreground">{selectedSegmentName}</p>
                      <p className="text-xs text-muted-foreground">{preview?.clientes ?? 0} no segmento · {preview?.comTelefone ?? 0} com telefone</p>
                    </div>
                    <div className="space-y-1 bg-background p-5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conteúdo</span>
                      <p className="font-bold">{templateName || "Nenhum template"}</p>
                      {selectedTemplate && <p className="text-xs text-muted-foreground">{templateCategoryLabel(selectedTemplate.category)}</p>}
                      {coupon.trim() && <p className="text-xs text-muted-foreground">Cupom: {coupon.trim()}</p>}
                    </div>
                    <div className="space-y-1 bg-background p-5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Agendamento</span>
                      <p className="font-bold text-brand">{sendNow ? "Imediato" : scheduledAt ? formatSchedule(scheduledAt) : "Não definido"}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-background p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">Quem irá receber</p>
                        <p className="text-xs text-muted-foreground">Amostra identificada diretamente no CRM antes do enfileiramento.</p>
                      </div>
                      <Badge variant="outline">{preview?.destinatarios ?? 0} elegíveis</Badge>
                    </div>

                    {loadingPreview ? (
                      <p className="text-sm text-muted-foreground">Calculando destinatários...</p>
                    ) : recipients.length > 0 ? (
                      <div className="space-y-2">
                        {recipients.slice(0, 5).map((recipient) => (
                          <div key={recipient.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{recipient.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{recipient.email || "Sem e-mail"}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">{maskWhatsappRecipientPhone(recipient.phone)}</span>
                          </div>
                        ))}
                        {(preview?.destinatarios ?? 0) > recipients.slice(0, 5).length && (
                          <p className="pt-1 text-xs text-muted-foreground">+ {(preview?.destinatarios ?? 0) - recipients.slice(0, 5).length} outros destinatários elegíveis.</p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-critical/30 bg-critical/5 p-4 text-sm text-critical">
                        Nenhum cliente foi identificado para este envio. Volte à etapa Público e selecione novamente o segmento.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t bg-muted/20 p-8">
              <Button
                variant="ghost"
                onClick={() => setStep((current) => Math.max(1, current - 1))}
                disabled={step === 1 || busy}
                className="gap-2"
              >
                <ChevronLeft className="size-4" /> Anterior
              </Button>

              <div className="flex gap-3">
                {step === 5 && (
                  <Button
                    variant="outline"
                    onClick={() => submit(true)}
                    disabled={busy || reviewBlocked}
                  >
                    Salvar para Aprovação
                  </Button>
                )}

                <Button
                  onClick={() => (step < 5 ? setStep((current) => current + 1) : submit(false))}
                  disabled={
                    busy ||
                    previewError ||
                    (step >= 2 && !audienceSelection) ||
                    (step === 1 && !nome.trim()) ||
                    (step === 2 && (loadingPreview || !hasRecipients)) ||
                    (step === 3 && !templateName) ||
                    (step === 3 && bodyVarCount > 0 && bodyParams.slice(0, bodyVarCount).some((value) => !value?.trim())) ||
                    (step === 4 && !sendNow && !futureScheduleIso(scheduledAt)) ||
                    (step === 5 && reviewBlocked)
                  }
                  className="min-w-[120px] gap-2"
                >
                  {busy ? "Processando..." : step === 5 ? "Confirmar Envio" : "Próximo"}
                  {step < 5 && <ChevronRight className="size-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
