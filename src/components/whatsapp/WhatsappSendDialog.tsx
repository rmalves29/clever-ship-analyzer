import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Send, ShieldCheck, Users, Calendar, ChevronLeft, ChevronRight, MessageSquare, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import type { SegmentType } from "@/lib/crm-mock";
import { createAndSendCampaign, listMetaTemplates, previewSegment } from "@/lib/whatsapp-meta.functions";

export type SendDialogSeed = {
  nome: string;
  segmentType: SegmentType;
  segmentId?: string;
  oferta: string;
};

type TemplateOption = { name: string; language: string; status: string; components: { type: string; text?: string }[] };

function countBodyVars(components: TemplateOption["components"]): number {
  const body = components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
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
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
  segments?: { id: string; nome: string }[];
}) {
  const [step, setStep] = useState(1);
  const runCreateCampaign = useServerFn(createAndSendCampaign);
  const runPreview = useServerFn(previewSegment);

  const [nome, setNome] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [messageType, setMessageType] = useState<"marketing" | "utility">("marketing");
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [coupon, setCoupon] = useState("");
  const [segmentType, setSegmentType] = useState<SegmentType>("sem_recompra");
  const [segmentId, setSegmentId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [sendNow, setSendNow] = useState(true);

  useEffect(() => {
    if (seed && open) {
      setNome(seed.nome);
      setSegmentType(seed.segmentType);
      setSegmentId(seed.segmentId);
      setStep(1);
    }
  }, [seed, open]);

  const { data: templatesResult } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => listMetaTemplates(),
  });

  const approved: TemplateOption[] = (templatesResult?.success ? templatesResult.templates : []).filter(
    (t: { status: string }) => t.status === "APPROVED",
  );
  const selectedTemplate = approved.find((t) => t.name === templateName);
  const bodyVarCount = selectedTemplate ? countBodyVars(selectedTemplate.components) : 0;

  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ["segment-preview", segmentType, segmentId, open, step],
    queryFn: () => runPreview({ data: { segmentType, segmentId } }),
    enabled: Boolean(open && step >= 2),
  });

  const submit = async (requireApproval: boolean) => {
    setBusy(true);
    try {
      const res = await runCreateCampaign({
        data: {
          nome: nome.trim() || "Campanha",
          segmentType,
          segmentId,
          messageType,
          templateName: templateName || undefined,
          couponCode: coupon.trim() || undefined,
          bodyParams: selectedTemplate ? bodyParams.slice(0, bodyVarCount) : [],
          requireApproval,
        },
      });

      if (!res.success) {
        toast.error(res.error || "Falha ao criar a campanha.");
        return;
      }
      
      toast.success(requireApproval ? "Campanha enviada pra aprovação." : "Campanha enviada com sucesso!");
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast.error("Erro: " + (err?.message ?? "falha"));
    } finally {
      setBusy(false);
    }
  };

  const steps = ["Identificação", "Público", "Mensagem", "Agendamento", "Revisão"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden border-none shadow-2xl">
        <div className="flex h-[600px]">
          {/* Sidebar de Progresso */}
          <div className="w-64 bg-slate-900 p-8 flex flex-col gap-8">
            <div className="flex items-center gap-3 text-white mb-4">
              <div className="size-8 rounded-lg bg-brand flex items-center justify-center">
                <Send className="size-4" />
              </div>
              <span className="font-bold tracking-tight">WhatsApp API</span>
            </div>
            
            <div className="space-y-6">
              {steps.map((s, i) => {
                const stepNum = i + 1;
                const isActive = stepNum === step;
                const isCompleted = stepNum < step;
                
                return (
                  <div key={s} className="flex items-center gap-3 group">
                    <div className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${
                      isActive ? "bg-brand border-brand text-white shadow-[0_0_15px_rgba(var(--brand-rgb),0.5)]" : 
                      isCompleted ? "bg-brand/20 border-brand/40 text-brand" : 
                      "border-slate-700 text-slate-500"
                    }`}>
                      {isCompleted ? <CheckCircle2 className="size-3" /> : stepNum}
                    </div>
                    <span className={`text-xs font-medium transition-colors ${
                      isActive ? "text-white" : "text-slate-500"
                    }`}>{s}</span>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-auto">
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="size-3 text-success" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conta Oficial</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Esta campanha será enviada através da API oficial da Meta.
                </p>
              </div>
            </div>
          </div>

          {/* Área de Conteúdo */}
          <div className="flex-1 flex flex-col bg-background">
            <div className="p-8 flex-1 overflow-y-auto">
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight">{steps[step-1]}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {step === 1 && "Defina o nome e a conta de envio para identificar sua campanha."}
                  {step === 2 && "Selecione quem deve receber as mensagens desta campanha."}
                  {step === 3 && "Configure o conteúdo que seus clientes irão receber."}
                  {step === 4 && "Escolha o melhor momento para realizar os disparos."}
                  {step === 5 && "Confira todos os detalhes antes de iniciar o envio."}
                </p>
              </div>

              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Nome da campanha</Label>
                    <Input 
                      value={nome} 
                      onChange={(e) => setNome(e.target.value)} 
                      placeholder="Ex: Promoção de Inverno 2026"
                      className="h-12 bg-muted/30 border-muted-foreground/20 focus:border-brand transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Conta de envio</Label>
                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-dashed border-muted-foreground/30">
                      <div className="size-10 rounded-full bg-success/10 flex items-center justify-center">
                        <MessageSquare className="size-5 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">+55 31 7330-8275</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Número Oficial Verificado</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Selecione o segmento</Label>
                    <Select value={segmentId || segmentType} onValueChange={(v) => {
                      if (v.includes("-") || v.length > 20) {
                        setSegmentId(v);
                        setSegmentType("custom"); 
                      } else { 
                        setSegmentType(v as SegmentType); 
                        setSegmentId(undefined); 
                      }
                    }}>
                      <SelectTrigger className="h-12 bg-muted/30 border-muted-foreground/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem_recompra">Sem Recompra (Padrão)</SelectItem>
                        {segments.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-brand/5 border-brand/20 shadow-none">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
                          <Users className="size-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-brand uppercase tracking-wider">Destinatários</p>
                          <p className="text-xl font-bold">
                            {loadingPreview ? "..." : (preview?.destinatarios ?? 0)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/30 border-muted-foreground/10 shadow-none">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground">
                          <Info className="size-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Taxa Est. Entrega</p>
                          <p className="text-xl font-bold">~98.5%</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-8 animate-in fade-in slide-in-from-right-4 duration-300 h-full">
                  <div className="md:col-span-3 space-y-6">
                    <div className="space-y-4">
                      <Label className="text-sm font-semibold">Tipo de mensagem</Label>
                      <RadioGroup 
                        value={templateName ? "template" : "comum"} 
                        onValueChange={(v) => v === "comum" && setTemplateName("")}
                        className="grid grid-cols-2 gap-4"
                      >
                        <div className={`flex items-center space-x-3 border rounded-xl p-4 cursor-pointer transition-all ${templateName ? 'border-brand bg-brand/5 ring-1 ring-brand/30' : 'hover:bg-muted/50'}`}>
                          <RadioGroupItem value="template" id="t1" />
                          <Label htmlFor="t1" className="cursor-pointer font-semibold text-sm">Template Oficial</Label>
                        </div>
                        <div className={`flex items-center space-x-3 border rounded-xl p-4 opacity-40 grayscale cursor-not-allowed`}>
                          <RadioGroupItem value="comum" id="t2" disabled />
                          <Label htmlFor="t2" className="cursor-not-allowed font-semibold text-sm">Msg Comum</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Escolha o template</Label>
                        <Select value={templateName} onValueChange={setTemplateName}>
                          <SelectTrigger className="h-10 bg-muted/30 border-muted-foreground/20">
                            <SelectValue placeholder="Selecione um template aprovado" />
                          </SelectTrigger>
                          <SelectContent>
                            {approved.map(t => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedTemplate && bodyVarCount > 0 && (
                        <div className="space-y-4 pt-2 border-t mt-4">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Variáveis Dinâmicas</p>
                          {Array.from({ length: bodyVarCount }).map((_, i) => (
                            <div key={i} className="space-y-1.5">
                              <Label className="text-xs font-bold">{`Variável {{${i + 1}}}`}</Label>
                              <Input
                                placeholder={`Insira o valor para {{${i+1}}}`}
                                value={bodyParams[i] ?? ""}
                                onChange={(e) => {
                                  const next = [...bodyParams];
                                  next[i] = e.target.value;
                                  setBodyParams(next);
                                }}
                                className="h-9 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mobile Preview */}
                  <div className="md:col-span-2 flex flex-col items-center justify-start pt-4">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-4">Prévia do WhatsApp</p>
                    <div className="relative w-[220px] h-[400px] bg-slate-900 rounded-[2.5rem] border-[6px] border-slate-800 shadow-xl overflow-hidden flex flex-col">
                      <div className="h-10 bg-[#075e54] flex items-center px-4 gap-2">
                        <div className="size-6 rounded-full bg-slate-400" />
                        <span className="text-white text-[9px] font-bold">API Oficial</span>
                      </div>
                      <div className="flex-1 bg-[#e5ddd5] p-3 space-y-2">
                        <div className="bg-[#dcf8c6] rounded-lg p-2 text-[10px] text-slate-800 shadow-sm relative">
                          {selectedTemplate ? (
                            <div className="whitespace-pre-wrap leading-tight">
                              {selectedTemplate.components.find(c => c.type === 'BODY')?.text?.replace(/\{\{(\d+)\}\}/g, (_, n) => {
                                const val = bodyParams[parseInt(n) - 1];
                                return val ? `*${val}*` : `{{${n}}}`;
                              })}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Selecione um template...</span>
                          )}
                          <div className="text-[7px] text-slate-400 text-right mt-1">14:30 ✓✓</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="max-w-md mx-auto py-8 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-2">
                    <div className="size-16 rounded-full bg-brand/10 flex items-center justify-center text-brand mx-auto mb-4">
                      <Calendar className="size-8" />
                    </div>
                    <h3 className="text-lg font-bold">Quando disparar?</h3>
                  </div>

                  <RadioGroup 
                    value={sendNow ? "agora" : "agendar"} 
                    onValueChange={(v) => setSendNow(v === "agora")}
                    className="grid gap-4"
                  >
                    <div className={`flex items-center space-x-3 border rounded-xl p-5 cursor-pointer transition-all ${sendNow ? 'border-brand bg-brand/5 ring-1 ring-brand/30' : 'hover:bg-muted/50'}`}>
                      <RadioGroupItem value="agora" id="r1" />
                      <div className="flex-1 cursor-pointer">
                        <Label htmlFor="r1" className="font-bold cursor-pointer">Enviar imediatamente</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">As mensagens entrarão na fila de disparo agora.</p>
                      </div>
                    </div>
                    <div className={`flex items-center space-x-3 border rounded-xl p-5 cursor-pointer transition-all ${!sendNow ? 'border-brand bg-brand/5 ring-1 ring-brand/30' : 'hover:bg-muted/50'}`}>
                      <RadioGroupItem value="agendar" id="r2" />
                      <div className="flex-1 cursor-pointer">
                        <Label htmlFor="r2" className="font-bold cursor-pointer">Agendar horário</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Defina uma data e hora futura para o envio.</p>
                      </div>
                    </div>
                  </RadioGroup>
                  
                  {!sendNow && (
                    <div className="animate-in zoom-in-95 duration-200">
                      <Input type="datetime-local" className="h-12 border-brand/30" />
                    </div>
                  )}
                </div>
              )}

              {step === 5 && (
                <div className="max-w-2xl mx-auto py-4 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-2 mb-8">
                    <div className="size-16 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="size-8" />
                    </div>
                    <h3 className="text-xl font-bold">Tudo pronto!</h3>
                    <p className="text-sm text-muted-foreground">Revise os detalhes abaixo e confirme o início do envio.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-muted overflow-hidden rounded-2xl border">
                    <div className="bg-background p-6 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Campanha</span>
                      <p className="font-bold">{nome || "Sem nome"}</p>
                    </div>
                    <div className="bg-background p-6 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Público</span>
                      <p className="font-bold">{preview?.destinatarios ?? 0} destinatários</p>
                    </div>
                    <div className="bg-background p-6 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Conteúdo</span>
                      <p className="font-bold">{templateName || "Nenhum template"}</p>
                    </div>
                    <div className="bg-background p-6 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Agendamento</span>
                      <p className="font-bold text-brand">{sendNow ? "Imediato" : "Agendado"}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-muted/20 border-t flex justify-between items-center">
              <Button 
                variant="ghost" 
                onClick={() => setStep(s => Math.max(1, s - 1))} 
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
                    disabled={busy}
                    className="border-warning/50 text-warning-foreground hover:bg-warning/10"
                  >
                    Salvar Rascunho
                  </Button>
                )}
                
                <Button 
                  onClick={() => step < 5 ? setStep(s => s + 1) : submit(false)}
                  disabled={busy || (step === 3 && !templateName) || (step === 1 && !nome.trim())}
                  className="min-w-[120px] gap-2 shadow-[0_0_20px_rgba(var(--brand-rgb),0.3)]"
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
