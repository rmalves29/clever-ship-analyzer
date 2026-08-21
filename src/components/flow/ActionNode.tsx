import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, Pencil, ChevronRight } from "lucide-react";
import { DeleteNodeButton } from "./DeleteNodeButton";
import {
  ACTION_CATALOG,
  ACTION_CATEGORIES,
  getAction,
  type ActionCategory,
  type ActionDef,
} from "./actionCatalog";

type ActionValue = string | number | boolean;

export const ActionNode = memo(function ActionNode({ data, id }: NodeProps) {
  const d = data as FlowNodeData;
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<ActionCategory>("contact");
  const selected = getAction(d.actionId);

  const config = (d.actionConfig ?? {}) as Record<string, ActionValue>;

  function update<K extends keyof FlowNodeData>(key: K, value: FlowNodeData[K]) {
    (data as FlowNodeData)[key] = value;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key, value } }));
  }

  function pick(a: ActionDef) {
    update("actionId", a.id);
    update("actionConfig", {});
    setOpen(false);
  }

  function setField(key: string, value: ActionValue) {
    const next = { ...config, [key]: value };
    update("actionConfig", next);
  }

  const list = useMemo(
    () => ACTION_CATALOG.filter((a) => a.category === activeCat),
    [activeCat],
  );

  return (
    <div className="w-80 rounded-xl bg-card border shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b bg-gradient-to-r from-yellow-50 to-amber-50">
        <div className="size-6 rounded-md grid place-items-center bg-yellow-500 text-white shrink-0">
          <Zap className="size-3.5" strokeWidth={2.5} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide">Ação</span>
        <DeleteNodeButton id={id} />
      </div>

      <div className="p-3 space-y-3">
        {selected ? (
          <div className="rounded-lg border bg-muted/30 p-2.5 flex items-start gap-2.5">
            <div
              className="size-8 rounded-md grid place-items-center shrink-0 bg-background border"
              style={{ color: selected.iconColor ?? "#6b7280" }}
            >
              <selected.icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{selected.label}</div>
              <div className="text-[10px] text-muted-foreground line-clamp-2">
                {selected.description}
              </div>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0">
                  <Pencil className="size-3.5" />
                </Button>
              </DialogTrigger>
              <ActionPickerDialog activeCat={activeCat} setActiveCat={setActiveCat} list={list} onPick={pick} />
            </Dialog>
          </div>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                Selecionar ação
                <ChevronRight className="size-4" />
              </Button>
            </DialogTrigger>
            <ActionPickerDialog activeCat={activeCat} setActiveCat={setActiveCat} list={list} onPick={pick} />
          </Dialog>
        )}

        {selected && selected.fields.length > 0 && (
          <div className="space-y-2.5">
            {selected.fields.map((f) => {
              const val = config[f.key];
              if (f.type === "textarea") {
                return (
                  <div key={f.key}>
                    <Label className="text-[10px] uppercase text-muted-foreground">{f.label}</Label>
                    <Textarea
                      value={(val as string) ?? ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                      className="text-sm mt-1 resize-none"
                    />
                  </div>
                );
              }
              if (f.type === "select") {
                return (
                  <div key={f.key}>
                    <Label className="text-[10px] uppercase text-muted-foreground">{f.label}</Label>
                    <Select
                      value={(val as string) ?? ""}
                      onValueChange={(v) => setField(f.key, v)}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options?.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              if (f.type === "boolean") {
                return (
                  <div key={f.key} className="flex items-center justify-between rounded-md border p-2">
                    <Label className="text-xs">{f.label}</Label>
                    <Switch
                      checked={Boolean(val)}
                      onCheckedChange={(v) => setField(f.key, v)}
                    />
                  </div>
                );
              }
              if (f.type === "number") {
                return (
                  <div key={f.key}>
                    <Label className="text-[10px] uppercase text-muted-foreground">{f.label}</Label>
                    <Input
                      type="number"
                      value={val === undefined ? "" : String(val)}
                      onChange={(e) => setField(f.key, Number(e.target.value))}
                      placeholder={f.placeholder}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                );
              }
              return (
                <div key={f.key}>
                  <Label className="text-[10px] uppercase text-muted-foreground">{f.label}</Label>
                  <Input
                    value={(val as string) ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

function ActionPickerDialog({
  activeCat,
  setActiveCat,
  list,
  onPick,
}: {
  activeCat: ActionCategory;
  setActiveCat: (c: ActionCategory) => void;
  list: ActionDef[];
  onPick: (a: ActionDef) => void;
}) {
  return (
    <DialogContent className="max-w-3xl p-0 overflow-hidden">
      <DialogHeader className="px-6 pt-6 pb-2">
        <DialogTitle>Realize as seguintes ações…</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-[220px_1fr] h-[520px] border-t">
        <aside className="border-r bg-muted/20 py-2">
          {ACTION_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCat(c.id)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                activeCat === c.id
                  ? "bg-background font-semibold border-l-2 border-primary"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {c.label}
            </button>
          ))}
        </aside>
        <ScrollArea className="h-full">
          <div className="p-4 space-y-2">
            <div className="mb-2">
              <div className="text-sm font-semibold">
                {ACTION_CATEGORIES.find((c) => c.id === activeCat)?.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {ACTION_CATEGORIES.find((c) => c.id === activeCat)?.description}
              </div>
            </div>
            {list.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onPick(a)}
                className="w-full flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 text-left transition-colors"
              >
                <div
                  className="size-9 rounded-md grid place-items-center shrink-0 border bg-background"
                  style={{ color: a.iconColor ?? "#6b7280" }}
                >
                  <a.icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.description}</div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </DialogContent>
  );
}
