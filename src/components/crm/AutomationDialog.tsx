import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
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
import { getSegmentsList } from "@/lib/crm-segmentation.functions";
import { listMetaTemplates, saveAutomation } from "@/lib/whatsapp-meta.functions";

export const SEGMENT_LABEL: Record<string, string> = {
  ticket_alto: "Ticket alto",
  sem_recompra: "Sem recompra",
  recompra_30d: "Recompra 30d",
  recompra_60d: "Recompra 60d",
  envio_atrasado: "Envio atrasado",
};

export type AutomationStepSeed = {
  id: string;
  waitHours: number;
  templateName: string;
  templateLanguage?: string | undefined;
  messageType: "marketing" | "utility";
  bodyParams: string[];
  couponCode?: string | undefined;
};

export type AutomationSeed = {
  id?: string | undefined;
  nome: string;
  descricao?: string | undefined;
  segmentType?: string | undefined;
  segmentId?: string | undefined;
  steps?: AutomationStepSeed[] | undefined;
  requerAprovacao?: boolean | undefined;
  ativo?: boolean | undefined;
};

function newStep(): AutomationStepSeed {
  return {
    id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    waitHours: 0,
    templateName: "",
    messageType: "marketing",
    bodyParams: [],
  };
}

/** Conta quantas variáveis {{n}} o corpo do template pede, pra saber quantos campos renderizar. */
function countTemplateVars(components: { type: string; text?: string }[] | undefined): number {
  const body = components?.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

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
  const [segmentId, setSegmentId] = useState<string | undefined>(undefined);
  const [steps, setSteps] = useState<AutomationStepSeed[]>([newStep()]);
  const [requerAprovacao, setRequerAprovacao] = useState(true);
  const [ativo, setAtivo] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(seed?.nome ?? "");
    setDescricao(seed?.descricao ?? "");
    setSegmentType((seed?.segmentId ? "sem_recompra" : (seed?.segmentType as SegmentType)) ?? "sem_recompra");
    setSegmentId(seed?.segmentId ?? undefined);
    setSteps(seed?.steps?.length ? seed.steps : [newStep()]);
    setRequerAprovacao(seed?.requerAprovacao ?? true);
    setAtivo(seed?.ativo ?? true);
  }, [seed, open]);

  const { data: templatesResult } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => listMetaTemplates(),
    enabled: open,
  });
  const approved = (templatesResult?.success ? templatesResult.templates : []).filter(
    (t: { status: string }) => t.status === "APPROVED",
  );

  const { data: segmentsResult } = useQuery({
    queryKey: ["crm-segments-list"],
    queryFn: () => getSegmentsList(),
    enabled: open,
  });
  const customSegments = (segmentsResult ?? []) as { id: string; nome: string }[];

  const updateStep = (index: number, patch: Partial<AutomationStepSeed>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const removeStep = (index: number) => {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const save = async () => {
    if (steps.some((s) => !s.templateName)) {
      toast.error("Escolha um template pra cada etapa.");
      return;
    }
    setBusy(true);
    try {
      const res = await runSave({
        data: {
          id: seed?.id,
          nome: nome.trim() || "Automação",
          descricao: descricao.trim() || undefined,
          segmentType: segmentId ? "custom" : segmentType,
          segmentId,
          steps: steps.map((s) => ({
            id: s.id,
            waitHours: s.waitHours,
            templateName: s.templateName,
            templateLanguage: s.templateLanguage,
            messageType: s.messageType,
            bodyParams: s.bodyParams,
            couponCode: s.couponCode?.trim() || undefined,
          })),
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{seed?.id ? "Editar automação" : "Instalar automação"}</DialogTitle>
          <DialogDescription>
            Cada etapa espera um tempo e dispara um template — o motor roda sozinho, matriculando clientes novos do
            segmento e avançando quem já está na fila.
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

          <div className="space-y-1.5">
            <Label>Segmento (público que entra na automação)</Label>
            <Select
              value={segmentId || segmentType}
              onValueChange={(v) => {
                const isCustom = customSegments.some((s) => s.id === v);
                if (isCustom) {
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
                {SEGMENT_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEGMENT_LABEL[s]}
                  </SelectItem>
                ))}
                {customSegments.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Etapas</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setSteps((prev) => [...prev, newStep()])}
              >
                <Plus className="size-3.5" /> Adicionar etapa
              </Button>
            </div>

            {steps.map((step, index) => {
              const template = approved.find((t: { name: string }) => t.name === step.templateName);
              const varCount = countTemplateVars(template?.components);

              return (
                <div key={step.id} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Etapa {index + 1}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={index === steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 text-critical"
                        disabled={steps.length <= 1}
                        onClick={() => removeStep(index)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        {index === 0 ? "Esperar antes de matricular (horas)" : "Esperar desde a etapa anterior (horas)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={720}
                        value={step.waitHours}
                        onChange={(e) => updateStep(index, { waitHours: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={step.messageType}
                        onValueChange={(v) => updateStep(index, { messageType: v as "marketing" | "utility" })}
                      >
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
                    <Label className="text-xs">Template aprovado</Label>
                    <Select
                      value={step.templateName}
                      onValueChange={(v) => updateStep(index, { templateName: v, bodyParams: [] })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha um template" />
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

                  {varCount > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Variáveis do template ({varCount})</Label>
                      {Array.from({ length: varCount }).map((_, varIndex) => (
                        <Input
                          key={varIndex}
                          placeholder={`{{${varIndex + 1}}}`}
                          value={step.bodyParams[varIndex] ?? ""}
                          onChange={(e) => {
                            const next = [...step.bodyParams];
                            next[varIndex] = e.target.value;
                            updateStep(index, { bodyParams: next });
                          }}
                        />
                      ))}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs">Cupom da Shopify (opcional)</Label>
                    <Input
                      value={step.couponCode ?? ""}
                      onChange={(e) => updateStep(index, { couponCode: e.target.value })}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Exigir aprovação pra clientes novos</p>
              <p className="text-xs text-muted-foreground">
                Cada leva de clientes novos matriculados fica na fila de aprovação antes do primeiro envio — etapas
                seguintes de quem já foi aprovado disparam sozinhas.
              </p>
            </div>
            <Switch checked={requerAprovacao} onCheckedChange={setRequerAprovacao} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Automação ativa</p>
              <p className="text-xs text-muted-foreground">Pausada, ela não matricula nem processa ninguém.</p>
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
