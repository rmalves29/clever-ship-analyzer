import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch, MessageCircle, Settings, Rocket, MousePointerClick, Type } from "lucide-react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useReactFlow,
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
import { SEGMENT_TYPES } from "@/lib/crm-mock";
import { getSegmentsList } from "@/lib/crm-segmentation.functions";
import { SEGMENT_LABEL } from "@/components/crm/AutomationDialog";
import { saveConversationalFlow, getRecentlyUsedTemplateNames } from "@/lib/conversational-flows.functions";

type DecisionCondition =
  | { kind: "novo_pedido" }
  | { kind: "pedido_status"; field: "financial_status" | "fulfillment_status"; value: string }
  | { kind: "segmento"; segmentType: string; segmentId?: string | undefined }
  | { kind: "valor_pedido"; operator: "gt" | "gte" | "lt" | "lte"; value: number }
  | { kind: "localizacao"; field: "city" | "province"; value: string }
  | { kind: "tag"; value: string };

export type ConvSendStepSeed = {
  id: string;
  type: "send";
  waitMinutes: number;
  text: string;
  buttonText: string | null;
  buttonUrl: string | null;
  nextStepId: string | null;
};

export type DecisionStepSeed = {
  id: string;
  type: "decision";
  condition: DecisionCondition;
  yesStepId: string | null;
  noStepId: string | null;
};

export type ConvStepSeed = ConvSendStepSeed | DecisionStepSeed;

export type ConversationalFlowSeed = {
  id?: string | undefined;
  nome: string;
  descricao?: string | undefined;
  ativo?: boolean | undefined;
  triggerType?: "button_click" | "keyword" | undefined;
  triggerTemplateName?: string | undefined;
  triggerValues?: string[] | undefined;
  steps?: ConvStepSeed[] | undefined;
};

