import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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
    <Stack spacing={1} sx={{ border: "1px solid", borderColor: "divider", bgcolor: "action.hover", borderRadius: 2, p: 1.5 }}>
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>Política de reentrada</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Define quando o mesmo cliente pode iniciar uma nova jornada.</Typography>
      </Box>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <TextField
          select
          size="small"
          disabled={busy}
          value={mode}
          onChange={(e) => {
            const next = e.target.value as AutomationReentryMode;
            setMode(next);
            void persist(next);
          }}
          sx={{ minWidth: 190, flex: 1 }}
        >
          {Object.entries(LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </TextField>
        {mode === "after_days" && (
          <TextField
            size="small"
            disabled={busy}
            type="number"
            slotProps={{ htmlInput: { min: 1, max: 3650 } }}
            value={days}
            onChange={(event) => setDays(Math.max(1, Number(event.target.value) || 1))}
            onBlur={() => void persist("after_days", days)}
            aria-label="Dias para reentrada"
            sx={{ width: 96 }}
          />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
        Uma nova jornada nunca é criada enquanto já existir outra execução ativa para esse cliente.
      </Typography>
    </Stack>
  );
}
