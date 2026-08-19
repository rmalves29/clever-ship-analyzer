import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch } from "lucide-react";
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

const END_FLOW = "__end__";

type DecisionCondition =
  | { kind: "novo_pedido" }
  | { kind: "pedido_status"; field: "financial_status" | "fulfillment_status"; value: string }
  | { kind: "segmento"; segmentType: string; segmentId?: string | undefined };

export type SendStepSeed = {
  id: string;
  type: "send";
  waitHours: number;
  templateName: string;
  templateLanguage?: string | undefined;
  messageType: "marketing" | "utility";
  bodyParams: string[];
  couponCode?: string | undefined;
  nextStepId: string | null;
};

export type DecisionStepSeed = {
  id: string;
  type: "decision";
  condition: DecisionCondition;
  yesStepId: string | null;
  noStepId: string | null;
};

export type AutomationStepSeed = SendStepSeed | DecisionStepSeed;

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

function newId() {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newSendStep(): SendStepSeed {
  return {
    id: newId(),
    type: "send",
    waitHours: 0,
    templateName: "",
    messageType: "marketing",
    bodyParams: [],
    nextStepId: null,
  };
}

function newDecisionStep(): DecisionStepSeed {
  return {
    id: newId(),
    type: "decision",
    condition: { kind: "novo_pedido" },
    yesStepId: null,
    noStepId: null,
  };
}

/** Conta quantas variáveis {{n}} o corpo do template pede, pra saber quantos campos renderizar. */
function countTemplateVars(components: { type: string; text?: string }[] | undefined): number {
  const body = components?.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

const FINANCIAL_STATUSES = ["PAID", "PENDING", "PARTIALLY_PAID", "REFUNDED", "PARTIALLY_REFUNDED", "VOIDED", "EXPIRED"];
const FULFILLMENT_STATUSES = ["FULFILLED", "UNFULFILLED", "IN_PROGRESS", "PARTIAL", "RESTOCKED"];

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
  const [steps, setSteps] = useState<AutomationStepSeed[]>([newSendStep()]);
  const [requerAprovacao, setRequerAprovacao] = useState(true);
  const [ativo, setAtivo] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(seed?.nome ?? "");
    setDescricao(seed?.descricao ?? "");
    setSegmentType((seed?.segmentId ? "sem_recompra" : (seed?.segmentType as SegmentType)) ?? "sem_recompra");
    setSegmentId(seed?.segmentId ?? undefined);
    setSteps(seed?.steps?.length ? seed.steps : [newSendStep()]);
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
    setSteps((prev) => prev.map((s, i) => (i === index ? ({ ...s, ...patch } as AutomationStepSeed) : s)));
  };

  const removeStep = (index: number) => {
    setSteps((prev) => {
      if (prev.length <= 1) return prev;
      const removedId = prev[index]?.id;
      const rest = prev.filter((_, i) => i !== index);
      // Limpa qualquer referência que apontava pra etapa removida, senão a gravação falha na validação.
      return rest.map((s) =>
        s.type === "send"
          ? { ...s, nextStepId: s.nextStepId === removedId ? null : s.nextStepId }
          : {
              ...s,
              yesStepId: s.yesStepId === removedId ? null : s.yesStepId,
              noStepId: s.noStepId === removedId ? null : s.noStepId,
            },
      );
    });
  };

  const addStep = (kind: "send" | "decision") => {
    setSteps((prev) => {
      const created = kind === "send" ? newSendStep() : newDecisionStep();
      // Se a última etapa termina em "Finalizar fluxo", encadeia automaticamente nela —
      // mantém o caso comum (ir clicando em adicionar) funcionando sem religar nada na mão.
      const last = prev[prev.length - 1];
      let updatedPrev = prev;
      if (last) {
        if (last.type === "send" && last.nextStepId === null) {
          updatedPrev = prev.map((s, i) => (i === prev.length - 1 ? { ...s, nextStepId: created.id } : s));
        } else if (last.type === "decision" && last.noStepId === null) {
          updatedPrev = prev.map((s, i) => (i === prev.length - 1 ? { ...s, noStepId: created.id } : s));
        }
      }
      return [...updatedPrev, created];
    });
  };

  const stepLabel = (s: AutomationStepSeed, index: number) =>
    s.type === "send" ? `Etapa ${index + 1} — Enviar (${s.templateName || "sem template"})` : `Etapa ${index + 1} — Decisão`;

  const RouteSelect = ({
    value,
    excludeId,
    onChange,
  }: {
    value: string | null;
    excludeId: string;
    onChange: (v: string | null) => void;
  }) => (
    <Select value={value ?? END_FLOW} onValueChange={(v) => onChange(v === END_FLOW ? null : v)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={END_FLOW}>Finalizar fluxo</SelectItem>
        {steps
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => s.id !== excludeId)
          .map(({ s, i }) => (
            <SelectItem key={s.id} value={s.id}>
              {stepLabel(s, i)}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );

  const save = async () => {
    if (steps.some((s) => s.type === "send" && !s.templateName)) {
      toast.error("Escolha um template pra cada etapa de envio.");
      return;
    }
    if (steps[0]?.type !== "send") {
      toast.error("A primeira etapa precisa ser um envio.");
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
          steps: steps.map((s) =>
            s.type === "send"
              ? {
                  id: s.id,
                  type: "send" as const,
                  waitHours: s.waitHours,
                  templateName: s.templateName,
                  templateLanguage: s.templateLanguage,
                  messageType: s.messageType,
                  bodyParams: s.bodyParams,
                  couponCode: s.couponCode?.trim() || undefined,
                  nextStepId: s.nextStepId,
                }
              : {
                  id: s.id,
                  type: "decision" as const,
                  condition: s.condition,
                  yesStepId: s.yesStepId,
                  noStepId: s.noStepId,
                },
          ),
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
            Cada etapa espera um tempo e dispara um template, ou decide (Sim/Não) qual caminho seguir — o motor roda
            sozinho, matriculando clientes novos do segmento e avançando quem já está na fila.
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
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => addStep("send")}>
                  <Plus className="size-3.5" /> Enviar mensagem
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => addStep("decision")}>
                  <GitBranch className="size-3.5" /> Decisão
                </Button>
              </div>
            </div>

            {steps.map((step, index) => {
              if (step.type === "decision") {
                return (
                  <div key={step.id} className="space-y-3 rounded-xl border border-border p-4 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <GitBranch className="size-3.5" /> {stepLabel(step, index)}
                      </p>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 text-critical"
                        disabled={steps.length <= 1 || index === 0}
                        onClick={() => removeStep(index)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Condição</Label>
                      <Select
                        value={step.condition.kind}
                        onValueChange={(v) => {
                          const condition: DecisionCondition =
                            v === "pedido_status"
                              ? { kind: "pedido_status", field: "financial_status", value: FINANCIAL_STATUSES[0]! }
                              : v === "segmento"
                                ? { kind: "segmento", segmentType: SEGMENT_TYPES[0]! }
                                : { kind: "novo_pedido" };
                          updateStep(index, { condition });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="novo_pedido">Fez um novo pedido desde que entrou</SelectItem>
                          <SelectItem value="pedido_status">Pedido mais recente tem um status</SelectItem>
                          <SelectItem value="segmento">Está em um segmento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {step.condition.kind === "pedido_status" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Tipo de status</Label>
                          <Select
                            value={step.condition.field}
                            onValueChange={(v) =>
                              updateStep(index, {
                                condition: {
                                  kind: "pedido_status",
                                  field: v as "financial_status" | "fulfillment_status",
                                  value: (v === "fulfillment_status" ? FULFILLMENT_STATUSES[0] : FINANCIAL_STATUSES[0])!,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="financial_status">Pagamento</SelectItem>
                              <SelectItem value="fulfillment_status">Envio</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Valor</Label>
                          <Select
                            value={step.condition.value}
                            onValueChange={(v) =>
                              updateStep(index, {
                                condition: { ...(step.condition as { kind: "pedido_status"; field: any; value: string }), value: v },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(step.condition.field === "fulfillment_status" ? FULFILLMENT_STATUSES : FINANCIAL_STATUSES).map(
                                (v) => (
                                  <SelectItem key={v} value={v}>
                                    {v}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {step.condition.kind === "segmento" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Segmento</Label>
                        <Select
                          value={step.condition.segmentId || step.condition.segmentType}
                          onValueChange={(v) => {
                            const isCustom = customSegments.some((s) => s.id === v);
                            updateStep(index, {
                              condition: isCustom
                                ? { kind: "segmento", segmentType: "custom", segmentId: v }
                                : { kind: "segmento", segmentType: v },
                            });
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
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-success">Se sim, vá para</Label>
                        <RouteSelect
                          value={step.yesStepId}
                          excludeId={step.id}
                          onChange={(v) => updateStep(index, { yesStepId: v })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-critical">Se não, vá para</Label>
                        <RouteSelect
                          value={step.noStepId}
                          excludeId={step.id}
                          onChange={(v) => updateStep(index, { noStepId: v })}
                        />
                      </div>
                    </div>
                  </div>
                );
              }

              const template = approved.find((t: { name: string }) => t.name === step.templateName);
              const varCount = countTemplateVars(template?.components);

              return (
                <div key={step.id} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{stepLabel(step, index)}</p>
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

                  <div className="space-y-1.5">
                    <Label className="text-xs">Depois, vá para</Label>
                    <RouteSelect
                      value={step.nextStepId}
                      excludeId={step.id}
                      onChange={(v) => updateStep(index, { nextStepId: v })}
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
