import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEGMENT_TYPES, type SegmentType } from "@/lib/crm-mock";
import { listMetaTemplates, saveAutomation } from "@/lib/whatsapp-meta.functions";

export const SEGMENT_LABEL: Record<string, string> = {
  ticket_alto: "Ticket alto",
  sem_recompra: "Sem recompra",
  recompra_30d: "Recompra 30d",
  recompra_60d: "Recompra 60d",
  envio_atrasado: "Envio atrasado",
};

export type AutomationSeed = {
  id?: string;
  nome: string;
  descricao?: string;
  segmentType?: SegmentType;
  templateName?: string;
  messageType?: "marketing" | "utility";
  bodyParams?: string[];
  couponCode?: string;
  janelaHoras?: number;
  requerAprovacao?: boolean;
  ativo?: boolean;
};

export function AutomationDialog({
  seed,
  open,
  onOpenChange,
  onSaved,
}: {
  seed: AutomationSeed | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const runSave = useServerFn(saveAutomation);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [segmentType, setSegmentType] = useState<SegmentType>("sem_recompra");
  const [templateName, setTemplateName] = useState("");
  const [messageType, setMessageType] = useState<"marketing" | "utility">("marketing");
  const [mensagem, setMensagem] = useState("");
  const [coupon, setCoupon] = useState("");
  const [janelaHoras, setJanelaHoras] = useState(24);
  const [requerAprovacao, setRequerAprovacao] = useState(true);
  const [ativo, setAtivo] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !seed) return;
    setNome(seed.nome ?? "");
    setDescricao(seed.descricao ?? "");
    setSegmentType(seed.segmentType ?? "sem_recompra");
    setTemplateName(seed.templateName ?? "");
    setMessageType(seed.messageType ?? "marketing");
    setMensagem(seed.bodyParams?.[0] ?? "");
    setCoupon(seed.couponCode ?? "");
    setJanelaHoras(seed.janelaHoras ?? 24);
    setRequerAprovacao(seed.requerAprovacao ?? true);
    setAtivo(seed.ativo ?? true);
  }, [seed, open]);

  const { data: templatesResult } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => listMetaTemplates(),
  });
  const approved = (templatesResult?.success ? templatesResult.templates : []).filter(
    (t: { status: string }) => t.status === "APPROVED",
  );

  const save = async () => {
    setBusy(true);
    try {
      const res = await runSave({
        data: {
          id: seed?.id,
          nome: nome.trim() || "Automação",
          descricao: descricao.trim() || undefined,
          segmentType,
          templateName: templateName || undefined,
          messageType,
          bodyParams: mensagem.trim() ? [mensagem.trim()] : [],
          couponCode: coupon.trim() || undefined,
          janelaHoras,
          requerAprovacao,
          ativo,
        },
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(seed?.id ? "Automação atualizada." : "Automação instalada com sucesso.");
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast.error("Erro ao salvar automação: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{seed?.id ? "Editar automação" : "Instalar automação"}</DialogTitle>
          <DialogDescription>
            A automação monta a campanha no segmento escolhido e dispara pela API oficial do WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={segmentType} onValueChange={(v) => setSegmentType(v as SegmentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENT_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEGMENT_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Janela (horas)</Label>
              <Input
                type="number"
                min={1}
                max={720}
                value={janelaHoras}
                onChange={(e) => setJanelaHoras(Number(e.target.value) || 24)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Template aprovado</Label>
              <Select value={templateName} onValueChange={setTemplateName}>
                <SelectTrigger>
                  <SelectValue placeholder="Template padrão" />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((t: { name: string; language: string }) => (
                    <SelectItem key={`${t.name}-${t.language}`} value={t.name}>
                      {t.name} ({t.language})
                    </SelectItem>
                  ))}
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

          <div className="space-y-1.5">
            <Label>Variável da mensagem (oferta)</Label>
            <Textarea rows={2} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Cupom da Shopify (opcional)</Label>
            <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Exigir aprovação antes de enviar</p>
              <p className="text-xs text-muted-foreground">A campanha fica na fila de aprovação em vez de disparar.</p>
            </div>
            <Switch checked={requerAprovacao} onCheckedChange={setRequerAprovacao} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Automação ativa</p>
              <p className="text-xs text-muted-foreground">Pausada, ela não pode ser executada.</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? "Salvando..." : seed?.id ? "Salvar" : "Instalar automação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
