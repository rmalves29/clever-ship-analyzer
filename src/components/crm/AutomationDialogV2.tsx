import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GitBranch, MessageCircle, Plus, Rocket, Settings, Trash2 } from "lucide-react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SEGMENT_TYPES, type SegmentType } from "@/lib/crm-mock";
import { getSegmentsList } from "@/lib/crm-segmentation.functions";
import { getWhatsappCampaignAudienceOptions } from "@/lib/whatsapp-campaign-audience.functions";
import { listMetaTemplates, saveAutomation } from "@/lib/whatsapp-meta.functions";
import {
  appendTemplateTokenAtIndex,
  extractWhatsappBodyVariables,
  missingWhatsappTemplateVariableIndexes,
  suggestedWhatsappDynamicToken,
  type WhatsappTemplateComponent,
} from "@/lib/whatsapp-template-variables";
import { cn } from "@/lib/utils";

export const SEGMENT_LABEL: Record<string, string> = {
  ticket_alto: "Ticket alto",
  sem_recompra: "Sem recompra",
  recompra_30d: "Recompra 30d",
  recompra_60d: "Recompra 60d",
  envio_atrasado: "Envio atrasado",
};

const DYNAMIC_VARS = [
  ["{{NOME_CLIENTE}}", "Primeiro nome do cliente"],
  ["{{NUMERO_PEDIDO}}", "Número do pedido"],
  ["{{VALOR_TOTAL}}", "Valor total do pedido"],
  ["{{ITENS_COMPRADOS}}", "Itens comprados"],
  ["{{CUPOM_DESCONTO}}", "Cupom do pedido"],
  ["{{FRETE_ESCOLHIDO}}", "Método de frete"],
  ["{{RASTREIO}}", "Código de rastreio"],
  ["{{LINK_RASTREIO}}", "Link de rastreio"],
  ["{{STATUS_PEDIDO}}", "Status do envio"],
  ["{{LINK_CHECKOUT}}", "Link do checkout"],
] as const;

const FINANCIAL_STATUSES = ["PAID", "PENDING", "PARTIALLY_PAID", "REFUNDED", "PARTIALLY_REFUNDED", "VOIDED", "EXPIRED"];
const FULFILLMENT_STATUSES = ["FULFILLED", "UNFULFILLED", "IN_PROGRESS", "PARTIAL", "RESTOCKED"];

type DecisionCondition =
  | { kind: "novo_pedido" }
  | { kind: "pedido_status"; field: "financial_status" | "fulfillment_status"; value: string }
  | { kind: "segmento"; segmentType: string; segmentId?: string | undefined }
  | { kind: "valor_pedido"; operator: "gt" | "gte" | "lt" | "lte"; value: number }
  | { kind: "localizacao"; field: "city" | "province"; value: string }
  | { kind: "tag"; value: string };

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

type TemplateOption = {
  name: string;
  language: string;
  status: string;
  components?: WhatsappTemplateComponent[];
};

type AudienceOption = { value: string; campaignId: string; nome: string; recipients: number };
type CustomSegment = { id: string; nome: string };

