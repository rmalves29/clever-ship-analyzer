import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Send, ShieldCheck, Users, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Criar Campanha</DialogTitle>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-b pb-4">
             {steps.map((s, i) => (
                <div key={s} className={`flex items-center ${i + 1 <= step ? "text-brand font-bold" : ""}`}>
                    <span className="size-5 rounded-full border flex items-center justify-center mr-1.5">{i+1}</span>
                    {s}
                </div>
             ))}
          </div>
        </DialogHeader>

        <div className="min-h-[400px]">
          {step === 1 && (
            <div className="space-y-4">
                <Label>Nome da campanha</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Lançamento Coleção" />
                <Label>Conta de envio</Label>
                <Input disabled value="+55 31 7330-8275 (padrão)" />
            </div>
          )}

          {step === 2 && (
             <div className="space-y-4">
                <Label>Segmento de clientes</Label>
                <Select value={segmentId || segmentType} onValueChange={(v) => {
                    if (v.includes("-")) setSegmentId(v);
                    else { setSegmentType(v as SegmentType); setSegmentId(undefined); }
                }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {segments.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Card className="bg-muted/30">
                    <CardContent className="p-4 flex items-center gap-3">
                        <Users className="size-5 text-brand" />
                        <p className="text-sm">
                            {loadingPreview ? "Calculando..." : `<strong>${preview?.destinatarios ?? 0}</strong> destinatários válidos`}
                        </p>
                    </CardContent>
                </Card>
             </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                    <RadioGroup value={templateName ? "template" : "comum"} onValueChange={(v) => v === "comum" && setTemplateName("")}>
                       <div className="flex items-center space-x-2 border p-3 rounded">
                           <RadioGroupItem value="template" id="t1" />
                           <Label htmlFor="t1">Template aprovado</Label>
                       </div>
                    </RadioGroup>
                    <Select value={templateName} onValueChange={setTemplateName}>
                        <SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                        <SelectContent>{approved.map(t => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="bg-slate-900 rounded p-4 text-white text-sm">
                    {templateName || "Pré-visualização..."}
                </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
                <RadioGroup value={sendNow ? "agora" : "agendar"} onValueChange={(v) => setSendNow(v === "agora")}>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="agora" id="r1"/><Label htmlFor="r1">Enviar agora</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="agendar" id="r2"/><Label htmlFor="r2">Agendar envio</Label></div>
                </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter className="justify-between">
            <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>Anterior</Button>
            <Button onClick={() => step < 5 ? setStep(s => s + 1) : submit(false)}>{step === 5 ? "Enviar" : "Próximo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}