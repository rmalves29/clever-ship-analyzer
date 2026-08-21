import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFlowAutomation, updateFlowAutomation } from "@/lib/flow.functions";
import type { FlowCanvasData, FlowCanvasNode, FlowCanvasEdge, FlowNodeData, FlowNodeKind } from "@/lib/flow.server";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TriggerNode } from "@/components/flow/TriggerNode";
import { MessageNode } from "@/components/flow/MessageNode";
import { DelayNode } from "@/components/flow/DelayNode";
import { GenericStepNode } from "@/components/flow/GenericStepNode";
import { ActionNode } from "@/components/flow/ActionNode";
import { ConditionNode } from "@/components/flow/ConditionNode";
import { RandomizerNode } from "@/components/flow/RandomizerNode";
import { SmartDelayNode } from "@/components/flow/SmartDelayNode";
import { AddStepMenu } from "@/components/flow/AddStepMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/flow/$id")({
  component: Editor,
  head: () => ({
    meta: [{ title: "Flow | Editor" }],
  }),
});

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  delay: DelayNode,
  messenger: GenericStepNode,
  sms: GenericStepNode,
  email: GenericStepNode,
  channel: GenericStepNode,
  ai_step: GenericStepNode,
  action: ActionNode,
  condition: ConditionNode,
  randomizer: RandomizerNode,
  smart_delay: SmartDelayNode,
  start_automation: GenericStepNode,
};

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getFlowAutomation);
  const save = useServerFn(updateFlowAutomation);

  const { data: automation, isLoading } = useQuery({
    queryKey: ["flow-automation", id],
    queryFn: () => get({ data: { id } }),
  });

  const [name, setName] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (automation) {
      setName(automation.name);
      setNodes(automation.canvas_data.nodes.map((n) => ({ ...n }) as Node));
      setEdges(automation.canvas_data.edges.map((e) => ({ ...e }) as Edge));
    }
  }, [automation, setNodes, setEdges]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const { id: nodeId, key, value } = (ev as CustomEvent).detail as {
        id: string;
        key: keyof FlowNodeData;
        value: unknown;
      };
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as FlowNodeData), [key]: value } } : n)));
    };
    window.addEventListener("flow-node-update", handler);
    const deleteHandler = (ev: Event) => {
      const { id: nodeId } = (ev as CustomEvent).detail as { id: string };
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
    };
    window.addEventListener("flow-node-delete", deleteHandler);
    return () => {
      window.removeEventListener("flow-node-update", handler);
      window.removeEventListener("flow-node-delete", deleteHandler);
    };
  }, [setNodes, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: `e-${Date.now()}` }, eds)),
    [setEdges],
  );

  function addNode(kind: FlowNodeKind) {
    const nid = `${kind}-${Date.now()}`;
    const last = nodes[nodes.length - 1];
    let data: FlowNodeData = {};
    if (kind === "delay") data = { delayMinutes: 5 };
    else if (kind === "message") data = { text: "", publicReply: "" };
    setNodes((ns) => [
      ...ns,
      {
        id: nid,
        type: kind,
        position: { x: (last?.position.x ?? 0) + 360, y: last?.position.y ?? 100 },
        data,
      } as Node,
    ]);
  }

  const canvasData: FlowCanvasData = useMemo(
    () => ({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as FlowCanvasNode["type"],
        position: n.position,
        data: n.data as FlowNodeData,
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) as FlowCanvasEdge[],
    }),
    [nodes, edges],
  );

  const aggregatedKeywords = useMemo(() => {
    const kws = new Set<string>();
    let anyMatch = false;
    let triggerKind: FlowCanvasNode["data"]["triggerKind"] = "post_or_reel_comment";
    for (const n of nodes) {
      if (n.type === "trigger") {
        const d = n.data as FlowNodeData;
        (d.keywords ?? []).forEach((k) => kws.add(k));
        if (d.matchAny) anyMatch = true;
        if (d.triggerKind) triggerKind = d.triggerKind;
      }
    }
    return { keywords: Array.from(kws), matchAny: anyMatch, triggerKind };
  }, [nodes]);

  const saveMut = useMutation({
    mutationFn: (status?: "draft" | "active") =>
      save({
        data: {
          id,
          name,
          canvas_data: canvasData,
          keywords: aggregatedKeywords.keywords,
          match_any_comment: aggregatedKeywords.matchAny,
          trigger_kind: aggregatedKeywords.triggerKind,
          ...(status ? { status } : {}),
        },
      }),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["flow-automation", id] });
      qc.invalidateQueries({ queryKey: ["flow-automations"] });
      toast.success(status === "active" ? "Publicado!" : "Salvo em rascunho");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="h-16 shrink-0 border-b border-border bg-card px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/flow">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md font-semibold" />
        </div>
        <div className="flex items-center gap-2">
          <AddStepMenu onAdd={addNode} />
          <Button variant="ghost" onClick={() => saveMut.mutate("draft" as never)} disabled={saveMut.isPending} className="gap-2">
            <Save className="size-4" /> Rascunho
          </Button>
          <Button onClick={() => saveMut.mutate("active" as never)} disabled={saveMut.isPending}>
            Publicar
          </Button>
        </div>
      </header>

      <div className="flex-1 bg-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} color="oklch(0.85 0.01 260)" />
          <Controls className="!bg-card !border !border-border !shadow-sm" />
        </ReactFlow>
      </div>
    </div>
  );
}
