import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import type { FlowNodeData } from "@/lib/flow.server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteNodeButton } from "./DeleteNodeButton";

export const DelayNode = memo(function DelayNode({ data, id }: NodeProps) {
  const d = data as FlowNodeData;
  const [minutes, setMinutes] = useState(d.delayMinutes ?? 5);

  function update(v: number) {
    (data as FlowNodeData).delayMinutes = v;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key: "delayMinutes", value: v } }));
  }

  return (
    <div className="w-56 rounded-xl bg-delay border border-orange-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-orange-200/60">
        <Clock className="size-3.5 text-delay-foreground" strokeWidth={2.5} />
        <span className="text-xs font-semibold text-delay-foreground uppercase tracking-wide">Atraso</span>
        <DeleteNodeButton id={id} />
      </div>
      <div className="p-4 bg-card">
        <Label className="text-[10px] uppercase text-muted-foreground">Aguardar (minutos)</Label>
        <Input
          type="number"
          min={0}
          max={1440}
          value={minutes}
          onChange={(e) => {
            const v = Math.max(0, Math.min(1440, Number(e.target.value) || 0));
            setMinutes(v);
            update(v);
          }}
          className="h-8 mt-1 text-sm"
        />
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
