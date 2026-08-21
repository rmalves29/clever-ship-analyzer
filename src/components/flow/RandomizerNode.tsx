import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shuffle, Plus, X } from "lucide-react";
import { DeleteNodeButton } from "./DeleteNodeButton";

const COLORS = ["#8b5cf6", "#ea580c", "#0891b2", "#db2777", "#16a34a", "#eab308"];
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export const RandomizerNode = memo(function RandomizerNode({ data, id }: NodeProps) {
  const d = data as FlowNodeData;
  const initial = useMemo(() => {
    const w = d.randomWeights;
    if (w && w.length >= 2) return w;
    return [50, 50];
  }, [d.randomWeights]);
  const [weights, setWeights] = useState<number[]>(initial);
  const [each, setEach] = useState<boolean>(Boolean(d.randomEachTime));

  function push<K extends keyof FlowNodeData>(key: K, value: FlowNodeData[K]) {
    (data as FlowNodeData)[key] = value;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key, value } }));
  }

  function setWeight(idx: number, value: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    const others = weights.length - 1;
    if (others === 0) return;
    const remaining = 100 - clamped;
    const oldOthersTotal = weights.reduce((s, v, i) => (i === idx ? s : s + v), 0);
    const next = weights.map((v, i) => {
      if (i === idx) return clamped;
      if (oldOthersTotal <= 0) return Math.round(remaining / others);
      return Math.round((v / oldOthersTotal) * remaining);
    });
    const drift = 100 - next.reduce((s, v) => s + v, 0);
    if (drift !== 0) {
      const target = next.findIndex((_, i) => i !== idx);
      if (target >= 0) next[target]! += drift;
    }
    setWeights(next);
    push("randomWeights", next);
  }

  function addBranch() {
    if (weights.length >= 6) return;
    const share = Math.floor(100 / (weights.length + 1));
    const next: number[] = Array(weights.length + 1).fill(share);
    next[0]! += 100 - share * next.length;
    setWeights(next);
    push("randomWeights", next);
  }

  function removeBranch(idx: number) {
    if (weights.length <= 2) return;
    const next = weights.filter((_, i) => i !== idx);
    const total = next.reduce((s, v) => s + v, 0) || 1;
    const norm = next.map((v) => Math.round((v / total) * 100));
    const drift = 100 - norm.reduce((s, v) => s + v, 0);
    if (drift !== 0) norm[0]! += drift;
    setWeights(norm);
    push("randomWeights", norm);
  }

  function toggleEach(v: boolean) {
    setEach(v);
    push("randomEachTime", v);
  }

  return (
    <div className="w-80 rounded-xl bg-card border shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b bg-gradient-to-r from-violet-50 to-fuchsia-50">
        <div className="size-6 rounded-md grid place-items-center bg-violet-500 text-white shrink-0">
          <Shuffle className="size-3.5" strokeWidth={2.5} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide">Randomizador</span>
        <DeleteNodeButton id={id} />
      </div>

      <div className="p-3 space-y-3">
        <div className="flex items-start gap-2 rounded-md border p-2">
          <Switch checked={each} onCheckedChange={toggleEach} className="mt-0.5" />
          <Label className="text-xs leading-snug cursor-pointer" onClick={() => toggleEach(!each)}>
            Selecione uma opção aleatória a cada vez
          </Label>
        </div>

        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-muted-foreground">Tráfego atribuído</span>
          <span className="font-semibold">{weights.reduce((s, v) => s + v, 0)}%</span>
        </div>

        <div className="space-y-3">
          {weights.map((w, i) => {
            const color = COLORS[i % COLORS.length];
            const letter = LETTERS[i] ?? String(i + 1);
            return (
              <div key={i} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold w-4" style={{ color }}>
                    {letter}
                  </span>
                  <Slider
                    value={[w]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => setWeight(i, v[0] ?? 0)}
                    className="flex-1"
                    style={{ ["--primary" as string]: color }}
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={w}
                      onChange={(e) => setWeight(i, Number(e.target.value))}
                      className="h-7 w-14 text-xs text-center"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {weights.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeBranch(i)}
                      className="size-5 grid place-items-center rounded hover:bg-muted text-muted-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {weights.length < 6 && (
          <Button variant="outline" size="sm" className="w-full" onClick={addBranch}>
            <Plus className="size-3.5 mr-1" /> Adicionar caminho
          </Button>
        )}
      </div>

      <Handle type="target" position={Position.Left} />
      {weights.map((_, i) => {
        const total = weights.length;
        const top = ((i + 1) / (total + 1)) * 100;
        return (
          <Handle
            key={i}
            type="source"
            id={LETTERS[i]?.toLowerCase() ?? `p${i}`}
            position={Position.Right}
            style={{ top: `${top}%`, background: COLORS[i % COLORS.length] }}
          />
        );
      })}
    </div>
  );
});
