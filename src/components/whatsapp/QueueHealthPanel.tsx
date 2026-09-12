import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  getWhatsappQueueHealth,
  pauseWhatsappCampaign,
  resumeWhatsappCampaign,
  retryFailedWhatsappCampaign,
} from "@/lib/whatsapp-queue-health.functions";

const STATUS_CARDS = [
  ["queued", "Na fila"],
  ["sending", "Enviando"],
  ["retry_wait", "Retry"],
  ["sent", "Enviadas"],
  ["failed", "Falhas"],
  ["cancelled", "Canceladas"],
  ["skipped", "Ignoradas"],
] as const;

type QueueCampaign = {
  id: string;
  nome: string;
  status: string;
  paused: boolean;
  messageType: string;
  queue: {
    queued: number;
    sending: number;
    retry: number;
    sent: number;
    failed: number;
    skipped: number;
    cancelled: number;
  };
};

export function QueueHealthPanel() {
  const runPause = useServerFn(pauseWhatsappCampaign);
  const runResume = useServerFn(resumeWhatsappCampaign);
  const runRetry = useServerFn(retryFailedWhatsappCampaign);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["whatsapp-queue-health"],
    queryFn: () => getWhatsappQueueHealth(),
    refetchInterval: 15_000,
  });

  const mutate = async (campaignId: string, action: "pause" | "resume" | "retry") => {
    setBusyId(campaignId);
    try {
      if (action === "pause") {
        const result = await runPause({ data: { campaignId } });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Fila da campanha pausada. Os jobs continuam preservados.");
      } else if (action === "resume") {
        const result = await runResume({ data: { campaignId } });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Fila da campanha retomada.");
      } else {
        const result = await runRetry({ data: { campaignId } });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(`${result.retried} falha(s) reenfileirada(s).`);
      }
      await refetch();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao operar a fila do WhatsApp.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>Saúde da fila do WhatsApp</Typography>
          <Typography variant="body2" color="text.secondary">
            Estado real dos jobs do worker. Pausar não apaga mensagens: apenas impede novas reivindicações até retomar.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} className={isFetching ? "animate-spin" : undefined} />} disabled={isFetching} onClick={() => refetch()}>
          Atualizar
        </Button>
      </Stack>

      {isLoading && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Carregando fila...</Typography>}
      {isError && <Typography variant="body2" color="error" sx={{ mt: 2 }}>Não foi possível carregar a fila.</Typography>}

      {data && (
        <>
          <Box sx={{ mt: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)", xl: "repeat(7, 1fr)" } }}>
            {STATUS_CARDS.map(([key, label]) => (
              <Box key={key} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{data.byStatus[key].toLocaleString("pt-BR")}</Typography>
              </Box>
            ))}
          </Box>

          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 2 }}>
            <Chip variant="outlined" label={`Total: ${data.total.toLocaleString("pt-BR")}`} />
            <Chip variant="outlined" label={`Pendentes: ${data.pending.toLocaleString("pt-BR")}`} />
            <Chip variant="outlined" label={`Finalizados: ${data.finished.toLocaleString("pt-BR")}`} />
            <Chip variant="outlined" label={`Sucesso provider: ${data.successRate.toFixed(1)}%`} />
          </Stack>

          <TableContainer sx={{ mt: 2.5, border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
            <Table sx={{ minWidth: 980 }} size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Campanha</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Fila</TableCell>
                  <TableCell>Enviando</TableCell>
                  <TableCell>Retry</TableCell>
                  <TableCell>Enviadas</TableCell>
                  <TableCell>Falhas</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.campaigns.map((campaign: QueueCampaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{campaign.nome}</Typography>
                      <Typography variant="caption" color="text.secondary">{campaign.messageType === "utility" ? "Utilidade" : "Marketing"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
                        <Chip size="small" variant="outlined" label={campaign.status || "—"} />
                        {campaign.paused && <Chip size="small" color="warning" label="Fila pausada" />}
                      </Stack>
                    </TableCell>
                    <TableCell>{campaign.queue.queued}</TableCell>
                    <TableCell>{campaign.queue.sending}</TableCell>
                    <TableCell>{campaign.queue.retry}</TableCell>
                    <TableCell>{campaign.queue.sent}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{campaign.queue.failed}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.75} sx={{ justifyContent: "flex-end" }}>
                        {campaign.paused ? (
                          <Button size="small" variant="outlined" startIcon={<Play size={14} />} disabled={busyId === campaign.id} onClick={() => mutate(campaign.id, "resume")}>
                            Retomar
                          </Button>
                        ) : campaign.queue.queued + campaign.queue.retry > 0 ? (
                          <Button size="small" variant="outlined" startIcon={<Pause size={14} />} disabled={busyId === campaign.id} onClick={() => mutate(campaign.id, "pause")}>
                            Pausar
                          </Button>
                        ) : null}
                        {campaign.queue.failed > 0 && (
                          <Button size="small" variant="outlined" startIcon={<RotateCcw size={14} />} disabled={busyId === campaign.id} onClick={() => mutate(campaign.id, "retry")}>
                            Tentar falhas
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {data.campaigns.length === 0 && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>Nenhuma campanha encontrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {data.failureReasons.length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Falhas atuais da fila</Typography>
              <Box sx={{ mt: 1, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                {data.failureReasons.slice(0, 8).map((failure) => (
                  <Stack key={failure.reason} direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, px: 1.5, py: 1 }}>
                    <Typography variant="body2" noWrap title={failure.reason}>{failure.reason}</Typography>
                    <Chip size="small" variant="outlined" label={failure.count} />
                  </Stack>
                ))}
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
