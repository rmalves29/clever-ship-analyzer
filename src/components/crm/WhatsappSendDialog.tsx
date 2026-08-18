import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Send, ShieldCheck, Users } from "lucide-react";
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
}: {
  seed: SendDialogSeed | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const runCreateCampaign = useServerFn(createAndSendCampaign);
  const runPreview = useServerFn(previewSegment);

  const [nome, setNome] = useState("");
  const [oferta, setOferta] = useState("");
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [messageType, setMessageType] = useState<"marketing" | "utility">("marketing");
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [segmentType, setSegmentType] = useState<SegmentType>("sem_recompra");
  const [segmentId, setSegmentId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (seed && open) {
      setNome(seed.nome);
      setOferta(seed.oferta);
      setBodyParams([]);
      setCoupon("");
      setSegmentType(seed.segmentType);
      setSegmentId(seed.segmentId);
      setBusy(false);
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
    queryKey: ["segment-preview", segmentType, segmentId, open],
    queryFn: () => runPreview({ data: { segmentType, segmentId } }),
    enabled: Boolean(open),
  });

  const submit = async (requireApproval: boolean) => {
    setBusy(true);
    try {
      const res = await runCreateCampaign({
        data: {
          nome: nome.trim() || (seed?.nome ?? "Campanha"),
          segmentType,
          segmentId,
          messageType,
          templateName: templateName || undefined,
          couponCode: coupon.trim() || undefined,
          bodyParams: selectedTemplate ? bodyParams.slice(0, bodyVarCount) : oferta.trim() ? [oferta.trim()] : [],
          requireApproval,
        },
      });

      if (!res.success) {
        toast.error(res.error || "Falha ao criar a campanha.");
        return;
      }
      if ("pendingApproval" in res && res.pendingApproval) {
        toast.success(`Campanha enviada pra aprovação (${res.total} destinatários).`);
      } else if (res.total === 0) {
        toast.info("Nenhum cliente com telefone cadastrado nesse segmento.");
      } else {
        toast.success(`Campanha enviada: ${res.sent}/${res.total} mensagens (${res.failed} falharam).`);
      }
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast.error("Erro ao enviar campanha: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Envio direto via WhatsApp</DialogTitle>
          <DialogDescription>
            Dispara o template aprovado da Meta pra todos os clientes reais do segmento selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <Users className="size-4 text-brand" />
            <div className="flex-1">
              <p className="text-sm">
                {loadingPreview ? (
                  "Calculando destinatários..."
                ) : (
                  <>
                    <strong>{preview?.destinatarios ?? 0}</strong> destinatários com telefone válido
                    <span className="text-muted-foreground"> (de {preview?.clientes ?? 0} clientes no segmento)</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome da campanha</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Campanha manual" />
            </div>
            <div className="space-y-1.5">
              <Label>Segmento de clientes</Label>
              <Select 
                value={segmentId || segmentType} 
                onValueChange={(v) => {
                  if (v.includes("-")) {
                    setSegmentId(v);
                  } else {
                    setSegmentType(v as SegmentType);
                    setSegmentId(undefined);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ticket_alto">Ticket Alto</SelectItem>
                  <SelectItem value="sem_recompra">Sem Recompra</SelectItem>
                  <SelectItem value="recompra_30d">Recompra 30d</SelectItem>
                  <SelectItem value="recompra_60d">Recompra 60d</SelectItem>
                  <SelectItem value="envio_atrasado">Envio Atrasado</SelectItem>
                  <SelectItem value="recorrencia">Recorrência</SelectItem>
                  {/* Aqui poderíamos mapear os segmentos criados dinamicamente no CRM se passarmos via props */}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Template aprovado</Label>
              <Select
                value={templateName}
                onValueChange={(v) => {
                  setTemplateName(v);
                  setBodyParams([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Template padrão das configurações" />
                </SelectTrigger>
                <SelectContent>
                  {approved.length === 0 ? (
                    <div className="p-4 text-center text-sm">
                      <p className="text-muted-foreground">Nenhum template aprovado encontrado na Meta.</p>
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="mt-2 h-auto p-0"
                        onClick={() => window.open("https://business.facebook.com/wa/manage/message-templates/", "_blank")}
                      >
                        Criar template na Meta
                      </Button>
                    </div>
                  ) : (
                    approved.map((t: { name: string; language: string }) => (
                      <SelectItem key={`${t.name}-${t.language}`} value={t.name}>
                        {t.name} ({t.language})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={messageType} onValueChange={(v) => setMessageType(v as "marketing" | "utility")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="utility">Utilidade</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedTemplate ? (
            bodyVarCount > 0 ? (
              <div className="space-y-3 rounded-lg border border-border p-3">
                {Array.from({ length: bodyVarCount }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Label>{`Variável {{${i + 1}}}`}</Label>
                    <Input
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
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Esse template não tem variáveis — pronto pra enviar.</p>
            )
          ) : (
            <div className="space-y-1.5">
              <Label>Variável da mensagem (oferta)</Label>
              <Textarea rows={2} value={oferta} onChange={(e) => setOferta(e.target.value)} />
              <p className="text-xs text-muted-foreground">Preenche a primeira variável do template padrão ({"{{1}}"}).</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Cupom da Shopify (opcional)</Label>
            <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Ex: VOLTA10" />
          </div>

        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" disabled={busy} onClick={() => submit(true)} className="gap-2">
            <ShieldCheck className="size-4" /> Enviar pra aprovação
          </Button>
          <Button disabled={busy} onClick={() => submit(false)} className="gap-2">
            <Send className="size-4" /> {busy ? "Processando..." : "Enviar agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
