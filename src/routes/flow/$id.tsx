import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFlowAutomation, updateFlowAutomation, getFlowNodeStats } from "@/lib/flow.functions";
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
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { createLink } from "@tanstack/react-router";

const LinkIconButton = createLink(IconButton);

export const Route = createFileRoute("/flow/$id")({
  component: Editor,
  head: () => ({
    meta: [{ title: "ManyChat | Editor" }],
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
  const getStatsFn = useServerFn(getFlowNodeStats);

  const { data: automation, isLoading } = useQuery({
    queryKey: ["flow-automation", id],
    queryFn: () => get({ data: { id } }),
  });

  const { data: stats } = useQuery({
    queryKey: ["flow-node-stats", id],
    queryFn: () => getStatsFn({ data: { automationId: id } }),
    refetchInterval: 5000,
  });

  const [name, setName] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (automation) {
      setName(automation.name);
      setNodes(automation.canvas_data.nodes.map((n) => {
        const nodeStats = stats?.find((s: any) => s.node_id === n.id);
        return { 
          ...n, 
          data: { 
            ...n.data, 
            stats: nodeStats || { sent_count: 0, delivered_count: 0, opened_count: 0, clicked_count: 0 } 
          } 
        };
      }) as Node[]);
      setEdges(automation.canvas_data.edges.map((e) => ({ ...e }) as Edge));
    }
  }, [automation, stats, setNodes, setEdges]);

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
    const kinds = new Set<NonNullable<FlowNodeData["triggerKind"]>>();
    let anyMatch = false;
    let triggerKind: FlowCanvasNode["data"]["triggerKind"] = "post_or_reel_comment";
    for (const n of nodes) {
      if (n.type === "trigger") {
        const d = n.data as FlowNodeData;
        (d.keywords ?? []).forEach((k) => kws.add(k));
        if (d.matchAny) anyMatch = true;
        if (d.triggerKind) triggerKind = d.triggerKind;
        (d.triggerKinds && d.triggerKinds.length > 0 ? d.triggerKinds : d.triggerKind ? [d.triggerKind] : []).forEach((k) =>
          kinds.add(k),
        );
      }
    }
    return { keywords: Array.from(kws), matchAny: anyMatch, triggerKind, triggerKinds: Array.from(kinds) };
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
          trigger_kinds: aggregatedKeywords.triggerKinds,
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
    return <Typography variant="body2" color="text.secondary" sx={{ p: 4 }}>Carregando…</Typography>;
  }

  return (
    <Box sx={{ display: "flex", height: "100vh", flexDirection: "column", overflow: "hidden" }}>
      <Stack
        component="header"
        direction="row"
        sx={{ height: 64, flexShrink: 0, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper", px: 3, alignItems: "center", justifyContent: "space-between", gap: 2 }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1, minWidth: 0 }}>
          <LinkIconButton to="/flow">
            <ArrowLeft size={16} />
          </LinkIconButton>
          <TextField value={name} onChange={(e) => setName(e.target.value)} size="small" sx={{ maxWidth: 400, "& .MuiInputBase-input": { fontWeight: 600 } }} />
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <AddStepMenu onAdd={addNode} />
          <Button variant="text" startIcon={<Save size={16} />} onClick={() => saveMut.mutate("draft" as never)} disabled={saveMut.isPending}>
            Rascunho
          </Button>
          <Button variant="contained" onClick={() => saveMut.mutate("active" as never)} disabled={saveMut.isPending}>
            Publicar
          </Button>
        </Stack>
      </Stack>

      <Box className="bg-canvas" sx={{ flex: 1 }}>
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
      </Box>
    </Box>
  );
}
