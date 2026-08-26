import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAutomationReentry, updateAutomationReentry } from "@/lib/whatsapp-automation-reentry.functions";
import type { AutomationReentryMode } from "@/lib/whatsapp-automation-reentry";

const LABELS: Record<AutomationReentryMode, string> = {
  once: "Apenas uma vez",
  per_order: "Uma vez por pedido",
  per_checkout: "Uma vez por checkout",
  after_days: "Novamente após X dias",
};

export function AutomationReentryControl({ automationId }: { automationId: string }) {
  const save = useServerFn(updateAutomationReentry);
  const { data, refetch } = useQuery({
    queryKey: ["whatsapp-automation-reentry", automationId],
    queryFn: () => getAutomationReentry({ data: { id: automationId } }),
  });
  const [mode, setMode] = useState<AutomationReentryMode>("once");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data?.success) return;
    setMode(data.reentryMode as AutomationReentryMode);
    setDays(Number(data.reentryAfterDays ?? 30));
  }, [data]);

  const persist = async (nextMode: AutomationReentryMode, nextDays = days) => {
    setBusy(true);
    try {
      const result = await save({
        data: {
          id: automationId,
          reentryMode: nextMode,
          ...(nextMode === "after_days" ? { reentryAfterDays: Math.max(1, nextDays) } : {}),
        },
      });
      if (!result.success) toast.error(result.error);
      else {
        toast.success("Política de reentrada atualizada.");
        refetch();
      }
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao atualizar a reentrada.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <div>
        <p className="text-xs font-semibold">Política de reentrada</p>
        <p className="text-[11px] text-muted-foreground">Define quando o mesmo cliente pode iniciar uma nova jornada.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select
          disabled={busy}
          value={mode}
          onValueChange={(value) => {
            const next = value as AutomationReentryMode;
            setMode(next);
            void persist(next);
          }}
        >
          <SelectTrigger className="h-8 min-w-[190px] flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode === "after_days" && (
          <Input
            disabled={busy}
            className="h-8 w-24"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(event) => setDays(Math.max(1, Number(event.target.value) || 1))}
            onBlur={() => void persist("after_days", days)}
            aria-label="Dias para reentrada"
          />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Uma nova jornada nunca é criada enquanto já existir outra execução ativa para esse cliente.
      </p>
    </div>
  );
}
