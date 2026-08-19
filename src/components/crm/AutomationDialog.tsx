import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch, MessageCircle, Settings, Rocket } from "lucide-react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
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

function newDecisionStep(condition: DecisionCondition): DecisionStepSeed {
  return { id: newId(), type: "decision", condition, yesStepId: null, noStepId: null };
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

function conditionLabel(c: DecisionCondition): string {
  if (c.kind === "novo_pedido") return "Fez um novo pedido?";
  if (c.kind === "pedido_status")
    return `Pedido ${c.field === "financial_status" ? "pagamento" : "envio"} = ${c.value}`;
  return "Está em segmento?";
}

/** Layout simples em árvore: uma linha por "profundidade" do grafo, a partir da etapa raiz
 *  (ligada ao gatilho). Etapas órfãs (sem caminho a partir da raiz) ficam numa fileira à parte. */
const COL_W = 296;
const ROW_H = 150;

function layoutSteps(steps: AutomationStepSeed[], rootStepId: string | null): Record<string, { x: number; y: number }> {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const positions: Record<string, { x: number; y: number }> = {};
  const nextColAtDepth: number[] = [];

  function place(id: string | null, depth: number) {
    if (!id || positions[id] || !byId.has(id)) return;
    const col = nextColAtDepth[depth] ?? 0;
    nextColAtDepth[depth] = col + 1;
    positions[id] = { x: col * COL_W, y: depth * ROW_H };
    const step = byId.get(id)!;
    if (step.type === "send") place(step.nextStepId, depth + 1);
    else {
      place(step.yesStepId, depth + 1);
      place(step.noStepId, depth + 1);
    }
  }

  place(rootStepId, 1);
  let orphanCol = 0;
  for (const s of steps) {
    if (!positions[s.id]) {
      positions[s.id] = { x: orphanCol * COL_W, y: -ROW_H };
      orphanCol++;
    }
  }
  return positions;
}

function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as { label: string };
  return (
    <div
      className={cn(
        "w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm cursor-pointer transition-colors",
        selected ? "border-primary" : "border-border",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Rocket className="size-3" /> Início da automação
      </p>
      <p className="text-sm font-medium mt-1">{d.label}</p>
      <Handle type="source" position={Position.Bottom} id="out" className="!bg-primary !size-2.5" />
    </div>
  );
}

function SendNode({ data, selected }: NodeProps) {
  const d = data as unknown as { step: SendStepSeed };
  return (
    <div
      className={cn(
        "w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm cursor-pointer transition-colors",
        selected ? "border-primary" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Top} id="in" className="!bg-muted-foreground !size-2.5" />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <MessageCircle className="size-3" /> Enviar WhatsApp
      </p>
      <p className="text-sm font-medium mt-1 truncate">{d.step.templateName || "Escolha um template"}</p>
      <p className="text-xs text-muted-foreground mt-0.5">Espera {d.step.waitHours}h antes</p>
      <Handle type="source" position={Position.Bottom} id="out" className="!bg-primary !size-2.5" />
    </div>
  );
}

function DecisionNode({ data, selected }: NodeProps) {
  const d = data as unknown as { step: DecisionStepSeed };
  return (
    <div
      className={cn(
        "w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm cursor-pointer transition-colors",
        selected ? "border-primary" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Top} id="in" className="!bg-muted-foreground !size-2.5" />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <GitBranch className="size-3" /> Decisão
      </p>
      <p className="text-sm font-medium mt-1">{conditionLabel(d.step.condition)}</p>
      <div className="flex justify-between mt-2 text-[10px] font-semibold px-2">
        <span className="text-success">Sim</span>
        <span className="text-critical">Não</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "30%" }} className="!bg-success !size-2.5" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: "70%" }} className="!bg-critical !size-2.5" />
    </div>
  );
}