const newId = () => `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const newSendStep = (): SendStepSeed => ({ id: newId(), type: "send", waitHours: 0, templateName: "", messageType: "marketing", bodyParams: [], nextStepId: null });
const newDecisionStep = (condition: DecisionCondition): DecisionStepSeed => ({ id: newId(), type: "decision", condition, yesStepId: null, noStepId: null });

function conditionLabel(condition: DecisionCondition) {
  if (condition.kind === "novo_pedido") return "Fez um novo pedido?";
  if (condition.kind === "pedido_status") return `Pedido ${condition.field === "financial_status" ? "pagamento" : "envio"} = ${condition.value}`;
  if (condition.kind === "valor_pedido") return `Valor do pedido ${condition.operator} R$ ${condition.value}`;
  if (condition.kind === "localizacao") return `${condition.field === "city" ? "Cidade" : "Estado"} = ${condition.value || "..."}`;
  if (condition.kind === "tag") return `Tem a tag "${condition.value || "..."}"`;
  return "Está em segmento?";
}

const COL_W = 296;
const ROW_H = 150;
function layoutSteps(steps: AutomationStepSeed[], rootStepId: string | null) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const positions: Record<string, { x: number; y: number }> = {};
  const nextCol: number[] = [];
  const place = (id: string | null, depth: number) => {
    if (!id || positions[id] || !byId.has(id)) return;
    const col = nextCol[depth] ?? 0;
    nextCol[depth] = col + 1;
    positions[id] = { x: col * COL_W, y: depth * ROW_H };
    const step = byId.get(id)!;
    if (step.type === "send") place(step.nextStepId, depth + 1);
    else { place(step.yesStepId, depth + 1); place(step.noStepId, depth + 1); }
  };
  place(rootStepId, 1);
  let orphan = 0;
  for (const step of steps) if (!positions[step.id]) positions[step.id] = { x: orphan++ * COL_W, y: -ROW_H };
  return positions;
}

function TriggerNode({ data, selected }: NodeProps) {
  const label = (data as any).label as string;
  return <div className={cn("w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm", selected ? "border-primary" : "border-border")}>
    <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Rocket className="size-3" /> Início da automação</p>
    <p className="mt-1 text-sm font-medium">{label}</p>
    <Handle type="source" position={Position.Bottom} id="out" className="!size-2.5 !bg-primary" />
  </div>;
}
function SendNode({ data, selected }: NodeProps) {
  const step = (data as any).step as SendStepSeed;
  return <div className={cn("w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} id="in" className="!size-2.5 !bg-muted-foreground" />
    <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><MessageCircle className="size-3" /> Enviar WhatsApp</p>
    <p className="mt-1 truncate text-sm font-medium">{step.templateName || "Escolha um template"}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">Espera {step.waitHours}h antes</p>
    <Handle type="source" position={Position.Bottom} id="out" className="!size-2.5 !bg-primary" />
  </div>;
}
function DecisionNode({ data, selected }: NodeProps) {
  const step = (data as any).step as DecisionStepSeed;
  return <div className={cn("w-64 rounded-xl border-2 bg-background px-4 py-3 shadow-sm", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} id="in" className="!size-2.5 !bg-muted-foreground" />
    <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><GitBranch className="size-3" /> Decisão</p>
    <p className="mt-1 text-sm font-medium">{conditionLabel(step.condition)}</p>
    <div className="mt-2 flex justify-between px-2 text-[10px] font-semibold"><span className="text-success">Sim</span><span className="text-critical">Não</span></div>
    <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "30%" }} className="!size-2.5 !bg-success" />
    <Handle type="source" position={Position.Bottom} id="no" style={{ left: "70%" }} className="!size-2.5 !bg-critical" />
  </div>;
}
const nodeTypes = { trigger: TriggerNode, send: SendNode, decision: DecisionNode };
const TRIGGER_ID = "__trigger__";

function CanvasSync({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const { setNodes, setEdges } = useReactFlow();
  useEffect(() => setNodes(nodes), [nodes, setNodes]);
  useEffect(() => setEdges(edges), [edges, setEdges]);
  return null;
}

function audienceLabel(value: string, custom: CustomSegment[], campaigns: AudienceOption[]) {
  const campaign = campaigns.find((item) => item.value === value);
  if (campaign) return `Recebeu: ${campaign.nome}`;
  const segment = custom.find((item) => item.id === value);
  if (segment) return segment.nome;
  return SEGMENT_LABEL[value] ?? value ?? "Escolha um gatilho";
}

export function AutomationDialog({ seed, open, onOpenChange, onSaved }: { seed: AutomationSeed | null; open: boolean; onOpenChange: (value: boolean) => void; onSaved?: () => void }) {
  const runSave = useServerFn(saveAutomation);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [segmentType, setSegmentType] = useState<string>("sem_recompra");
  const [segmentId, setSegmentId] = useState<string | undefined>();
  const [steps, setSteps] = useState<AutomationStepSeed[]>([newSendStep()]);
  const [rootStepId, setRootStepId] = useState("");
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
    setSegmentType(seed?.segmentId ? "custom" : seed?.segmentType ?? "sem_recompra");
    setSegmentId(seed?.segmentId);
    const initial = seed?.steps?.length ? seed.steps : [newSendStep()];
    setSteps(initial);
    setRootStepId(initial[0]!.id);
    setRequerAprovacao(seed?.requerAprovacao ?? true);
    setAtivo(seed?.ativo ?? true);
    setManualPositions({});
    setSelectedNodeId(TRIGGER_ID);
    setAddPanelOpen(false);
  }, [seed, open]);

  const { data: templatesResult } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listMetaTemplates(), enabled: open });
  const approved = ((templatesResult?.success ? templatesResult.templates : []) as TemplateOption[]).filter((template) => template.status === "APPROVED");
  const { data: segmentsResult } = useQuery({ queryKey: ["crm-segments-list"], queryFn: () => getSegmentsList(), enabled: open });
  const customSegments = (segmentsResult ?? []) as CustomSegment[];
  const { data: campaignAudienceResult } = useQuery({ queryKey: ["whatsapp-campaign-audiences"], queryFn: () => getWhatsappCampaignAudienceOptions(), enabled: open });
  const campaignAudiences = (campaignAudienceResult ?? []) as AudienceOption[];

  const selectedAudienceValue = segmentId || segmentType;
  const segmentLabel = audienceLabel(selectedAudienceValue, customSegments, campaignAudiences);

  const updateStep = (id: string, patch: Partial<AutomationStepSeed>) => setSteps((current) => current.map((step) => step.id === id ? ({ ...step, ...patch } as AutomationStepSeed) : step));
  const removeStepById = useCallback((id: string) => {
    if (id === TRIGGER_ID) return;
    setSteps((current) => {
      const rest = current.filter((step) => step.id !== id).map((step) => step.type === "send"
        ? { ...step, nextStepId: step.nextStepId === id ? null : step.nextStepId }
        : { ...step, yesStepId: step.yesStepId === id ? null : step.yesStepId, noStepId: step.noStepId === id ? null : step.noStepId });
      if (!rest.length) { const fresh = newSendStep(); setRootStepId(fresh.id); return [fresh]; }
      if (id === rootStepId) setRootStepId(rest[0]!.id);
      return rest;
    });
    setSelectedNodeId(null);
  }, [rootStepId]);

  const addStep = (step: AutomationStepSeed) => {
    setSteps((current) => {
      const preferred = selectedNodeId && selectedNodeId !== TRIGGER_ID ? current.find((item) => item.id === selectedNodeId) : undefined;
      const openSlot = (item: AutomationStepSeed) => item.type === "send" ? item.nextStepId === null : item.yesStepId === null || item.noStepId === null;
      const target = (preferred && openSlot(preferred) ? preferred : undefined) ?? current.find(openSlot);
      const next = target ? current.map((item) => {
        if (item.id !== target.id) return item;
        if (item.type === "send") return { ...item, nextStepId: step.id };
        if (item.yesStepId === null) return { ...item, yesStepId: step.id };
        return { ...item, noStepId: step.id };
      }) : current;
      return [...next, step];
    });
    setSelectedNodeId(step.id);
    setAddPanelOpen(false);
  };

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.target) return;
    if (connection.source === TRIGGER_ID) {
      const target = steps.find((step) => step.id === connection.target);
      if (target?.type !== "send") return void toast.error("O gatilho precisa apontar pra uma etapa de Enviar WhatsApp.");
      return void setRootStepId(connection.target);
    }
    if (connection.source === connection.target) return;
    setSteps((current) => current.map((step) => {
      if (step.id !== connection.source) return step;
      if (step.type === "send") return { ...step, nextStepId: connection.target };
      return connection.sourceHandle === "yes" ? { ...step, yesStepId: connection.target } : { ...step, noStepId: connection.target };
    }));
  }, [steps]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setManualPositions((current) => {
    const next = { ...current };
    for (const change of changes) if (change.type === "position" && change.position) next[change.id] = change.position;
    return next;
  }), []);

  const layout = useMemo(() => layoutSteps(steps, rootStepId), [steps, rootStepId]);
  const nodes = useMemo<Node[]>(() => [
    { id: TRIGGER_ID, type: "trigger", position: manualPositions[TRIGGER_ID] ?? { x: layout[rootStepId]?.x ?? 0, y: 0 }, data: { label: segmentLabel }, selected: selectedNodeId === TRIGGER_ID, deletable: false },
    ...steps.map((step) => ({ id: step.id, type: step.type, position: manualPositions[step.id] ?? layout[step.id] ?? { x: 0, y: 0 }, data: { step }, selected: selectedNodeId === step.id })),
  ], [steps, layout, manualPositions, selectedNodeId, rootStepId, segmentLabel]);
  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = rootStepId ? [{ id: `trigger-${rootStepId}`, source: TRIGGER_ID, sourceHandle: "out", target: rootStepId, targetHandle: "in", deletable: false, type: "smoothstep" }] : [];
    for (const step of steps) {
      if (step.type === "send" && step.nextStepId) list.push({ id: `${step.id}-next`, source: step.id, sourceHandle: "out", target: step.nextStepId, targetHandle: "in" });
      if (step.type === "decision" && step.yesStepId) list.push({ id: `${step.id}-yes`, source: step.id, sourceHandle: "yes", target: step.yesStepId, targetHandle: "in", label: "Sim" });
      if (step.type === "decision" && step.noStepId) list.push({ id: `${step.id}-no`, source: step.id, sourceHandle: "no", target: step.noStepId, targetHandle: "in", label: "Não" });
    }
    return list;
  }, [steps, rootStepId]);

  const save = async () => {
    const noTemplate = steps.find((step) => step.type === "send" && !step.templateName) as SendStepSeed | undefined;
    if (noTemplate) {
      setSelectedNodeId(noTemplate.id); setAddPanelOpen(false);
      toast.error("Selecione o template na etapa Enviar WhatsApp antes de instalar a automação.");
      return;
    }
    for (const step of steps) {
      if (step.type !== "send") continue;
      const template = approved.find((item) => item.name === step.templateName);
      const variables = extractWhatsappBodyVariables(template?.components);
      const missing = missingWhatsappTemplateVariableIndexes(variables, step.bodyParams);
      if (missing.length) {
        setSelectedNodeId(step.id); setAddPanelOpen(false);
        toast.error(`Preencha a variável ${variables[missing[0]!]?.label ?? missing[0]! + 1} do template ${step.templateName}.`);
        return;
      }
    }
    const root = steps.find((step) => step.id === rootStepId);
    if (!root || root.type !== "send") return void toast.error("O gatilho precisa apontar pra uma etapa de Enviar WhatsApp.");
    const ordered = [root, ...steps.filter((step) => step.id !== rootStepId)];
    setBusy(true);
    try {
      const result = await runSave({ data: {
        id: seed?.id,
        nome: nome.trim() || "Automação",
        descricao: descricao.trim() || undefined,
        segmentType: segmentId ? "custom" : segmentType,
        segmentId,
        steps: ordered.map((step) => step.type === "send" ? {
          ...step,
          templateLanguage: step.templateLanguage,
          couponCode: step.couponCode?.trim() || undefined,
        } : step),
        requerAprovacao,
        ativo,
      }});
      if (!result.success) return void toast.error(`Não foi possível instalar a automação: ${result.error}`);
      toast.success(seed?.id ? "Automação atualizada." : "Automação instalada com sucesso.");
      onOpenChange(false); onSaved?.();
    } catch (error: any) {
      toast.error("Erro ao salvar automação: " + (error?.message ?? "falha desconhecida"));
    } finally { setBusy(false); }
  };

  const selectedStep = selectedNodeId && selectedNodeId !== TRIGGER_ID ? steps.find((step) => step.id === selectedNodeId) : undefined;
  const audienceOptions = { customSegments, campaignAudiences };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[88vh] w-[1400px] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
      <DialogTitle className="sr-only">{seed?.id ? "Editar automação" : "Instalar automação"}</DialogTitle>
      <DialogDescription className="sr-only">Editor visual da automação de WhatsApp.</DialogDescription>
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Nome do fluxo" className="h-9 max-w-xs font-medium" />
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{ativo ? "Ativo" : "Pausado"}</span>
        <div className="flex-1" />
        <Button type="button" size="sm" variant="outline" onClick={() => { setAddPanelOpen(false); setSelectedNodeId(TRIGGER_ID); }}><Settings className="mr-1 size-3.5" />Configurações</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setSelectedNodeId(null); setAddPanelOpen(true); }}><Plus className="mr-1 size-3.5" />Adicionar etapa</Button>
        <Button disabled={busy} size="sm" onClick={save}>{busy ? "Salvando..." : seed?.id ? "Salvar" : "Instalar automação"}</Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="h-full min-w-0 flex-1">
          <ReactFlowProvider>
            <CanvasSync nodes={nodes} edges={edges} />
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={onConnect}
              onNodesDelete={(deleted) => deleted.forEach((node) => removeStepById(node.id))}
              onEdgesDelete={(deleted) => setSteps((current) => current.map((step) => {
                const edge = deleted.find((item) => item.source === step.id); if (!edge) return step;
                if (step.type === "send") return { ...step, nextStepId: null };
                return edge.sourceHandle === "yes" ? { ...step, yesStepId: null } : { ...step, noStepId: null };
              }))}
              onNodeClick={(_, node) => { setAddPanelOpen(false); setSelectedNodeId(node.id); }}
              onPaneClick={() => { setSelectedNodeId(null); setAddPanelOpen(false); }} fitView proOptions={{ hideAttribution: true }} defaultEdgeOptions={{ type: "smoothstep" }}>
              <Background gap={20} /><Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
        {(addPanelOpen || selectedNodeId !== null) && <div className="w-[360px] shrink-0 space-y-4 overflow-y-auto border-l p-4">
          {addPanelOpen ? <AddStepPanel onAdd={addStep} onClose={() => setAddPanelOpen(false)} /> : selectedNodeId === TRIGGER_ID
            ? <AutomationSettings nome={nome} setNome={setNome} descricao={descricao} setDescricao={setDescricao} value={selectedAudienceValue} segmentType={segmentType} setSegmentType={setSegmentType} setSegmentId={setSegmentId} audiences={audienceOptions} requerAprovacao={requerAprovacao} setRequerAprovacao={setRequerAprovacao} ativo={ativo} setAtivo={setAtivo} />
            : selectedStep?.type === "send"
              ? <SendStepPanel step={selectedStep} approved={approved} onChange={(patch) => updateStep(selectedStep.id, patch)} onDelete={() => removeStepById(selectedStep.id)} />
              : selectedStep?.type === "decision"
                ? <DecisionStepPanel step={selectedStep} audiences={audienceOptions} onChange={(patch) => updateStep(selectedStep.id, patch)} onDelete={() => removeStepById(selectedStep.id)} />
                : null}
        </div>}
      </div>
    </DialogContent>
  </Dialog>;
}

function AddStepPanel({ onAdd, onClose }: { onAdd: (step: AutomationStepSeed) => void; onClose: () => void }) {
  const decisions: Array<{ label: string; condition: DecisionCondition }> = [
    { label: "Fez um novo pedido?", condition: { kind: "novo_pedido" } },
    { label: "Pedido tem status?", condition: { kind: "pedido_status", field: "financial_status", value: FINANCIAL_STATUSES[0]! } },
    { label: "Cliente está em segmento?", condition: { kind: "segmento", segmentType: SEGMENT_TYPES[0]! } },
    { label: "Valor do pedido?", condition: { kind: "valor_pedido", operator: "gt", value: 100 } },
    { label: "Cidade ou estado?", condition: { kind: "localizacao", field: "city", value: "" } },
    { label: "Tem uma tag?", condition: { kind: "tag", value: "" } },
  ];
  return <><div className="flex items-center justify-between"><p className="text-sm font-semibold">Adicionar etapa</p><Button size="icon" variant="ghost" className="size-7" onClick={onClose}><Plus className="size-4 rotate-45" /></Button></div>
    <button type="button" className="w-full rounded-lg border p-3 text-left hover:border-primary" onClick={() => onAdd(newSendStep())}><p className="text-sm font-medium"><MessageCircle className="mr-1 inline size-3.5" />Enviar WhatsApp</p></button>
    <p className="text-xs font-semibold uppercase text-muted-foreground">Decisões</p>
    {decisions.map((item) => <button key={item.label} type="button" className="w-full rounded-lg border p-3 text-left hover:border-primary" onClick={() => onAdd(newDecisionStep(item.condition))}><GitBranch className="mr-1 inline size-3.5" />{item.label}</button>)}</>;
}

function AudienceSelect({ value, onChange, audiences }: { value: string; onChange: (value: string, segmentId?: string) => void; audiences: { customSegments: CustomSegment[]; campaignAudiences: AudienceOption[] } }) {
  return <Select value={value} onValueChange={(next) => {
    const custom = audiences.customSegments.find((item) => item.id === next);
    onChange(custom ? "custom" : next, custom?.id);
  }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
    {SEGMENT_TYPES.map((segment) => <SelectItem key={segment} value={segment}>{SEGMENT_LABEL[segment]}</SelectItem>)}
    {audiences.customSegments.length > 0 && audiences.customSegments.map((segment) => <SelectItem key={segment.id} value={segment.id}>{segment.nome}</SelectItem>)}
    {audiences.campaignAudiences.length > 0 && audiences.campaignAudiences.map((campaign) => <SelectItem key={campaign.value} value={campaign.value}>Recebeu: {campaign.nome} ({campaign.recipients})</SelectItem>)}
  </SelectContent></Select>;
}

function AutomationSettings(props: any) {
  return <><p className="text-sm font-semibold">Configurações da automação</p>
    <div className="space-y-1"><Label>Nome</Label><Input value={props.nome} onChange={(e) => props.setNome(e.target.value)} /></div>
    <div className="space-y-1"><Label>Descrição</Label><Textarea rows={2} value={props.descricao} onChange={(e) => props.setDescricao(e.target.value)} /></div>
    <div className="space-y-1"><Label>Gatilho: segmento / público</Label><AudienceSelect value={props.value} audiences={props.audiences} onChange={(type, id) => { props.setSegmentType(type); props.setSegmentId(id); }} /><p className="text-[11px] text-muted-foreground">Também aparecem campanhas que já tiveram mensagens enviadas.</p></div>
    <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Exigir aprovação</p><p className="text-xs text-muted-foreground">Aprovar cada nova leva antes de enfileirar.</p></div><Switch checked={props.requerAprovacao} onCheckedChange={props.setRequerAprovacao} /></div>
    <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Automação ativa</p><p className="text-xs text-muted-foreground">Pausada, não matricula nem processa ninguém.</p></div><Switch checked={props.ativo} onCheckedChange={props.setAtivo} /></div></>;
}

function SendStepPanel({ step, approved, onChange, onDelete }: { step: SendStepSeed; approved: TemplateOption[]; onChange: (patch: Partial<SendStepSeed>) => void; onDelete: () => void }) {
  const [activeVariable, setActiveVariable] = useState(0);
  const template = approved.find((item) => item.name === step.templateName);
  const variables = extractWhatsappBodyVariables(template?.components);
  return <><div className="flex items-center justify-between"><p className="text-sm font-semibold"><MessageCircle className="mr-1 inline size-3.5" />Enviar WhatsApp</p><Button size="icon" variant="ghost" className="size-7 text-critical" onClick={onDelete}><Trash2 className="size-3.5" /></Button></div>
    <div className="space-y-1"><Label>Esperar antes de enviar (horas)</Label><Input type="number" min={0} max={720} value={step.waitHours} onChange={(e) => onChange({ waitHours: Number(e.target.value) || 0 })} /></div>
    <div className="space-y-1"><Label>Tipo</Label><Select value={step.messageType} onValueChange={(value) => onChange({ messageType: value as "marketing" | "utility" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="marketing">Marketing</SelectItem><SelectItem value="utility">Utilidade</SelectItem></SelectContent></Select></div>
    <div className="space-y-1"><Label>Template aprovado</Label><Select value={step.templateName} onValueChange={(value) => { const selected = approved.find((item) => item.name === value); const vars = extractWhatsappBodyVariables(selected?.components); onChange({ templateName: value, templateLanguage: selected?.language, bodyParams: vars.map((variable) => suggestedWhatsappDynamicToken(variable.key) ?? "") }); setActiveVariable(0); }}><SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger><SelectContent>{approved.map((item) => <SelectItem key={`${item.name}-${item.language}`} value={item.name}>{item.name} ({item.language})</SelectItem>)}</SelectContent></Select></div>
    {template && variables.length === 0 && <p className="rounded-lg bg-success/10 p-2 text-xs text-success">Este template não possui variáveis no corpo.</p>}
    {variables.length > 0 && <div className="space-y-3 border-t pt-3"><div><p className="text-xs font-semibold">Variáveis do template ({variables.length})</p><p className="text-[11px] text-muted-foreground">Preencha cada campo ou use um token dinâmico do CRM.</p></div>
      {variables.map((variable, index) => <div key={variable.key} className="space-y-1"><Label className="font-mono text-xs">{variable.label}</Label><Input value={step.bodyParams[index] ?? ""} placeholder={suggestedWhatsappDynamicToken(variable.key) ?? `Valor para ${variable.label}`} onFocus={() => setActiveVariable(index)} onChange={(event) => { const next = [...step.bodyParams]; while (next.length < variables.length) next.push(""); next[index] = event.target.value; onChange({ bodyParams: next }); }} /></div>)}
      <div className="rounded-lg border border-dashed p-2"><p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Inserir na variável selecionada</p><div className="flex flex-wrap gap-1">{DYNAMIC_VARS.map(([token, label]) => <button key={token} type="button" title={label} className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]" onClick={() => onChange({ bodyParams: appendTemplateTokenAtIndex(step.bodyParams, activeVariable, token) })}>{token}</button>)}</div></div>
    </div>}
    <div className="space-y-1"><Label>Cupom Shopify (opcional)</Label><Input value={step.couponCode ?? ""} onChange={(e) => onChange({ couponCode: e.target.value })} /></div></>;
}

function DecisionStepPanel({ step, audiences, onChange, onDelete }: { step: DecisionStepSeed; audiences: { customSegments: CustomSegment[]; campaignAudiences: AudienceOption[] }; onChange: (patch: Partial<DecisionStepSeed>) => void; onDelete: () => void }) {
  const condition = step.condition;
  return <><div className="flex items-center justify-between"><p className="text-sm font-semibold"><GitBranch className="mr-1 inline size-3.5" />Decisão</p><Button size="icon" variant="ghost" className="size-7 text-critical" onClick={onDelete}><Trash2 className="size-3.5" /></Button></div>
    <div className="space-y-1"><Label>Condição</Label><Select value={condition.kind} onValueChange={(value) => {
      const next: DecisionCondition = value === "pedido_status" ? { kind: "pedido_status", field: "financial_status", value: FINANCIAL_STATUSES[0]! } : value === "segmento" ? { kind: "segmento", segmentType: SEGMENT_TYPES[0]! } : value === "valor_pedido" ? { kind: "valor_pedido", operator: "gt", value: 100 } : value === "localizacao" ? { kind: "localizacao", field: "city", value: "" } : value === "tag" ? { kind: "tag", value: "" } : { kind: "novo_pedido" }; onChange({ condition: next });
    }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="novo_pedido">Fez novo pedido</SelectItem><SelectItem value="pedido_status">Pedido tem status</SelectItem><SelectItem value="segmento">Está em segmento/público</SelectItem><SelectItem value="valor_pedido">Valor do pedido</SelectItem><SelectItem value="localizacao">Cidade/estado</SelectItem><SelectItem value="tag">Tem tag</SelectItem></SelectContent></Select></div>
    {condition.kind === "segmento" && <div className="space-y-1"><Label>Segmento / público</Label><AudienceSelect value={condition.segmentId || condition.segmentType} audiences={audiences} onChange={(type, id) => onChange({ condition: { kind: "segmento", segmentType: type, ...(id ? { segmentId: id } : {}) } })} /></div>}
    {condition.kind === "pedido_status" && <><Select value={condition.field} onValueChange={(field) => onChange({ condition: { kind: "pedido_status", field: field as any, value: (field === "fulfillment_status" ? FULFILLMENT_STATUSES : FINANCIAL_STATUSES)[0]! } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="financial_status">Pagamento</SelectItem><SelectItem value="fulfillment_status">Envio</SelectItem></SelectContent></Select><Select value={condition.value} onValueChange={(value) => onChange({ condition: { ...condition, value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(condition.field === "fulfillment_status" ? FULFILLMENT_STATUSES : FINANCIAL_STATUSES).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></>}
    {condition.kind === "valor_pedido" && <div className="grid grid-cols-2 gap-2"><Select value={condition.operator} onValueChange={(operator) => onChange({ condition: { ...condition, operator: operator as any } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gt">Maior que</SelectItem><SelectItem value="gte">Maior ou igual</SelectItem><SelectItem value="lt">Menor que</SelectItem><SelectItem value="lte">Menor ou igual</SelectItem></SelectContent></Select><Input type="number" value={condition.value} onChange={(e) => onChange({ condition: { ...condition, value: Number(e.target.value) || 0 } })} /></div>}
    {condition.kind === "localizacao" && <div className="grid grid-cols-2 gap-2"><Select value={condition.field} onValueChange={(field) => onChange({ condition: { ...condition, field: field as any } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="city">Cidade</SelectItem><SelectItem value="province">Estado</SelectItem></SelectContent></Select><Input value={condition.value} onChange={(e) => onChange({ condition: { ...condition, value: e.target.value } })} /></div>}
    {condition.kind === "tag" && <Input value={condition.value} placeholder="Tag Shopify" onChange={(e) => onChange({ condition: { kind: "tag", value: e.target.value } })} />}
  </>;
}
