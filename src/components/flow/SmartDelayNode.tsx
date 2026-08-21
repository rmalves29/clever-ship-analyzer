import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/flow.server";
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
import { Clock } from "lucide-react";
import { DeleteNodeButton } from "./DeleteNodeButton";

type Unit = "minutes" | "hours" | "days";
type Mode = "duration" | "date";

const UNIT_LABEL: Record<Unit, { one: string; many: string }> = {
  minutes: { one: "Minuto", many: "Minutos" },
  hours: { one: "Hora", many: "Horas" },
  days: { one: "Dia", many: "Dias" },
};

const MAX_BY_UNIT: Record<Unit, number> = {
  minutes: 60 * 24 * 365,
  hours: 24 * 365,
  days: 365,
};

export const SmartDelayNode = memo(function SmartDelayNode({ data, id }: NodeProps) {
  const d = data as FlowNodeData;
  const [mode, setMode] = useState<Mode>(d.delayMode ?? "duration");
  const [unit, setUnit] = useState<Unit>(d.delayUnit ?? "hours");
  const [amount, setAmount] = useState<number>(d.delayAmount ?? 1);
  const [useWindow, setUseWindow] = useState<boolean>(Boolean(d.delayUseWindow));
  const [winStart, setWinStart] = useState<string>(d.delayWindowStart ?? "09:00");
  const [winEnd, setWinEnd] = useState<string>(d.delayWindowEnd ?? "18:00");
  const [date, setDate] = useState<string>(d.delayDate ?? "");

  function push<K extends keyof FlowNodeData>(key: K, value: FlowNodeData[K]) {
    (data as FlowNodeData)[key] = value;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key, value } }));
  }

  function changeMode(m: Mode) {
    setMode(m);
    push("delayMode", m);
  }

  function changeAmount(v: number) {
    const max = MAX_BY_UNIT[unit];
    const clamped = Math.max(0, Math.min(max, Math.round(v || 0)));
    setAmount(clamped);
    push("delayAmount", clamped);
    const minutes =
      unit === "minutes" ? clamped : unit === "hours" ? clamped * 60 : clamped * 60 * 24;
    push("delayMinutes", minutes);
  }

  function changeUnit(u: Unit) {
    setUnit(u);
    push("delayUnit", u);
    const minutes = u === "minutes" ? amount : u === "hours" ? amount * 60 : amount * 60 * 24;
    push("delayMinutes", minutes);
  }

  const unitLabel = amount === 1 ? UNIT_LABEL[unit].one : UNIT_LABEL[unit].many;

  return (
    <div className="w-80 rounded-xl bg-card border shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b bg-gradient-to-r from-orange-100 to-rose-100">
        <div className="size-6 rounded-md grid place-items-center bg-orange-500 text-white shrink-0">
          <Clock className="size-3.5" strokeWidth={2.5} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide">Atraso Inteligente</span>
        <DeleteNodeButton id={id} />
      </div>

      <div className="p-3 space-y-3">
        <div className="inline-flex rounded-full border p-0.5 bg-muted/40 text-xs">
          {(["duration", "date"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`px-3 py-1 rounded-full transition-colors ${
                mode === m ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"
              }`}
            >
              {m === "duration" ? "Duração" : "Data"}
            </button>
          ))}
        </div>

        {mode === "duration" ? (
          <>
            <div>
              <Label className="text-[11px] text-muted-foreground">Aguardar por</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  min={0}
                  max={MAX_BY_UNIT[unit]}
                  value={amount}
                  onChange={(e) => changeAmount(Number(e.target.value))}
                  className="h-8 text-sm flex-1"
                />
                <Select value={unit} onValueChange={(v) => changeUnit(v as Unit)}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutos</SelectItem>
                    <SelectItem value="hours">Horas</SelectItem>
                    <SelectItem value="days">Dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Insira um número. Limite de 365 dias.
              </p>
            </div>

            <div className="rounded-md border p-2 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Label
                  className="text-xs cursor-pointer leading-snug"
                  onClick={() => {
                    const v = !useWindow;
                    setUseWindow(v);
                    push("delayUseWindow", v);
                  }}
                >
                  Enviar durante um período determinado
                </Label>
                <Switch
                  checked={useWindow}
                  onCheckedChange={(v) => {
                    setUseWindow(v);
                    push("delayUseWindow", v);
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                A mensagem será enviada quando o horário local do contato estiver dentro do
                período definido.
              </p>
              {useWindow && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="time"
                    value={winStart}
                    onChange={(e) => {
                      setWinStart(e.target.value);
                      push("delayWindowStart", e.target.value);
                    }}
                    className="h-8 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input
                    type="time"
                    value={winEnd}
                    onChange={(e) => {
                      setWinEnd(e.target.value);
                      push("delayWindowEnd", e.target.value);
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="rounded-md bg-muted/30 border text-xs px-3 py-2 leading-relaxed">
              Aguarde <strong>{amount} {unitLabel}</strong> e continue
              {useWindow ? (
                <>
                  {" "}
                  entre <strong>{winStart}</strong> e <strong>{winEnd}</strong>
                </>
              ) : null}
              .
            </div>
          </>
        ) : (
          <>
            <div>
              <Label className="text-[11px] text-muted-foreground">Enviar em</Label>
              <Input
                type="datetime-local"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  push("delayDate", e.target.value);
                }}
                className="h-8 text-sm mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                O fluxo continuará na data e hora escolhidas (fuso do contato).
              </p>
            </div>
            <div className="rounded-md bg-muted/30 border text-xs px-3 py-2">
              {date ? (
                <>
                  Aguardar até <strong>{new Date(date).toLocaleString("pt-BR")}</strong>
                </>
              ) : (
                <span className="text-muted-foreground">Escolha uma data para continuar</span>
              )}
            </div>
          </>
        )}
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
