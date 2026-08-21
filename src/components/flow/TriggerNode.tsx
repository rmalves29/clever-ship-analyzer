import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, X, Plus } from "lucide-react";
import type { FlowNodeData, FlowTriggerKind } from "@/lib/flow.server";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteNodeButton } from "./DeleteNodeButton";

const triggerLabels: Record<FlowTriggerKind, string> = {
  post_or_reel_comment: "Comentário em post ou Reel",
  story_reply: "Resposta em Story",
  live_comment: "Comentário em live",
  dm_message: "Mensagem no Direct",
};

const ALL_KINDS = Object.keys(triggerLabels) as FlowTriggerKind[];

export const TriggerNode = memo(function TriggerNode({ data, id }: NodeProps) {
  const d = data as FlowNodeData;
  const initialKinds: FlowTriggerKind[] =
    d.triggerKinds && d.triggerKinds.length > 0
      ? d.triggerKinds
      : d.triggerKind
        ? [d.triggerKind]
        : ["post_or_reel_comment"];
  const [keywords, setKeywords] = useState<string[]>(d.keywords ?? []);
  const [matchAny, setMatchAny] = useState(d.matchAny ?? false);
  const [triggerKinds, setTriggerKinds] = useState<FlowTriggerKind[]>(initialKinds);
  const [input, setInput] = useState("");

  function update<K extends keyof FlowNodeData>(key: K, value: FlowNodeData[K]) {
    (data as FlowNodeData)[key] = value;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key, value } }));
  }

  function toggleKind(kind: FlowTriggerKind, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...triggerKinds, kind]))
      : triggerKinds.filter((k) => k !== kind);
    const final = next.length > 0 ? next : [kind];
    setTriggerKinds(final);
    update("triggerKinds", final);
    update("triggerKind", final[0]);
  }

  const allSelected = triggerKinds.length === ALL_KINDS.length;
  function toggleAll(checked: boolean) {
    const final = checked ? [...ALL_KINDS] : [triggerKinds[0] ?? "post_or_reel_comment"];
    setTriggerKinds(final);
    update("triggerKinds", final);
    update("triggerKind", final[0]);
  }

  return (
    <div className="w-72 rounded-xl bg-trigger border border-emerald-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-emerald-200/60">
        <Zap className="size-3.5 text-trigger-foreground" strokeWidth={2.5} />
        <span className="text-xs font-semibold text-trigger-foreground uppercase tracking-wide">Quando…</span>
        <DeleteNodeButton id={id} />
      </div>
      <div className="p-4 space-y-3 bg-card">
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase text-muted-foreground">Gatilhos</Label>
            <button
              type="button"
              onClick={() => toggleAll(!allSelected)}
              className="text-[10px] uppercase text-primary hover:underline"
            >
              {allSelected ? "Limpar" : "Todos"}
            </button>
          </div>
          <div className="mt-2 space-y-1.5 rounded-md border p-2">
            {ALL_KINDS.map((kind) => {
              const checked = triggerKinds.includes(kind);
              return (
                <label
                  key={kind}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleKind(kind, Boolean(v))}
                  />
                  <span>{triggerLabels[kind]}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Qualquer comentário</Label>
          <Switch
            checked={matchAny}
            onCheckedChange={(v) => {
              setMatchAny(v);
              update("matchAny", v);
            }}
          />
        </div>

        {!matchAny && (
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Palavras-chave</Label>
            <div className="flex flex-wrap gap-1 mt-1 mb-2">
              {keywords.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
                >
                  {k}
                  <button
                    onClick={() => {
                      const next = keywords.filter((x) => x !== k);
                      setKeywords(next);
                      update("keywords", next);
                    }}
                    className="hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) {
                    e.preventDefault();
                    const next = [...keywords, input.trim().toUpperCase()];
                    setKeywords(next);
                    update("keywords", next);
                    setInput("");
                  }
                }}
                placeholder="Ex: PREÇO"
                className="h-8 text-xs uppercase"
              />
              <button
                onClick={() => {
                  if (!input.trim()) return;
                  const next = [...keywords, input.trim().toUpperCase()];
                  setKeywords(next);
                  update("keywords", next);
                  setInput("");
                }}
                className="size-8 rounded-md border grid place-items-center hover:bg-muted"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
