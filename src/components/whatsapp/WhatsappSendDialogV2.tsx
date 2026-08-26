import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Info, MessageSquare, Send, ShieldCheck, Users } from "lucide-react";
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
import {
  extractWhatsappBodyVariables,
  missingWhatsappTemplateVariableIndexes,
  renderWhatsappTemplateBodyPreview,
  suggestedWhatsappDynamicToken,
  type WhatsappTemplateComponent,
} from "@/lib/whatsapp-template-variables";

export type SendDialogSeed = { nome: string; segmentType: SegmentType | string; segmentId?: string; oferta: string };
type TemplateOption = { name: string; language: string; status: string; components: WhatsappTemplateComponent[] };
type RecipientSample = { id: string; name: string; email: string | null; phone: string | null };

function futureScheduleIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return null;
  return date.toISOString();
}
function formatSchedule(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Agendado";
}

export function WhatsappSendDialog({ seed, open, onOpenChange, onDone, segments = [] }: {
  seed: SendDialogSeed | null; open: boolean; onOpenChange: (value: boolean) => void; onDone?: () => void; segments?: { id: string; nome: string }[];
}) {
  const runCreateCampaign = useServerFn(createAndSendCampaign);
  const runPreview = useServerFn(previewWhatsappAudience);
  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [messageType, setMessageType] = useState<"marketing" | "utility">("marketing");
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
    setNome(seed.nome); setSegmentType(String(seed.segmentType || "sem_recompra")); setSegmentId(seed.segmentId);
    setStep(1); setSendNow(true); setScheduledAt(""); setTemplateName(""); setBodyParams([]); setCoupon(""); setCampaignTag("");
  }, [seed, open]);

  const audienceSelection = useMemo(() => { try { return normalizeWhatsappAudienceSelection(segmentType, segmentId); } catch { return null; } }, [segmentType, segmentId]);
  const selectedSegmentName = useMemo(() => {
    const id = audienceSelection?.segmentId;
    if (id) return segments.find((segment) => segment.id === id)?.nome ?? "Segmento customizado";
    if (audienceSelection?.segmentType === "sem_recompra") return "Sem Recompra (Padrão)";
    return audienceSelection?.segmentType ?? "Público não definido";
  }, [audienceSelection, segments]);

  const { data: templatesResult } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listMetaTemplates(), enabled: open });
  const approved = ((templatesResult?.success ? templatesResult.templates : []) as TemplateOption[]).filter((template) => template.status === "APPROVED");
  const selectedTemplate = approved.find((template) => template.name === templateName);
  const templateVariables = extractWhatsappBodyVariables(selectedTemplate?.components);

  const { data: preview, isLoading: loadingPreview, isError: previewError, refetch: refetchPreview } = useQuery({
    queryKey: ["segment-preview-detailed", audienceSelection?.segmentType, audienceSelection?.segmentId, open, step],
    queryFn: () => runPreview({ data: { segmentType: audienceSelection!.segmentType, segmentId: audienceSelection!.segmentId } }),
    enabled: Boolean(open && step >= 2 && audienceSelection), retry: 1,
  });
  const recipients = (preview?.recipientSamples ?? []) as RecipientSample[];
  const hasRecipients = (preview?.destinatarios ?? 0) > 0;
  const missingVariables = missingWhatsappTemplateVariableIndexes(templateVariables, bodyParams);

  const submit = async (requireApproval: boolean) => {
    if (!audienceSelection) return void toast.error("Selecione novamente o público da campanha.");
    if (!selectedTemplate) return void toast.error("Selecione um template aprovado.");
    if (missingVariables.length) return void toast.error(`Preencha ${templateVariables[missingVariables[0]!]?.label ?? "todas as variáveis"} antes de continuar.`);
    const sendAt = sendNow ? undefined : futureScheduleIso(scheduledAt);
    if (!sendNow && !sendAt) return void toast.error("Escolha uma data e hora futura para o agendamento.");
    if (!hasRecipients) return void toast.error("Esse público está com 0 destinatários válidos.");
    setBusy(true);
    try {
      const result = await runCreateCampaign({ data: {
        nome: nome.trim() || "Campanha", segmentType: audienceSelection.segmentType, segmentId: audienceSelection.segmentId,
        messageType, templateName, templateLanguage: selectedTemplate.language, couponCode: coupon.trim() || undefined,
        bodyParams: templateVariables.map((_, index) => String(bodyParams[index] ?? "").trim()), requireApproval,
        campaignTag: campaignTag.trim() || undefined, sendAt,
      }});
      if (!result.success) return void toast.error(result.error || "Falha ao criar a campanha.");
      toast.success(requireApproval ? "Campanha salva para aprovação." : sendAt ? `Campanha agendada para ${formatSchedule(sendAt)}.` : "Campanha enfileirada para envio.");
      onOpenChange(false); onDone?.();
    } catch (error: any) { toast.error("Erro: " + (error?.message ?? "falha")); } finally { setBusy(false); }
  };

  const steps = ["Identificação", "Público", "Mensagem", "Agendamento", "Revisão"];
  const reviewBlocked = loadingPreview || previewError || !audienceSelection || !hasRecipients || !selectedTemplate || missingVariables.length > 0;

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl overflow-hidden border-none p-0 shadow-2xl">
    <div className="flex h-[650px]">
      <div className="flex w-64 flex-col gap-8 bg-slate-900 p-8">
        <div className="mb-4 flex items-center gap-3 text-white"><div className="flex size-8 items-center justify-center rounded-lg bg-brand"><Send className="size-4" /></div><span className="font-bold">WhatsApp API</span></div>
        <div className="space-y-6">{steps.map((label, index) => { const number = index + 1; return <div key={label} className="flex items-center gap-3"><div className={`flex size-6 items-center justify-center rounded-full border text-[10px] font-bold ${number === step ? "border-brand bg-brand text-white" : number < step ? "border-brand/40 bg-brand/20 text-brand" : "border-slate-700 text-slate-500"}`}>{number < step ? <CheckCircle2 className="size-3" /> : number}</div><span className={`text-xs font-medium ${number === step ? "text-white" : "text-slate-500"}`}>{label}</span></div>; })}</div>
        <div className="mt-auto rounded-xl border border-slate-700/50 bg-slate-800/50 p-4"><div className="mb-2 flex items-center gap-2"><ShieldCheck className="size-3 text-success" /><span className="text-[10px] font-bold uppercase text-slate-400">Conta Oficial</span></div><p className="text-[11px] text-slate-500">O envio real continua passando pela fila protegida.</p></div>
      </div>
      <div className="flex flex-1 flex-col bg-background">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="mb-8"><h2 className="text-2xl font-bold">{steps[step - 1]}</h2><p className="mt-1 text-sm text-muted-foreground">{step === 3 ? "Selecione o template e preencha todas as variáveis que ele realmente possui na Meta." : "Configure esta etapa antes de avançar."}</p></div>
          {step === 1 && <div className="space-y-6"><div className="space-y-2"><Label>Nome da campanha</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-12" /></div><div className="flex items-center gap-3 rounded-xl border border-dashed p-4"><MessageSquare className="size-5 text-success" /><div><p className="font-bold">Conta Meta configurada</p><p className="text-xs text-muted-foreground">API oficial do WhatsApp</p></div></div><div className="space-y-2"><Label>Tag da campanha (opcional)</Label><Input value={campaignTag} onChange={(e) => setCampaignTag(e.target.value)} /></div></div>}
          {step === 2 && <div className="space-y-6"><div className="space-y-2"><Label>Selecione o segmento</Label><Select value={segmentId || segmentType} onValueChange={(value) => { const custom = segments.some((segment) => segment.id === value); setSegmentType(custom ? "custom" : value); setSegmentId(custom ? value : undefined); }}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem_recompra">Sem Recompra (Padrão)</SelectItem>{segments.map((segment) => <SelectItem key={segment.id} value={segment.id}>{segment.nome}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Selecionado: <strong>{selectedSegmentName}</strong></p></div>
            {previewError && <div className="rounded-xl border border-critical/30 bg-critical/5 p-4 text-sm text-critical">Não foi possível calcular o público.</div>}
            <div className="grid grid-cols-3 gap-3"><Metric label="No segmento" value={loadingPreview ? "..." : preview?.clientes ?? 0} /><Metric label="Com telefone" value={loadingPreview ? "..." : preview?.comTelefone ?? 0} /><Metric label="Destinatários" value={loadingPreview ? "..." : preview?.destinatarios ?? 0} /></div>
            {recipients.length > 0 && <RecipientSampleList recipients={recipients} total={preview?.destinatarios ?? 0} onRefresh={() => refetchPreview()} />}
            {!loadingPreview && audienceSelection && !previewError && !hasRecipients && <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm"><Info className="size-4" />Nenhum destinatário válido identificado.</div>}
          </div>}
          {step === 3 && <div className="grid grid-cols-1 gap-8 md:grid-cols-5"><div className="space-y-6 md:col-span-3">
            <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Tipo</Label><Select value={messageType} onValueChange={(value) => setMessageType(value as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="marketing">Marketing</SelectItem><SelectItem value="utility">Utilidade</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Template aprovado</Label><Select value={templateName} onValueChange={(value) => { const template = approved.find((item) => item.name === value); setTemplateName(value); setBodyParams(extractWhatsappBodyVariables(template?.components).map((variable) => suggestedWhatsappDynamicToken(variable.key) ?? "")); }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{approved.map((template) => <SelectItem key={`${template.name}-${template.language}`} value={template.name}>{template.name}</SelectItem>)}</SelectContent></Select></div></div>
            {selectedTemplate && templateVariables.length === 0 && <div className="rounded-xl bg-success/10 p-4 text-sm text-success">Este template não possui variáveis no corpo.</div>}
            {templateVariables.length > 0 && <div className="space-y-4 border-t pt-4"><p className="text-xs font-bold uppercase text-muted-foreground">Variáveis do template ({templateVariables.length})</p>{templateVariables.map((variable, index) => <div key={variable.key} className="space-y-1"><Label className="font-mono text-xs">{variable.label}</Label><Input value={bodyParams[index] ?? ""} placeholder={suggestedWhatsappDynamicToken(variable.key) ?? `Valor para ${variable.label}`} onChange={(e) => { const next = [...bodyParams]; next[index] = e.target.value; setBodyParams(next); }} /></div>)}</div>}
          </div><div className="md:col-span-2"><p className="mb-3 text-xs font-bold uppercase text-muted-foreground">Prévia</p><div className="rounded-2xl border bg-muted/30 p-4">{selectedTemplate ? <div className="whitespace-pre-wrap rounded-lg bg-background p-3 text-sm">{renderWhatsappTemplateBodyPreview(selectedTemplate.components, bodyParams)}</div> : <p className="text-sm italic text-muted-foreground">Selecione um template...</p>}</div></div></div>}
          {step === 4 && <div className="mx-auto max-w-md space-y-8 py-8"><div className="text-center"><Calendar className="mx-auto size-10 text-brand" /><h3 className="mt-3 text-lg font-bold">Quando disparar?</h3></div><RadioGroup value={sendNow ? "agora" : "agendar"} onValueChange={(value) => setSendNow(value === "agora")}><div className="flex items-center gap-3 rounded-xl border p-5"><RadioGroupItem value="agora" id="send-now-v2" /><Label htmlFor="send-now-v2">Enviar imediatamente</Label></div><div className="flex items-center gap-3 rounded-xl border p-5"><RadioGroupItem value="agendar" id="schedule-v2" /><Label htmlFor="schedule-v2">Agendar horário</Label></div></RadioGroup>{!sendNow && <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />}</div>}
          {step === 5 && <div className="mx-auto max-w-2xl space-y-6"><div className="text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h3 className="mt-3 text-xl font-bold">Revisão final</h3></div><div className="grid grid-cols-2 gap-2"><Summary label="Campanha" value={nome} /><Summary label="Público" value={`${preview?.destinatarios ?? 0} — ${selectedSegmentName}`} /><Summary label="Template" value={templateName} /><Summary label="Agendamento" value={sendNow ? "Imediato" : formatSchedule(scheduledAt)} /></div>{templateVariables.length > 0 && <div className="rounded-xl border p-4"><p className="mb-2 font-semibold">Variáveis</p>{templateVariables.map((variable, index) => <p key={variable.key} className="text-sm"><span className="font-mono">{variable.label}</span>: {bodyParams[index] || <span className="text-critical">não preenchida</span>}</p>)}</div>}</div>}
        </div>
        <div className="flex items-center justify-between border-t bg-muted/20 p-8"><Button variant="ghost" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1 || busy}><ChevronLeft className="mr-1 size-4" />Anterior</Button><div className="flex gap-3">{step === 5 && <Button variant="outline" onClick={() => submit(true)} disabled={busy || reviewBlocked}>Salvar para Aprovação</Button>}<Button onClick={() => step < 5 ? setStep((value) => value + 1) : submit(false)} disabled={busy || previewError || (step === 1 && !nome.trim()) || (step === 2 && (loadingPreview || !hasRecipients)) || (step === 3 && (!selectedTemplate || missingVariables.length > 0)) || (step === 4 && !sendNow && !futureScheduleIso(scheduledAt)) || (step === 5 && reviewBlocked)}>{busy ? "Processando..." : step === 5 ? "Confirmar Envio" : "Próximo"}{step < 5 && <ChevronRight className="ml-1 size-4" />}</Button></div></div>
      </div>
    </div>
  </DialogContent></Dialog>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <Card className="shadow-none"><CardContent className="p-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></CardContent></Card>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border p-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 font-bold">{value || "—"}</p></div>; }
function RecipientSampleList({ recipients, total, onRefresh }: { recipients: RecipientSample[]; total: number; onRefresh: () => void }) { return <div className="rounded-xl border bg-muted/20 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="font-semibold">Clientes identificados</p><p className="text-xs text-muted-foreground">Amostra dos destinatários.</p></div><Button variant="outline" size="sm" onClick={onRefresh}>Atualizar</Button></div>{recipients.slice(0, 5).map((recipient) => <div key={recipient.id} className="mb-2 flex items-center justify-between rounded-lg bg-background px-3 py-2"><div><p className="text-sm font-medium">{recipient.name}</p><p className="text-xs text-muted-foreground">{recipient.email || "Sem e-mail"}</p></div><span className="text-xs text-muted-foreground">{maskWhatsappRecipientPhone(recipient.phone)}</span></div>)}{total > 5 && <Badge variant="outline">+ {total - 5} outros</Badge>}</div>; }
