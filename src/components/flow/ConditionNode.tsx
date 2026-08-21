import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { GitBranch, Pencil, ChevronRight, Search } from "lucide-react";
import { DeleteNodeButton } from "./DeleteNodeButton";
import {
  CONDITION_CATALOG,
  CONDITION_CATEGORIES,
  getCondition,
  type ConditionCategory,
  type ConditionDef,
} from "./conditionCatalog";

type Value = string | number | boolean;

export const ConditionNode = memo(function ConditionNode({ data, id }: NodeProps) {
  const d = data as FlowNodeData;
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<ConditionCategory>("recommended");
  const [search, setSearch] = useState("");
  const selected = getCondition(d.actionId);
  const config = (d.actionConfig ?? {}) as Record<string, Value>;

  function update<K extends keyof FlowNodeData>(key: K, value: FlowNodeData[K]) {
    (data as FlowNodeData)[key] = value;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key, value } }));
  }

  function pick(c: ConditionDef) {
    update("actionId", c.id);
    update("actionConfig", {});
    setOpen(false);
    setSearch("");
  }

  function setField(key: string, value: Value) {
    update("actionConfig", { ...config, [key]: value });
  }

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CONDITION_CATALOG.filter(
      (c) =>
        c.category === activeCat &&
        (!q || c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)),
    );
  }, [activeCat, search]);

  const grouped = useMemo(() => {
    const out: { group: string | null; items: ConditionDef[] }[] = [];
    for (const c of list) {
      const g = c.group ?? null;
      const bucket = out.find((b) => b.group === g);
      if (bucket) bucket.items.push(c);
      else out.push({ group: g, items: [c] });
    }
    return out;
  }, [list]);

  return (
    <div className="w-80 rounded-xl bg-card border shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b bg-gradient-to-r from-orange-50 to-amber-50">
        <div className="size-6 rounded-md grid place-items-center bg-orange-500 text-white shrink-0">
          <GitBranch className="size-3.5" strokeWidth={2.5} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide">Condição</span>
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
              {selected.description && (
                <div className="text-[10px] text-muted-foreground line-clamp-2">
                  {selected.description}
                </div>
              )}
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0">
                  <Pencil className="size-3.5" />
                </Button>
              </DialogTrigger>
              <PickerDialog
                activeCat={activeCat}
                setActiveCat={setActiveCat}
                grouped={grouped}
                onPick={pick}
                search={search}
                setSearch={setSearch}
              />
            </Dialog>
          </div>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                + Condição
                <ChevronRight className="size-4" />
              </Button>
            </DialogTrigger>
            <PickerDialog
              activeCat={activeCat}
              setActiveCat={setActiveCat}
              grouped={grouped}
              onPick={pick}
              search={search}
              setSearch={setSearch}
            />
          </Dialog>
        )}

        {selected && selected.fields.length > 0 && (
          <div className="space-y-2.5">
            {selected.fields.map((f) => {
              const val = config[f.key];
              if (f.type === "select") {
                return (
                  <div key={f.key}>
                    <Label className="text-[10px] uppercase text-muted-foreground">{f.label}</Label>
                    <Select value={(val as string) ?? ""} onValueChange={(v) => setField(f.key, v)}>
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
                    <Switch checked={Boolean(val)} onCheckedChange={(v) => setField(f.key, v)} />
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

        {selected && (
          <div className="pt-1 grid grid-cols-2 gap-2 text-[10px] font-semibold">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-center py-1">
              Então
            </div>
            <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-center py-1">
              Senão
            </div>
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle
        type="source"
        id="then"
        position={Position.Right}
        style={{ top: "70%", background: "#10b981" }}
      />
      <Handle
        type="source"
        id="else"
        position={Position.Right}
        style={{ top: "88%", background: "#f43f5e" }}
      />
    </div>
  );
});

function PickerDialog({
  activeCat,
  setActiveCat,
  grouped,
  onPick,
  search,
  setSearch,
}: {
  activeCat: ConditionCategory;
  setActiveCat: (c: ConditionCategory) => void;
  grouped: { group: string | null; items: ConditionDef[] }[];
  onPick: (c: ConditionDef) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  return (
    <DialogContent className="max-w-3xl p-0 overflow-hidden">
      <DialogHeader className="px-6 pt-6 pb-2">
        <DialogTitle>Selecione uma condição</DialogTitle>
      </DialogHeader>
      <div className="px-6 pb-3">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="pl-9"
          />
        </div>
      </div>
      <div className="grid grid-cols-[220px_1fr] h-[520px] border-t">
        <aside className="border-r bg-muted/20 py-2">
          {CONDITION_CATEGORIES.map((c) => (
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
          <div className="p-4 space-y-3">
            {grouped.map((g, gi) => (
              <div key={g.group ?? `g-${gi}`} className="space-y-1">
                {g.group && (
                  <div className="text-[11px] font-semibold uppercase text-muted-foreground px-1 pt-2">
                    {g.group}
                  </div>
                )}
                {g.items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onPick(c)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/50 text-left transition-colors"
                  >
                    <div
                      className="size-7 grid place-items-center shrink-0"
                      style={{ color: c.iconColor ?? "#6b7280" }}
                    >
                      <c.icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{c.label}</div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {c.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {grouped.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhuma condição encontrada
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </DialogContent>
  );
}