const nodeTypes = { trigger: TriggerNode, send: SendNode, decision: DecisionNode };
const TRIGGER_ID = "__trigger__";

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
  const [rootStepId, setRootStepId] = useState<string>("");
  const [requerAprovacao, setRequerAprovacao] = useState(true);
  const [ativo, setAtivo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(TRIGGER_ID);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(seed?.nome ?? "");
    setDescricao(seed?.descricao ?? "");
    setSegmentType((seed?.segmentId ? "sem_recompra" : (seed?.segmentType as SegmentType)) ?? "sem_recompra");
    setSegmentId(seed?.segmentId ?? undefined);
    const initialSteps = seed?.steps?.length ? seed.steps : [newSendStep()];
    setSteps(initialSteps);
    setRootStepId(initialSteps[0]!.id);
    setRequerAprovacao(seed?.requerAprovacao ?? true);
    setAtivo(seed?.ativo ?? true);
    setManualPositions({});
    setSelectedNodeId(TRIGGER_ID);
    setAddPanelOpen(false);
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

  const segmentLabel = segmentId
    ? (customSegments.find((s) => s.id === segmentId)?.nome ?? "Segmento customizado")
    : (SEGMENT_LABEL[segmentType] ?? segmentType ?? "Escolha um gatilho");

  const updateStep = (id: string, patch: Partial<AutomationStepSeed>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as AutomationStepSeed) : s)));
  };

  const removeStepById = useCallback(
    (id: string) => {
      if (id === TRIGGER_ID) return;
      setSteps((prev) => {
        const rest = prev.filter((s) => s.id !== id);
        const cleaned = rest.map((s) =>
          s.type === "send"
            ? { ...s, nextStepId: s.nextStepId === id ? null : s.nextStepId }
            : {
                ...s,
                yesStepId: s.yesStepId === id ? null : s.yesStepId,
                noStepId: s.noStepId === id ? null : s.noStepId,
              },
        );
        if (cleaned.length === 0) {
          const fresh = newSendStep();
          setRootStepId(fresh.id);
          return [fresh];
        }
        if (id === rootStepId) {
          const newRoot = cleaned.find((s) => s.type === "send") ?? cleaned[0]!;
          setRootStepId(newRoot.id);
        }
        return cleaned;
      });
      setSelectedNodeId(null);
    },
    [rootStepId],
  );

  /** Cria uma etapa nova e encadeia automaticamente na saída livre da etapa selecionada
   *  (ou na primeira saída livre do fluxo, se nada estiver selecionado) — assim clicar em
   *  "Adicionar etapa" repetidamente já vai montando a sequência sem precisar arrastar toda vez. */
  const addStep = (step: AutomationStepSeed) => {
    setSteps((prev) => {
      const preferred = selectedNodeId && selectedNodeId !== TRIGGER_ID ? prev.find((s) => s.id === selectedNodeId) : undefined;
      const hasOpenSlot = (s: AutomationStepSeed) => (s.type === "send" ? s.nextStepId === null : s.yesStepId === null || s.noStepId === null);
      const target = (preferred && hasOpenSlot(preferred) ? preferred : undefined) ?? prev.find(hasOpenSlot);
      if (!target) return [...prev, step];
      const updated = prev.map((s) => {
        if (s.id !== target.id) return s;
        if (s.type === "send") return { ...s, nextStepId: step.id };
        if (s.yesStepId === null) return { ...s, yesStepId: step.id };
        return { ...s, noStepId: step.id };
      });
      return [...updated, step];
    });
    setSelectedNodeId(step.id);
    setAddPanelOpen(false);
  };

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.target) return;
      if (conn.source === TRIGGER_ID) {
        const targetStep = steps.find((s) => s.id === conn.target);
        if (targetStep?.type !== "send") {
          toast.error("O gatilho precisa apontar pra uma etapa de Enviar WhatsApp.");
          return;
        }
        setRootStepId(conn.target);
        return;
      }
      if (conn.source === conn.target) return;
      setSteps((prev) =>
        prev.map((s) => {
          if (s.id !== conn.source) return s;
          if (s.type === "send") return { ...s, nextStepId: conn.target };
          if (conn.sourceHandle === "yes") return { ...s, yesStepId: conn.target };
          if (conn.sourceHandle === "no") return { ...s, noStepId: conn.target };
          return s;
        }),
      );
    },
    [steps],
  );

  const onNodesChangeHandler = useCallback((changes: NodeChange[]) => {
    setManualPositions((prev) => {
      let next = prev;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          if (next === prev) next = { ...prev };
          next[change.id] = change.position;
        }
      }
      return next;
    });
  }, []);

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const n of deleted) removeStepById(n.id);
    },
    [removeStepById],
  );

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    setSteps((prev) =>
      prev.map((s) => {
        const match = deleted.find((e) => e.source === s.id);
        if (!match) return s;
        if (s.type === "send" && match.sourceHandle === "out") return { ...s, nextStepId: null };
        if (s.type === "decision" && match.sourceHandle === "yes") return { ...s, yesStepId: null };
        if (s.type === "decision" && match.sourceHandle === "no") return { ...s, noStepId: null };
        return s;
      }),
    );
  }, []);

  const layout = useMemo(() => layoutSteps(steps, rootStepId), [steps, rootStepId]);

  const nodes: Node[] = useMemo(() => {
    const triggerPos = manualPositions[TRIGGER_ID] ?? { x: layout[rootStepId]?.x ?? 0, y: 0 };
    const triggerNode: Node = {
      id: TRIGGER_ID,
      type: "trigger",
      position: triggerPos,
      data: { label: segmentLabel },
      selected: selectedNodeId === TRIGGER_ID,
      deletable: false,
    };
    const stepNodes: Node[] = steps.map((s) => ({
      id: s.id,
      type: s.type,
      position: manualPositions[s.id] ?? layout[s.id] ?? { x: 0, y: 0 },
      data: { step: s },
      selected: selectedNodeId === s.id,
    }));
    return [triggerNode, ...stepNodes];
  }, [layout, steps, manualPositions, selectedNodeId, rootStepId, segmentLabel]);

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    if (rootStepId) {
      list.push({
        id: `trigger-${rootStepId}`,
        source: TRIGGER_ID,
        sourceHandle: "out",
        target: rootStepId,
        targetHandle: "in",
        deletable: false,
        style: { strokeWidth: 2 },
      });
    }
    for (const s of steps) {
      if (s.type === "send") {
        if (s.nextStepId)
          list.push({ id: `${s.id}-next`, source: s.id, sourceHandle: "out", target: s.nextStepId, targetHandle: "in" });
      } else {
        if (s.yesStepId)
          list.push({
            id: `${s.id}-yes`,
            source: s.id,
            sourceHandle: "yes",
            target: s.yesStepId,
            targetHandle: "in",
            label: "Sim",
            style: { stroke: "var(--success)" },
          });
        if (s.noStepId)
          list.push({
            id: `${s.id}-no`,
            source: s.id,
            sourceHandle: "no",
            target: s.noStepId,
            targetHandle: "in",
            label: "Não",
            style: { stroke: "var(--critical)" },
          });
      }
    }
    return list;
  }, [steps, rootStepId]);

  const save = async () => {
    if (steps.some((s) => s.type === "send" && !s.templateName)) {
      toast.error("Escolha um template pra cada etapa de envio.");
      return;
    }
    const rootStep = steps.find((s) => s.id === rootStepId);
    if (!rootStep || rootStep.type !== "send") {
      toast.error("O gatilho precisa apontar pra uma etapa de Enviar WhatsApp.");
      return;
    }
    const orderedSteps = [rootStep, ...steps.filter((s) => s.id !== rootStepId)];
    setBusy(true);
    try {
      const res = await runSave({
        data: {
          id: seed?.id,
          nome: nome.trim() || "Automação",
          descricao: descricao.trim() || undefined,
          segmentType: segmentId ? "custom" : segmentType,
          segmentId,
          steps: orderedSteps.map((s) =>
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

  const selectedStep = selectedNodeId && selectedNodeId !== TRIGGER_ID ? steps.find((s) => s.id === selectedNodeId) : undefined;
  const panelOpen = addPanelOpen || selectedNodeId !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[1400px] h-[88vh] p-0 gap-0 flex flex-col overflow-hidden sm:rounded-xl">
        <DialogTitle className="sr-only">{seed?.id ? "Editar automação" : "Instalar automação"}</DialogTitle>
        <DialogDescription className="sr-only">
          Canvas de automação: arraste conexões entre as etapas para montar o fluxo.
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do fluxo"
            className="max-w-xs font-medium h-9"
          />
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
              ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {ativo ? "Ativo" : "Pausado"}
          </span>
          <div className="flex-1" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setAddPanelOpen(false);
              setSelectedNodeId(TRIGGER_ID);
            }}
          >
            <Settings className="size-3.5" /> Configurações
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setSelectedNodeId(null);
              setAddPanelOpen(true);
            }}
          >
            <Plus className="size-3.5" /> Adicionar etapa
          </Button>
          <Button disabled={busy} size="sm" onClick={save}>
            {busy ? "Salvando..." : seed?.id ? "Salvar" : "Instalar automação"}
          </Button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0">
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChangeHandler}
                onConnect={onConnect}
                onNodesDelete={onNodesDelete}
                onEdgesDelete={onEdgesDelete}
                onNodeClick={(_, node) => {
                  setAddPanelOpen(false);
                  setSelectedNodeId(node.id);
                }}
                onPaneClick={() => {
                  setSelectedNodeId(null);
                  setAddPanelOpen(false);
                }}
                fitView
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ type: "smoothstep" }}
              >
                <Background gap={20} />
                <Controls showInteractive={false} />
              </ReactFlow>
            </ReactFlowProvider>
          </div>

          {panelOpen && (
            <div className="w-[340px] shrink-0 border-l border-border overflow-y-auto p-4 space-y-4">
              {addPanelOpen && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Adicionar etapa</p>
                    <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setAddPanelOpen(false)}>
                      <Plus className="size-4 rotate-45" />
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ação</p>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg border border-border p-3 hover:border-primary hover:bg-muted/40 transition-colors"
                      onClick={() => addStep(newSendStep())}
                    >
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <MessageCircle className="size-3.5" /> Enviar WhatsApp
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Espera um tempo e dispara um template aprovado.</p>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decisões</p>
                    {[
                      { cond: { kind: "novo_pedido" } as DecisionCondition, label: "Fez um novo pedido?", sub: "Desde que entrou na automação." },
                      {
                        cond: { kind: "pedido_status", field: "financial_status", value: FINANCIAL_STATUSES[0]! } as DecisionCondition,
                        label: "Pedido tem status?",
                        sub: "Pagamento ou envio do pedido mais recente.",
                      },
                      {
                        cond: { kind: "segmento", segmentType: SEGMENT_TYPES[0]! } as DecisionCondition,
                        label: "Cliente está em segmento?",
                        sub: "Checa se o cliente pertence a um segmento.",
                      },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        className="w-full text-left rounded-lg border border-border p-3 hover:border-primary hover:bg-muted/40 transition-colors"
                        onClick={() => addStep(newDecisionStep(opt.cond))}
                      >
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <GitBranch className="size-3.5" /> {opt.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!addPanelOpen && selectedNodeId === TRIGGER_ID && (
                <>
                  <p className="text-sm font-semibold">Configurações da automação</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gatilho: segmento (público que entra na automação)</Label>
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
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Exigir aprovação</p>
                      <p className="text-xs text-muted-foreground">Clientes novos ficam na fila até aprovar a leva.</p>
                    </div>
                    <Switch checked={requerAprovacao} onCheckedChange={setRequerAprovacao} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Automação ativa</p>
                      <p className="text-xs text-muted-foreground">Pausada, não matricula nem processa ninguém.</p>
                    </div>
                    <Switch checked={ativo} onCheckedChange={setAtivo} />
                  </div>
                </>
              )}

              {!addPanelOpen && selectedStep?.type === "send" && (
                <SendStepPanel
                  step={selectedStep}
                  isRoot={selectedStep.id === rootStepId}
                  approved={approved}
                  onChange={(patch) => updateStep(selectedStep.id, patch)}
                  onDelete={() => removeStepById(selectedStep.id)}
                />
              )}

              {!addPanelOpen && selectedStep?.type === "decision" && (
                <DecisionStepPanel
                  step={selectedStep}
                  customSegments={customSegments}
                  onChange={(patch) => updateStep(selectedStep.id, patch)}
                  onDelete={() => removeStepById(selectedStep.id)}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SendStepPanel({
  step,
  isRoot,
  approved,
  onChange,
  onDelete,
}: {
  step: SendStepSeed;
  isRoot: boolean;
  approved: { name: string; language: string; components?: { type: string; text?: string }[] }[];
  onChange: (patch: Partial<SendStepSeed>) => void;
  onDelete: () => void;
}) {
  const template = approved.find((t) => t.name === step.templateName);
  const varCount = countTemplateVars(template?.components);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <MessageCircle className="size-3.5" /> Enviar WhatsApp
        </p>
        <Button type="button" size="icon" variant="ghost" className="size-7 text-critical" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{isRoot ? "Esperar antes de matricular (horas)" : "Esperar desde a etapa anterior (horas)"}</Label>
        <Input
          type="number"
          min={0}
          max={720}
          value={step.waitHours}
          onChange={(e) => onChange({ waitHours: Number(e.target.value) || 0 })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Tipo</Label>
        <Select value={step.messageType} onValueChange={(v) => onChange({ messageType: v as "marketing" | "utility" })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="utility">Utilidade</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Template aprovado</Label>
        <Select value={step.templateName} onValueChange={(v) => onChange({ templateName: v, bodyParams: [] })}>
          <SelectTrigger>
            <SelectValue placeholder="Escolha um template" />
          </SelectTrigger>
          <SelectContent>
            {approved.map((t) => (
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
                onChange({ bodyParams: next });
              }}
            />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Cupom da Shopify (opcional)</Label>
        <Input value={step.couponCode ?? ""} onChange={(e) => onChange({ couponCode: e.target.value })} />
      </div>

      <p className="text-xs text-muted-foreground">Arraste uma conexão a partir do ponto embaixo do card pra ligar com a próxima etapa.</p>
    </>
  );
}

function DecisionStepPanel({
  step,
  customSegments,
  onChange,
  onDelete,
}: {
  step: DecisionStepSeed;
  customSegments: { id: string; nome: string }[];
  onChange: (patch: Partial<DecisionStepSeed>) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <GitBranch className="size-3.5" /> Decisão
        </p>
        <Button type="button" size="icon" variant="ghost" className="size-7 text-critical" onClick={onDelete}>
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
            onChange({ condition });
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
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de status</Label>
            <Select
              value={step.condition.field}
              onValueChange={(v) =>
                onChange({
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
                onChange({ condition: { ...(step.condition as { kind: "pedido_status"; field: any; value: string }), value: v } })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(step.condition.field === "fulfillment_status" ? FULFILLMENT_STATUSES : FINANCIAL_STATUSES).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
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
              onChange({
                condition: isCustom ? { kind: "segmento", segmentType: "custom", segmentId: v } : { kind: "segmento", segmentType: v },
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

      <p className="text-xs text-muted-foreground">
        Arraste uma conexão a partir do <span className="text-success font-medium">Sim</span> ou do{" "}
        <span className="text-critical font-medium">Não</span> pra ligar com a próxima etapa.
      </p>
    </>
  );
}
