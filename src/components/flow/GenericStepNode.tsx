import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNodeData, FlowNodeKind } from "@/lib/flow.server";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STEP_META } from "./stepMeta";
import { DeleteNodeButton } from "./DeleteNodeButton";

interface GenericNodeProps extends NodeProps {
  type: FlowNodeKind;
}

export const GenericStepNode = memo(function GenericStepNode({ data, id, type }: GenericNodeProps) {
  const d = data as FlowNodeData;
  const meta = STEP_META[type] ?? STEP_META.action;
  const Icon = meta.icon;
  const [label, setLabel] = useState(d.label ?? "");
  const [notes, setNotes] = useState(d.notes ?? "");

  function update<K extends keyof FlowNodeData>(key: K, value: FlowNodeData[K]) {
    (data as FlowNodeData)[key] = value;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key, value } }));
  }

  return (
    <div className="w-72 rounded-xl bg-card border shadow-sm overflow-hidden">
      <div
        className="px-4 py-2.5 flex items-center gap-2 border-b"
        style={{ background: meta.headerBg }}
      >
        <div
          className="size-6 rounded-md grid place-items-center shrink-0"
          style={{ background: meta.iconBg, color: meta.iconColor }}
        >
          <Icon className="size-3.5" strokeWidth={2.5} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide">{meta.label}</span>
        <DeleteNodeButton id={id} />
      </div>

      <div className="p-3 space-y-2.5">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Rótulo (opcional)</Label>
          <Input
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              update("label", e.target.value);
            }}
            placeholder={meta.placeholderLabel}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">{meta.notesLabel}</Label>
          <Textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              update("notes", e.target.value);
            }}
            placeholder={meta.placeholderNotes}
            rows={3}
            className="text-sm mt-1 resize-none"
          />
        </div>
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
