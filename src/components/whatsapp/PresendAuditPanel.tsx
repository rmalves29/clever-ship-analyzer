import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getSegmentsList } from "@/lib/crm-segmentation.functions";
import { previewWhatsappPresendAudit } from "@/lib/whatsapp-presend-audit.functions";

export function PresendAuditPanel() {
  const [segmentValue, setSegmentValue] = useState("sem_recompra");
  const [messageType, setMessageType] = useState<"marketing" | "utility">("marketing");
  const runAudit = useServerFn(previewWhatsappPresendAudit);

  const { data: segments } = useQuery({
    queryKey: ["crm-segments-presend-audit"],
    queryFn: () => getSegmentsList(),
  });
  const customSegments = (segments ?? []).map((segment) => ({ id: segment.id, nome: segment.nome }));
  const selectedCustom = customSegments.find((segment) => segment.id === segmentValue);

  const request = useMemo(
    () => ({
      segmentType: selectedCustom ? "custom" : segmentValue,
      ...(selectedCustom ? { segmentId: selectedCustom.id } : {}),
      messageType,
    }),
    [messageType, segmentValue, selectedCustom],
  );

  const { data: audit, isLoading, isError } = useQuery({
    queryKey: ["whatsapp-presend-audit", request.segmentType, request.segmentId ?? null, messageType],
    queryFn: () => runAudit({ data: request }),
  });

  const exclusions = audit
    ? audit.invalidPhone + audit.duplicatePhones + (messageType === "marketing" ? audit.marketingOptOuts : 0)
    : 0;

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <ShieldCheck size={16} />
            <Typography sx={{ fontWeight: 600 }}>Auditoria pré-envio</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Simula o público final sem criar campanha, sem enfileirar e sem chamar a API da Meta.
          </Typography>
        </Box>
        {audit && (
          <Chip
            color={audit.eligibleRecipients > 0 ? "success" : "warning"}
            label={audit.eligibleRecipients > 0 ? "Público pronto" : "Sem destinatários elegíveis"}
          />
        )}
      </Stack>

      <Box sx={{ mt: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        <TextField select label="Público" value={segmentValue} onChange={(e) => setSegmentValue(e.target.value)} fullWidth>
          <MenuItem value="sem_recompra">Sem recompra</MenuItem>
          <MenuItem value="recorrencia">Recorrência</MenuItem>
          <MenuItem value="recompra_30d">Recompra 30d</MenuItem>
          <MenuItem value="recompra_60d">Recompra 60d</MenuItem>
          <MenuItem value="carrinho">Carrinho abandonado</MenuItem>
          {customSegments.map((segment) => (
            <MenuItem key={segment.id} value={segment.id}>{segment.nome}</MenuItem>
          ))}
        </TextField>
        <TextField select label="Tipo da mensagem" value={messageType} onChange={(e) => setMessageType(e.target.value as "marketing" | "utility")} fullWidth>
          <MenuItem value="marketing">Marketing</MenuItem>
          <MenuItem value="utility">Utilidade</MenuItem>
        </TextField>
      </Box>

      {isLoading && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Auditando público...</Typography>}
      {isError && <Typography variant="body2" color="error" sx={{ mt: 2 }}>Não foi possível concluir a auditoria.</Typography>}

      {audit && (
        <>
          <Box sx={{ mt: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", xl: "repeat(6, 1fr)" } }}>
            <Metric label="No segmento" value={audit.clientes} />
            <Metric label="Com telefone" value={audit.comTelefone} />
            <Metric label="Telefone inválido/ausente" value={audit.invalidPhone} warning={audit.invalidPhone > 0} />
            <Metric label="Telefones duplicados" value={audit.duplicatePhones} warning={audit.duplicatePhones > 0} />
            <Metric
              label={messageType === "marketing" ? "Opt-outs marketing" : "Opt-outs não bloqueiam utility"}
              value={audit.marketingOptOuts}
              warning={messageType === "marketing" && audit.marketingOptOuts > 0}
            />
            <Metric label="Elegíveis finais" value={audit.eligibleRecipients} success />
          </Box>

          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "flex-start", border: "1px solid", borderColor: "divider", bgcolor: "action.hover", borderRadius: 3, p: 1.5 }}>
            {exclusions > 0 ? <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} /> : <CheckCircle2 size={16} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-success-main, #28C76F)" />}
            <Typography variant="caption" color="text.secondary">
              {messageType === "marketing"
                ? `${exclusions} registro(s) serão excluídos antes/do processamento por telefone inválido, duplicidade ou opt-out de marketing.`
                : `${exclusions} registro(s) serão excluídos por telefone inválido ou duplicidade. Opt-out de marketing não bloqueia mensagens de utilidade.`}
            </Typography>
          </Stack>
        </>
      )}
    </Box>
  );
}

function Metric({ label, value, warning, success }: { label: string; value: number; warning?: boolean; success?: boolean }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{label}</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5 }}>
        {success ? <Users size={16} color="var(--mui-palette-success-main, #28C76F)" /> : warning ? <AlertTriangle size={16} color="var(--mui-palette-warning-main, #FF9F43)" /> : null}
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{value.toLocaleString("pt-BR")}</Typography>
      </Stack>
    </Box>
  );
}