function newId() {
  return `cstep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newSendStep(): ConvSendStepSeed {
  return { id: newId(), type: "send", waitMinutes: 0, text: "", buttonText: null, buttonUrl: null, nextStepId: null };
}

function newDecisionStep(condition: DecisionCondition): DecisionStepSeed {
  return { id: newId(), type: "decision", condition, yesStepId: null, noStepId: null };
}

const FINANCIAL_STATUSES = ["PAID", "PENDING", "PARTIALLY_PAID", "REFUNDED", "PARTIALLY_REFUNDED", "VOIDED", "EXPIRED"];
const FULFILLMENT_STATUSES = ["FULFILLED", "UNFULFILLED", "IN_PROGRESS", "PARTIAL", "RESTOCKED"];
const OPERATOR_LABEL: Record<"gt" | "gte" | "lt" | "lte", string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

function conditionLabel(c: DecisionCondition): string {
  if (c.kind === "novo_pedido") return "Fez um novo pedido?";
  if (c.kind === "pedido_status") return `Pedido ${c.field === "financial_status" ? "pagamento" : "envio"} = ${c.value}`;
  if (c.kind === "valor_pedido") return `Valor do pedido ${OPERATOR_LABEL[c.operator]} R$ ${c.value}`;
  if (c.kind === "localizacao") return `${c.field === "city" ? "Cidade" : "Estado"} = ${c.value || "..."}`;
  if (c.kind === "tag") return `Tem a tag "${c.value || "..."}"`;
  return "Está em segmento?";
}

const COL_W = 296;
const ROW_H = 150;

function layoutSteps(steps: ConvStepSeed[], rootStepId: string | null): Record<string, { x: number; y: number }> {
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
    <div className={cn("w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm cursor-pointer transition-colors", selected ? "border-primary" : "border-border")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Rocket className="size-3" /> Gatilho do fluxo
      </p>
      <p className="text-sm font-medium mt-1">{d.label}</p>
      <Handle type="source" position={Position.Bottom} id="out" className="!bg-primary !size-2.5" />
    </div>
  );
}

function SendNode({ data, selected }: NodeProps) {
  const d = data as unknown as { step: ConvSendStepSeed };
  return (
    <div className={cn("w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm cursor-pointer transition-colors", selected ? "border-primary" : "border-border")}>
      <Handle type="target" position={Position.Top} id="in" className="!bg-muted-foreground !size-2.5" />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <MessageCircle className="size-3" /> Enviar WhatsApp
      </p>
      <p className="text-sm font-medium mt-1 truncate">{d.step.text || "Escreva a mensagem"}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {d.step.waitMinutes === 0 ? "Envia na hora" : `Espera ${d.step.waitMinutes} min antes`}
      </p>
      <Handle type="source" position={Position.Bottom} id="out" className="!bg-primary !size-2.5" />
    </div>
  );
}

function DecisionNode({ data, selected }: NodeProps) {
  const d = data as unknown as { step: DecisionStepSeed };
  return (
    <div className={cn("w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm cursor-pointer transition-colors", selected ? "border-primary" : "border-border")}>
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

function CanvasSync({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const { setNodes, setEdges } = useReactFlow();
  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);
  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);
  return null;
}

export function ConversationalFlowDialog({
  seed,
  open,
  onOpenChange,
  onSaved,
}: {
  seed: ConversationalFlowSeed | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const runSave = useServerFn(saveConversationalFlow);
  const runGetTemplateNames = useServerFn(getRecentlyUsedTemplateNames);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [triggerType, setTriggerType] = useState<"button_click" | "keyword">("keyword");
  const [triggerTemplateName, setTriggerTemplateName] = useState<string | undefined>(undefined);
  const [triggerValuesText, setTriggerValuesText] = useState("");
  const [steps, setSteps] = useState<ConvStepSeed[]>([newSendStep()]);
  const [rootStepId, setRootStepId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(TRIGGER_ID);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(seed?.nome ?? "");
    setDescricao(seed?.descricao ?? "");
    setAtivo(seed?.ativo ?? true);
    setTriggerType(seed?.triggerType ?? "keyword");
    setTriggerTemplateName(seed?.triggerTemplateName);
    setTriggerValuesText((seed?.triggerValues ?? []).join(", "));
    const initialSteps = seed?.steps?.length ? seed.steps : [newSendStep()];
    setSteps(initialSteps);
    setRootStepId(initialSteps[0]!.id);
    setManualPositions({});
    setSelectedNodeId(TRIGGER_ID);
    setAddPanelOpen(false);
  }, [seed, open]);

  const { data: templateNames } = useQuery({
    queryKey: ["conv-flow-template-names"],
    queryFn: () => runGetTemplateNames(),
    enabled: open,
  });

  const { data: segmentsResult } = useQuery({
    queryKey: ["crm-segments-list"],
    queryFn: () => getSegmentsList(),
    enabled: open,
  });
  const customSegments = (segmentsResult ?? []) as { id: string; nome: string }[];

  const triggerLabel =
    triggerType === "button_click"
      ? triggerTemplateName
        ? `Clique em botão de "${triggerTemplateName}"`
        : "Clique em botão (escolha o template)"
      : triggerValuesText
        ? `Palavra-chave: ${triggerValuesText}`
        : "Palavra-chave (escolha o gatilho)";

  const updateStep = (id: string, patch: Partial<ConvStepSeed>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as ConvStepSeed) : s)));
  };

  const removeStepById = useCallback(
    (id: string) => {
      if (id === TRIGGER_ID) return;
      setSteps((prev) => {
        const rest = prev.filter((s) => s.id !== id);
        const cleaned = rest.map((s) =>
          s.type === "send"
            ? { ...s, nextStepId: s.nextStepId === id ? null : s.nextStepId }
            : { ...s, yesStepId: s.yesStepId === id ? null : s.yesStepId, noStepId: s.noStepId === id ? null : s.noStepId },
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

  const addStep = (step: ConvStepSeed) => {
    setSteps((prev) => {
      const preferred = selectedNodeId && selectedNodeId !== TRIGGER_ID ? prev.find((s) => s.id === selectedNodeId) : undefined;
      const hasOpenSlot = (s: ConvStepSeed) => (s.type === "send" ? s.nextStepId === null : s.yesStepId === null || s.noStepId === null);
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

  const onNodesDelete = useCallback((deleted: Node[]) => { for (const n of deleted) removeStepById(n.id); }, [removeStepById]);

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
      data: { label: triggerLabel },
      selected: selectedNodeId === TRIGGER_ID,
      deletable: false,
      width: 256,
      height: 84,
    };
    const stepNodes: Node[] = steps.map((s) => ({
      id: s.id,
      type: s.type,
      position: manualPositions[s.id] ?? layout[s.id] ?? { x: 0, y: 0 },
      data: { step: s },
      selected: selectedNodeId === s.id,
      width: 256,
      height: s.type === "decision" ? 118 : 100,
    }));
    return [triggerNode, ...stepNodes];
  }, [layout, steps, manualPositions, selectedNodeId, rootStepId, triggerLabel]);

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    if (rootStepId) {
      list.push({ id: `trigger-${rootStepId}`, type: "smoothstep", source: TRIGGER_ID, sourceHandle: "out", target: rootStepId, targetHandle: "in", deletable: false, style: { strokeWidth: 2 } });
    }
    for (const s of steps) {
      if (s.type === "send") {
        if (s.nextStepId) list.push({ id: `${s.id}-next`, source: s.id, sourceHandle: "out", target: s.nextStepId, targetHandle: "in" });
      } else {
        if (s.yesStepId) list.push({ id: `${s.id}-yes`, source: s.id, sourceHandle: "yes", target: s.yesStepId, targetHandle: "in", label: "Sim", style: { stroke: "var(--success)" } });
        if (s.noStepId) list.push({ id: `${s.id}-no`, source: s.id, sourceHandle: "no", target: s.noStepId, targetHandle: "in", label: "Não", style: { stroke: "var(--critical)" } });
      }
    }
    return list;
  }, [steps, rootStepId]);

  const graphKey = useMemo(() => edges.map((e) => e.id).join(",") + "|" + nodes.map((n) => n.id).join(","), [edges, nodes]);

  const save = async () => {
    if (steps.some((s) => s.type === "send" && !s.text.trim())) {
      toast.error("Escreva a mensagem de cada etapa de envio.");
      return;
    }
    const rootStep = steps.find((s) => s.id === rootStepId);
    if (!rootStep || rootStep.type !== "send") {
      toast.error("O gatilho precisa apontar pra uma etapa de Enviar WhatsApp.");
      return;
    }
    const triggerValues = triggerValuesText.split(",").map((v) => v.trim()).filter(Boolean);
    if (triggerValues.length === 0) {
      toast.error(triggerType === "button_click" ? "Informe o texto de pelo menos um botão." : "Informe pelo menos uma palavra-chave.");
      return;
    }
    if (triggerType === "button_click" && !triggerTemplateName) {
      toast.error("Escolha o template cujo clique de botão dispara esse fluxo.");
      return;
    }

    const orderedSteps = [rootStep, ...steps.filter((s) => s.id !== rootStepId)];
    setBusy(true);
    try {
      const res = await runSave({
        data: {
          id: seed?.id,
          nome: nome.trim() || "Fluxo conversacional",
          descricao: descricao.trim() || undefined,
          ativo,
          triggerType,
          triggerTemplateName: triggerType === "button_click" ? triggerTemplateName : undefined,
          triggerValues,
          steps: orderedSteps.map((s) =>
            s.type === "send"
              ? { id: s.id, type: "send" as const, waitMinutes: s.waitMinutes, text: s.text, buttonText: s.buttonText || undefined, buttonUrl: s.buttonUrl || undefined, nextStepId: s.nextStepId }
              : { id: s.id, type: "decision" as const, condition: s.condition, yesStepId: s.yesStepId, noStepId: s.noStepId },
          ),
        },
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(seed?.id ? "Fluxo atualizado." : "Fluxo criado com sucesso.");
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast.error("Erro ao salvar fluxo: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setBusy(false);
    }
  };

  const selectedStep = selectedNodeId && selectedNodeId !== TRIGGER_ID ? steps.find((s) => s.id === selectedNodeId) : undefined;
  const panelOpen = addPanelOpen || selectedNodeId !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[1400px] h-[88vh] p-0 gap-0 flex flex-col overflow-hidden sm:rounded-xl">
        <DialogTitle className="sr-only">{seed?.id ? "Editar fluxo conversacional" : "Criar fluxo conversacional"}</DialogTitle>
        <DialogDescription className="sr-only">Canvas de fluxo conversacional: arraste conexões entre as etapas para montar o fluxo.</DialogDescription>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do fluxo" className="max-w-xs font-medium h-9" />
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
            {ativo ? "Ativo" : "Pausado"}
          </span>
          <div className="flex-1" />
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => { setAddPanelOpen(false); setSelectedNodeId(TRIGGER_ID); }}>
            <Settings className="size-3.5" /> Configurações
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => { setSelectedNodeId(null); setAddPanelOpen(true); }}>
            <Plus className="size-3.5" /> Adicionar etapa
          </Button>
          <Button disabled={busy} size="sm" onClick={save}>
            {busy ? "Salvando..." : seed?.id ? "Salvar" : "Criar fluxo"}
          </Button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 h-full">
            <ReactFlowProvider>
              <CanvasSync nodes={nodes} edges={edges} />
              <ReactFlow
                key={graphKey}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChangeHandler}
                onConnect={onConnect}
                onNodesDelete={onNodesDelete}
                onEdgesDelete={onEdgesDelete}
                onNodeClick={(_, node) => { setAddPanelOpen(false); setSelectedNodeId(node.id); }}
                onPaneClick={() => { setSelectedNodeId(null); setAddPanelOpen(false); }}
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
                    <button type="button" className="w-full text-left rounded-lg border border-border p-3 hover:border-primary hover:bg-muted/40 transition-colors" onClick={() => addStep(newSendStep())}>
                      <p className="text-sm font-medium flex items-center gap-1.5"><MessageCircle className="size-3.5" /> Enviar WhatsApp</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Texto livre — sem precisar de template aprovado.</p>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decisões</p>
                    {[
                      { cond: { kind: "novo_pedido" } as DecisionCondition, label: "Fez um novo pedido?", sub: "Desde que entrou no fluxo." },
                      { cond: { kind: "pedido_status", field: "financial_status", value: FINANCIAL_STATUSES[0]! } as DecisionCondition, label: "Pedido tem status?", sub: "Pagamento ou envio do pedido mais recente." },
                      { cond: { kind: "segmento", segmentType: SEGMENT_TYPES[0]! } as DecisionCondition, label: "Cliente está em segmento?", sub: "Checa se o cliente pertence a um segmento." },
                      { cond: { kind: "valor_pedido", operator: "gt", value: 100 } as DecisionCondition, label: "Valor do pedido?", sub: "Compara o valor do pedido mais recente com um número." },
                      { cond: { kind: "localizacao", field: "city", value: "" } as DecisionCondition, label: "Cidade ou estado?", sub: "Filtra pela localização cadastrada do cliente." },
                      { cond: { kind: "tag", value: "" } as DecisionCondition, label: "Tem uma tag?", sub: "Checa se o cliente tem uma tag específica na Shopify." },
                    ].map((opt) => (
                      <button key={opt.label} type="button" className="w-full text-left rounded-lg border border-border p-3 hover:border-primary hover:bg-muted/40 transition-colors" onClick={() => addStep(newDecisionStep(opt.cond))}>
                        <p className="text-sm font-medium flex items-center gap-1.5"><GitBranch className="size-3.5" /> {opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!addPanelOpen && selectedNodeId === TRIGGER_ID && (
                <>
                  <p className="text-sm font-semibold">Configurações do fluxo</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de gatilho</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTriggerType("keyword")}
                        className={cn("rounded-lg border p-2.5 text-left transition-colors", triggerType === "keyword" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}
                      >
                        <p className="text-xs font-medium flex items-center gap-1"><Type className="size-3.5" /> Palavra-chave</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTriggerType("button_click")}
                        className={cn("rounded-lg border p-2.5 text-left transition-colors", triggerType === "button_click" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}
                      >
                        <p className="text-xs font-medium flex items-center gap-1"><MousePointerClick className="size-3.5" /> Clique em botão</p>
                      </button>
                    </div>
                  </div>

                  {triggerType === "button_click" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Template enviado (cujo botão dispara o fluxo)</Label>
                      <Select value={triggerTemplateName ?? ""} onValueChange={setTriggerTemplateName}>
                        <SelectTrigger><SelectValue placeholder="Escolha um template já usado numa campanha" /></SelectTrigger>
                        <SelectContent>
                          {(templateNames ?? []).map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs">{triggerType === "button_click" ? "Texto do(s) botão(ões) que disparam (separado por vírgula)" : "Palavra(s)-chave — dispara se a mensagem contiver qualquer uma (separado por vírgula)"}</Label>
                    <Textarea
                      rows={2}
                      value={triggerValuesText}
                      onChange={(e) => setTriggerValuesText(e.target.value)}
                      placeholder={triggerType === "button_click" ? "ex: Quero saber mais, Sim" : "ex: oi, olá, ajuda"}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Fluxo ativo</p>
                      <p className="text-xs text-muted-foreground">Pausado, não reage mais a mensagens novas.</p>
                    </div>
                    <Switch checked={ativo} onCheckedChange={setAtivo} />
                  </div>
                </>
              )}

              {!addPanelOpen && selectedStep?.type === "send" && (
                <ConvSendStepPanel step={selectedStep} onChange={(patch) => updateStep(selectedStep.id, patch)} onDelete={() => removeStepById(selectedStep.id)} />
              )}

              {!addPanelOpen && selectedStep?.type === "decision" && (
                <ConvDecisionStepPanel step={selectedStep} customSegments={customSegments} onChange={(patch) => updateStep(selectedStep.id, patch)} onDelete={() => removeStepById(selectedStep.id)} />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConvSendStepPanel({ step, onChange, onDelete }: { step: ConvSendStepSeed; onChange: (patch: Partial<ConvSendStepSeed>) => void; onDelete: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5"><MessageCircle className="size-3.5" /> Enviar WhatsApp</p>
        <Button type="button" size="icon" variant="ghost" className="size-7 text-critical" onClick={onDelete}><Trash2 className="size-3.5" /></Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Esperar antes de enviar (minutos)</Label>
        <Input type="number" min={0} max={43_200} value={step.waitMinutes} onChange={(e) => onChange({ waitMinutes: Number(e.target.value) || 0 })} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Mensagem</Label>
        <Textarea value={step.text} onChange={(e) => onChange({ text: e.target.value })} rows={5} maxLength={4096} placeholder="Oi! Como posso te ajudar?" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Botão (opcional)</Label>
        <Input value={step.buttonText ?? ""} onChange={(e) => onChange({ buttonText: e.target.value || null })} placeholder="Texto do botão (ex: Ver oferta)" maxLength={20} />
        <Input value={step.buttonUrl ?? ""} onChange={(e) => onChange({ buttonUrl: e.target.value || null })} placeholder="https://..." />
      </div>

      <p className="text-xs text-muted-foreground">Arraste uma conexão a partir do ponto embaixo do card pra ligar com a próxima etapa.</p>
    </>
  );
}

function ConvDecisionStepPanel({
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
        <p className="text-sm font-semibold flex items-center gap-1.5"><GitBranch className="size-3.5" /> Decisão</p>
        <Button type="button" size="icon" variant="ghost" className="size-7 text-critical" onClick={onDelete}><Trash2 className="size-3.5" /></Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Condição</Label>
        <Select
          value={step.condition.kind}
          onValueChange={(v) => {
            const condition: DecisionCondition =
              v === "pedido_status" ? { kind: "pedido_status", field: "financial_status", value: FINANCIAL_STATUSES[0]! }
              : v === "segmento" ? { kind: "segmento", segmentType: SEGMENT_TYPES[0]! }
              : v === "valor_pedido" ? { kind: "valor_pedido", operator: "gt", value: 100 }
              : v === "localizacao" ? { kind: "localizacao", field: "city", value: "" }
              : v === "tag" ? { kind: "tag", value: "" }
              : { kind: "novo_pedido" };
            onChange({ condition });
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="novo_pedido">Fez um novo pedido desde que entrou</SelectItem>
            <SelectItem value="pedido_status">Pedido mais recente tem um status</SelectItem>
            <SelectItem value="segmento">Está em um segmento</SelectItem>
            <SelectItem value="valor_pedido">Valor do pedido mais recente</SelectItem>
            <SelectItem value="localizacao">Cidade ou estado do cliente</SelectItem>
            <SelectItem value="tag">Tem uma tag na Shopify</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {step.condition.kind === "pedido_status" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de status</Label>
            <Select value={step.condition.field} onValueChange={(v) => onChange({ condition: { kind: "pedido_status", field: v as "financial_status" | "fulfillment_status", value: (v === "fulfillment_status" ? FULFILLMENT_STATUSES[0] : FINANCIAL_STATUSES[0])! } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="financial_status">Pagamento</SelectItem>
                <SelectItem value="fulfillment_status">Envio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor</Label>
            <Select value={step.condition.value} onValueChange={(v) => onChange({ condition: { ...(step.condition as { kind: "pedido_status"; field: any; value: string }), value: v } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(step.condition.field === "fulfillment_status" ? FULFILLMENT_STATUSES : FINANCIAL_STATUSES).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
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
              onChange({ condition: isCustom ? { kind: "segmento", segmentType: "custom", segmentId: v } : { kind: "segmento", segmentType: v } });
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEGMENT_TYPES.map((s) => <SelectItem key={s} value={s}>{SEGMENT_LABEL[s]}</SelectItem>)}
              {customSegments.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {step.condition.kind === "valor_pedido" && (
        <div className="grid gap-3 grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Comparação</Label>
            <Select value={step.condition.operator} onValueChange={(v) => onChange({ condition: { ...(step.condition as { kind: "valor_pedido"; operator: any; value: number }), operator: v as any } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gt">Maior que</SelectItem>
                <SelectItem value="gte">Maior ou igual a</SelectItem>
                <SelectItem value="lt">Menor que</SelectItem>
                <SelectItem value="lte">Menor ou igual a</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor (R$)</Label>
            <Input type="number" min={0} value={step.condition.value} onChange={(e) => onChange({ condition: { ...(step.condition as { kind: "valor_pedido"; operator: any; value: number }), value: Number(e.target.value) || 0 } })} />
          </div>
        </div>
      )}

      {step.condition.kind === "localizacao" && (
        <div className="grid gap-3 grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Campo</Label>
            <Select value={step.condition.field} onValueChange={(v) => onChange({ condition: { ...(step.condition as { kind: "localizacao"; field: any; value: string }), field: v as any } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="city">Cidade</SelectItem>
                <SelectItem value="province">Estado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor</Label>
            <Input value={step.condition.value} placeholder={step.condition.field === "city" ? "Ex: Belo Horizonte" : "Ex: MG"} onChange={(e) => onChange({ condition: { ...(step.condition as { kind: "localizacao"; field: any; value: string }), value: e.target.value } })} />
          </div>
        </div>
      )}

      {step.condition.kind === "tag" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Tag (exatamente como está na Shopify)</Label>
          <Input value={step.condition.value} placeholder="Ex: VIP" onChange={(e) => onChange({ condition: { kind: "tag", value: e.target.value } })} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Arraste uma conexão a partir do <span className="text-success font-medium">Sim</span> ou do <span className="text-critical font-medium">Não</span> pra ligar com a próxima etapa.
      </p>
    </>
  );
}
