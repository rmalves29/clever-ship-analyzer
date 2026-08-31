import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch, MessageCircle, Settings, Rocket, X } from "lucide-react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Node,
  type Edge,
  type EdgeProps,
  type Connection,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatWaitLabel, maxWaitForUnit, resolveWaitInput, toWaitMinutes, type WaitUnit } from "@/lib/automation-wait";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SEGMENT_TYPES } from "@/lib/crm-mock";
import { getSegmentsList } from "@/lib/crm-segmentation.functions";
import { listMetaTemplates, saveAutomation } from "@/lib/whatsapp-meta.functions";
import { previewWhatsappAudience } from "@/lib/whatsapp-audience-preview.functions";
import { normalizeWhatsappAudienceSelection } from "@/lib/whatsapp-audience-selection";
import { extractTemplateBodyTokens, isNamedParameterToken } from "@/lib/whatsapp-template-body-tokens";

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
  | { kind: "segmento"; segmentType: string; segmentId?: string | undefined }
  | { kind: "valor_pedido"; operator: "gt" | "gte" | "lt" | "lte"; value: number }
  | { kind: "localizacao"; field: "city" | "province"; value: string }
  | { kind: "tag"; value: string };

/** Tokens dinâmicos que o motor de envio resolve por destinatário (dispatchCampaign,
 *  whatsapp-meta.server.ts) — funcionam nos campos de variável de qualquer etapa "Enviar". */
const DYNAMIC_VARS: { token: string; label: string }[] = [
  { token: "{{NOME_CLIENTE}}", label: "Primeiro nome do cliente" },
  { token: "{{NUMERO_PEDIDO}}", label: "Número do pedido mais recente" },
  { token: "{{VALOR_TOTAL}}", label: "Valor total do pedido mais recente" },
  { token: "{{ITENS_COMPRADOS}}", label: "Resumo dos itens comprados" },
  { token: "{{CUPOM_DESCONTO}}", label: "Código de cupom do pedido (se houver)" },
  { token: "{{FRETE_ESCOLHIDO}}", label: "Método de frete escolhido" },
  { token: "{{RASTREIO}}", label: "Código de rastreio" },
  { token: "{{STATUS_PEDIDO}}", label: "Status do envio (Enviado/Processando)" },
  { token: "{{LINK_CHECKOUT}}", label: "Link do checkout (carrinho abandonado)" },
  { token: "{{CUPOM_CASHBACK}}", label: "Cupom de cashback do pedido" },
  { token: "{{VALOR_CASHBACK}}", label: "Valor do cashback gerado" },
  { token: "{{COMPRA_MINIMA_CASHBACK}}", label: "Compra mínima para usar o cashback" },
  { token: "{{VALIDADE_CASHBACK}}", label: "Data de validade do cashback" },
];

export type SendStepSeed = {
  id: string;
  type: "send";
  waitMinutes: number;
  waitValue?: number | undefined;
  waitUnit?: WaitUnit | undefined;
  templateName: string;
  templateLanguage?: string | undefined;
  bodyParams: string[];
  couponCode?: string | undefined;
  nextStepId: string | null;
};

/** A categoria (Marketing/Utilidade) vem sempre do template aprovado na Meta —
 *  não é escolha manual, pra não divergir do que a Meta realmente vai cobrar/permitir. */
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
    waitMinutes: 0,
    waitValue: 0,
    waitUnit: "minutes",
    templateName: "",
    bodyParams: [],
    nextStepId: null,
  };
}

function newDecisionStep(condition: DecisionCondition): DecisionStepSeed {
  return { id: newId(), type: "decision", condition, yesStepId: null, noStepId: null };
}

/** Tokens de variável do BODY do template — posicionais ({{1}}, {{2}}) ou nomeados
 *  ({{primeiro_nome}}), na ordem em que aparecem no texto. */
function templateBodyTokens(components: { type: string; text?: string }[] | undefined): string[] {
  const body = components?.find((c) => c.type === "BODY");
  return extractTemplateBodyTokens(body?.text);
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

/** Etapas realmente alcançáveis a partir do gatilho — o motor de automação (automations-engine.server.ts)
 *  só executa esse subgrafo, então validações de "falta preencher" não devem travar por causa de
 *  etapas órfãs (desconectadas) que sobraram de uma edição anterior. */
function reachableStepIds(steps: AutomationStepSeed[], rootStepId: string | null): Set<string> {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  function visit(id: string | null) {
    if (!id || visited.has(id) || !byId.has(id)) return;
    visited.add(id);
    const step = byId.get(id)!;
    if (step.type === "send") visit(step.nextStepId);
    else {
      visit(step.yesStepId);
      visit(step.noStepId);
    }
  }
  visit(rootStepId);
  return visited;
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
      <p className="text-xs text-muted-foreground mt-0.5">
                {formatWaitLabel(d.step) === "Sem espera" ? "Sem espera antes" : `Espera ${formatWaitLabel(d.step)} antes`}
              </p>
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

/** Ligação com um "x" pra remover só essa conexão (sem apagar as etapas), padrão em qualquer
 *  fluxo — assim dá pra reconectar a etapa a outra saída sem precisar recriar o card inteiro. */
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const edgeData = data as { label?: string; labelClassName?: string; onDelete?: () => void } | undefined;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} {...(markerEnd ? { markerEnd } : {})} />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
        >
          {edgeData?.label && (
            <span className={cn("rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold shadow-sm", edgeData.labelClassName)}>
              {edgeData.label}
            </span>
          )}
          {edgeData?.onDelete && (
            <button
              type="button"
              title="Remover esta ligação"
              onClick={(e) => {
                e.stopPropagation();
                edgeData.onDelete!();
              }}
              className="flex size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-critical hover:text-critical"
            >
              <X className="size-2.5" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { deletable: DeletableEdge };

const nodeTypes = { trigger: TriggerNode, send: SendNode, decision: DecisionNode };
const TRIGGER_ID = "__trigger__";

/** Força a sincronização imperativa nodes/edges -> store interno do React Flow.
 *  Necessário porque o sync automático via props (StoreUpdater) não estava repassando
 *  as edges pro store em alguns casos observados aqui — isso garante convergência. */
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
  const runAudiencePreview = useServerFn(previewWhatsappAudience);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [segmentType, setSegmentType] = useState<string>("");
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
    setSegmentType(seed?.segmentId ? "" : (seed?.segmentType ?? ""));
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

  const triggerAudienceSelection = useMemo(() => {
    try {
      return normalizeWhatsappAudienceSelection(segmentType, segmentId);
    } catch {
      return null;
    }
  }, [segmentType, segmentId]);

  const { data: triggerAudience, isLoading: loadingTriggerAudience } = useQuery({
    queryKey: ["automation-trigger-audience", triggerAudienceSelection?.segmentType, triggerAudienceSelection?.segmentId, open],
    queryFn: () =>
      runAudiencePreview({
        data: { segmentType: triggerAudienceSelection!.segmentType, segmentId: triggerAudienceSelection!.segmentId },
      }),
    enabled: Boolean(open && triggerAudienceSelection),
    retry: 1,
  });

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
  }, [layout, steps, manualPositions, selectedNodeId, rootStepId, segmentLabel]);

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    if (rootStepId) {
      list.push({
        id: `trigger-${rootStepId}`,
        type: "smoothstep",
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
        if (s.nextStepId) {
          const edge: Edge = {
            id: `${s.id}-next`,
            type: "deletable",
            source: s.id,
            sourceHandle: "out",
            target: s.nextStepId,
            targetHandle: "in",
            data: {},
          };
          edge.data!["onDelete"] = () => onEdgesDelete([edge]);
          list.push(edge);
        }
      } else {
        if (s.yesStepId) {
          const edge: Edge = {
            id: `${s.id}-yes`,
            type: "deletable",
            source: s.id,
            sourceHandle: "yes",
            target: s.yesStepId,
            targetHandle: "in",
            style: { stroke: "var(--success)" },
            data: { label: "Sim", labelClassName: "text-success" },
          };
          edge.data!["onDelete"] = () => onEdgesDelete([edge]);
          list.push(edge);
        }
        if (s.noStepId) {
          const edge: Edge = {
            id: `${s.id}-no`,
            type: "deletable",
            source: s.id,
            sourceHandle: "no",
            target: s.noStepId,
            targetHandle: "in",
            style: { stroke: "var(--critical)" },
            data: { label: "Não", labelClassName: "text-critical" },
          };
          edge.data!["onDelete"] = () => onEdgesDelete([edge]);
          list.push(edge);
        }
      }
    }
    return list;
  }, [steps, rootStepId, onEdgesDelete]);

  /** Força o React Flow a remontar do zero sempre que a estrutura do grafo muda (nova etapa,
   *  nova conexão, remoção). Contorna um caso em que o sync incremental nodes/edges->store
   *  interno não repassava as arestas pro render em algumas atualizações. */
  const graphKey = useMemo(() => edges.map((e) => e.id).join(",") + "|" + nodes.map((n) => n.id).join(","), [edges, nodes]);

  const save = async () => {
    if (!segmentId) {
      toast.error("Escolha um segmento de Contatos → Segmentos como gatilho.");
      return;
    }
    const rootStep = steps.find((s) => s.id === rootStepId);
    if (!rootStep || rootStep.type !== "send") {
      toast.error("O gatilho precisa apontar pra uma etapa de Enviar WhatsApp.");
      return;
    }
    const reachableIds = reachableStepIds(steps, rootStepId);
    const liveSteps = steps.filter((s) => reachableIds.has(s.id));
    if (liveSteps.some((s) => s.type === "send" && !s.templateName)) {
      toast.error("Escolha um template pra cada etapa de envio.");
      return;
    }
    const orderedSteps = [rootStep, ...liveSteps.filter((s) => s.id !== rootStepId)];
    setBusy(true);
    try {
      const res = await runSave({
        data: {
          id: seed?.id,
          nome: nome.trim() || "Automação",
          descricao: descricao.trim() || undefined,
          segmentType: "custom",
          segmentId,
          steps: orderedSteps.map((s) => {
            if (s.type !== "send") {
              return {
                id: s.id,
                type: "decision" as const,
                condition: s.condition,
                yesStepId: s.yesStepId,
                noStepId: s.noStepId,
              };
            }
            const tmpl = approved.find((t: { name: string; category?: string; components?: { type: string; text?: string }[] }) => t.name === s.templateName);
            return {
              id: s.id,
              type: "send" as const,
              waitMinutes: toWaitMinutes(resolveWaitInput(s).waitValue, resolveWaitInput(s).waitUnit),
              waitValue: resolveWaitInput(s).waitValue,
              waitUnit: resolveWaitInput(s).waitUnit,
              templateName: s.templateName,
              templateLanguage: s.templateLanguage,
              messageType: templateMessageType(tmpl?.category),
              bodyParams: s.bodyParams,
              bodyParamTokens: templateBodyTokens(tmpl?.components),
              couponCode: s.couponCode?.trim() || undefined,
              nextStepId: s.nextStepId,
            };
          }),
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
  const rootStepForValidation = steps.find((s) => s.id === rootStepId);
  const reachable = reachableStepIds(steps, rootStepId);
  const missingTemplate = steps.some((s) => reachable.has(s.id) && s.type === "send" && !s.templateName);
  const rootNotSend = !rootStepForValidation || rootStepForValidation.type !== "send";
  const canInstall = Boolean(segmentId) && !missingTemplate && !rootNotSend;
  const installBlockedReason = !segmentId
    ? "Escolha um segmento de Contatos → Segmentos como gatilho antes de instalar."
    : rootNotSend
      ? "O gatilho precisa apontar pra uma etapa de Enviar WhatsApp antes de instalar."
      : missingTemplate
        ? "Escolha um template pra cada etapa de envio antes de instalar."
        : undefined;

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
          <Button disabled={busy || !canInstall} title={installBlockedReason} size="sm" onClick={save}>
            {busy ? "Salvando..." : seed?.id ? "Salvar" : "Instalar automação"}
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
                edgeTypes={edgeTypes}
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
                      {
                        cond: { kind: "valor_pedido", operator: "gt", value: 100 } as DecisionCondition,
                        label: "Valor do pedido?",
                        sub: "Compara o valor do pedido mais recente com um número.",
                      },
                      {
                        cond: { kind: "localizacao", field: "city", value: "" } as DecisionCondition,
                        label: "Cidade ou estado?",
                        sub: "Filtra pela localização cadastrada do cliente.",
                      },
                      {
                        cond: { kind: "tag", value: "" } as DecisionCondition,
                        label: "Tem uma tag?",
                        sub: "Checa se o cliente tem uma tag específica na Shopify.",
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
                    <Select value={segmentId ?? ""} onValueChange={(v) => setSegmentId(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um segmento criado em Contatos → Segmentos" />
                      </SelectTrigger>
                      <SelectContent>
                        {customSegments.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Nenhum segmento em Contatos → Segmentos ainda.
                          </div>
                        )}
                        {customSegments.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {!segmentId
                        ? "Crie e escolha um segmento em Contatos → Segmentos para definir o público."
                        : loadingTriggerAudience
                          ? "Calculando quantos contatos entram nesse gatilho…"
                          : `${triggerAudience?.destinatarios ?? 0} contato(s) vão receber esta automação agora`}
                    </p>
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
  approved: { name: string; language: string; category?: string; components?: { type: string; text?: string }[] }[];
  onChange: (patch: Partial<SendStepSeed>) => void;
  onDelete: () => void;
}) {
  const template = approved.find((t) => t.name === step.templateName);
  const tokens = templateBodyTokens(template?.components);
  const wait = resolveWaitInput(step);

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
        <Label className="text-xs">{isRoot ? "Esperar antes de matricular" : "Esperar desde a etapa anterior"}</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            max={maxWaitForUnit(wait.waitUnit)}
            step={1}
            className="flex-1"
            value={wait.waitValue}
            onChange={(e) => {
              const value = Math.max(0, Math.min(maxWaitForUnit(wait.waitUnit), Math.floor(Number(e.target.value) || 0)));
              onChange({ waitValue: value, waitUnit: wait.waitUnit, waitMinutes: toWaitMinutes(value, wait.waitUnit) });
            }}
          />
          <Select
            value={wait.waitUnit}
            onValueChange={(v) => {
              const unit = v as WaitUnit;
              const value = Math.min(wait.waitValue, maxWaitForUnit(unit));
              onChange({ waitValue: value, waitUnit: unit, waitMinutes: toWaitMinutes(value, unit) });
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutos</SelectItem>
              <SelectItem value="days">Dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Máximo de 30 dias (43.200 minutos). {formatWaitLabel({ ...step, ...wait })}
        </p>
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
                {t.name} ({t.language}) · {templateCategoryLabel(t.category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {template && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <Badge variant="outline">{templateCategoryLabel(template.category)}</Badge>
            <span className="text-xs text-muted-foreground">Categoria definida na Meta para este template.</span>
          </div>
        )}
      </div>

      {tokens.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Variáveis do template ({tokens.length})</Label>
          {tokens.map((token, varIndex) => (
            <div key={token} className="space-y-1">
              {isNamedParameterToken(token) && <p className="text-[10px] text-muted-foreground">{token}</p>}
              <Input
                placeholder={isNamedParameterToken(token) ? `{{${token}}}` : `{{${varIndex + 1}}}`}
                value={step.bodyParams[varIndex] ?? ""}
                onChange={(e) => {
                  const next = [...step.bodyParams];
                  next[varIndex] = e.target.value;
                  onChange({ bodyParams: next });
                }}
              />
            </div>
          ))}
          <div className="rounded-lg border border-dashed border-border p-2 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tokens que viram dados reais do cliente no envio
            </p>
            <div className="flex flex-wrap gap-1">
              {DYNAMIC_VARS.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  title={v.label}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/40 hover:bg-muted hover:border-primary text-muted-foreground font-mono transition-colors"
                  onClick={() => {
                    const next = [...step.bodyParams];
                    next[0] = (next[0] ?? "") + v.token;
                    onChange({ bodyParams: next });
                  }}
                >
                  {v.token}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Clique pra inserir na 1ª variável, ou digite direto em qualquer campo acima. Cada cliente recebe o valor dele — ex:
              "Oi {"{{NOME_CLIENTE}}"}, seu pedido {"{{NUMERO_PEDIDO}}"} já foi enviado!".
            </p>
          </div>
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
                  : v === "valor_pedido"
                    ? { kind: "valor_pedido", operator: "gt", value: 100 }
                    : v === "localizacao"
                      ? { kind: "localizacao", field: "city", value: "" }
                      : v === "tag"
                        ? { kind: "tag", value: "" }
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

      {step.condition.kind === "valor_pedido" && (
        <div className="grid gap-3 grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Comparação</Label>
            <Select
              value={step.condition.operator}
              onValueChange={(v) =>
                onChange({ condition: { ...(step.condition as { kind: "valor_pedido"; operator: any; value: number }), operator: v as any } })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
            <Input
              type="number"
              min={0}
              value={step.condition.value}
              onChange={(e) =>
                onChange({
                  condition: { ...(step.condition as { kind: "valor_pedido"; operator: any; value: number }), value: Number(e.target.value) || 0 },
                })
              }
            />
          </div>
        </div>
      )}

      {step.condition.kind === "localizacao" && (
        <div className="grid gap-3 grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Campo</Label>
            <Select
              value={step.condition.field}
              onValueChange={(v) =>
                onChange({ condition: { ...(step.condition as { kind: "localizacao"; field: any; value: string }), field: v as any } })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="city">Cidade</SelectItem>
                <SelectItem value="province">Estado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor</Label>
            <Input
              value={step.condition.value}
              placeholder={step.condition.field === "city" ? "Ex: Belo Horizonte" : "Ex: MG"}
              onChange={(e) =>
                onChange({ condition: { ...(step.condition as { kind: "localizacao"; field: any; value: string }), value: e.target.value } })
              }
            />
          </div>
        </div>
      )}

      {step.condition.kind === "tag" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Tag (exatamente como está na Shopify)</Label>
          <Input
            value={step.condition.value}
            placeholder="Ex: VIP"
            onChange={(e) => onChange({ condition: { kind: "tag", value: e.target.value } })}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Arraste uma conexão a partir do <span className="text-success font-medium">Sim</span> ou do{" "}
        <span className="text-critical font-medium">Não</span> pra ligar com a próxima etapa.
      </p>
    </>
  );
}
