import { useState } from "react";
import { createFileRoute, createLink } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, RefreshCw, RotateCcw, Ban, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { getWaCampaign, waCampaignAction } from "@/lib/wa-campaigns.functions";

export const Route = createFileRoute("/whatsapp/$campaignId")({
  head: () => ({
    meta: [
      { title: "Campanha de WhatsApp | CRM Insights" },
      { name: "description", content: "Situação real de cada destinatário da campanha: enviada, entregue, lida ou falha com motivo." },
      { property: "og:title", content: "Campanha de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Acompanhe destinatário por destinatário o resultado do envio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => <Typography variant="body2" color="error" sx={{ p: 4 }}>{error.message}</Typography>,
  notFoundComponent: () => <Typography variant="body2" color="text.secondary" sx={{ p: 4 }}>Campanha não encontrada.</Typography>,
  component: CampaignDetailPage,
});

const LinkIconButton = createLink(IconButton);

const RECIPIENT_LABEL: Record<string, string> = {
  queued: "Na fila",
  sending: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  cancelled: "Cancelada",
};

const RECIPIENT_COLOR: Record<string, "default" | "warning" | "info" | "success" | "error"> = {
  queued: "default",
  sending: "warning",
  sent: "info",
  delivered: "success",
  read: "success",
  failed: "error",
  cancelled: "default",
};

const STATUS_TABS = ["todos", "queued", "sent", "delivered", "read", "failed"] as const;

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const runDetail = useServerFn(getWaCampaign);
  const runAction = useServerFn(waCampaignAction);
  const [statusTab, setStatusTab] = useState<string>("todos");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["wa-campaign", campaignId, statusTab],
    queryFn: () => runDetail({ data: { campaignId, status: statusTab } }),
    refetchInterval: 15_000,
  });

  const act = async (action: "retry" | "cancel" | "pause" | "resume" | "refresh") => {
    setBusy(true);
    try {
      await runAction({ data: { campaignId, action } });
      toast.success("Pronto.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Não deu certo.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !data) return <Typography variant="body2" color="text.secondary">Carregando campanha…</Typography>;
  const c = data.campaign;

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <LinkIconButton to="/whatsapp">
          <ChevronLeft size={20} />
        </LinkIconButton>
        <Box sx={{ mr: "auto" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{c.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {c.audienceLabel ?? "Público"} · modelo {c.templateName || "—"} ({c.templateLanguage}) ·{" "}
            {new Date(c.sentAt ?? c.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshCw size={14} className={isFetching ? "animate-spin" : undefined} />} disabled={busy || isFetching} onClick={() => act("refresh")}>
          Atualizar
        </Button>
        <Button variant="outlined" startIcon={c.queuePaused ? <Play size={14} /> : <Pause size={14} />} disabled={busy} onClick={() => act(c.queuePaused ? "resume" : "pause")}>
          {c.queuePaused ? "Retomar" : "Pausar"}
        </Button>
        <Button variant="outlined" startIcon={<RotateCcw size={14} />} disabled={busy || c.failed === 0} onClick={() => act("retry")}>
          Repetir falhas
        </Button>
        <Button variant="outlined" color="error" startIcon={<Ban size={14} />} disabled={busy || c.pending === 0} onClick={() => act("cancel")}>
          Cancelar restante
        </Button>
      </Stack>

      {(data.lastError || data.rejectReason) && (
        <Box sx={{ border: "1px solid", borderColor: "error.main", borderRadius: 3, p: 2 }}>
          <Typography variant="body2" color="error">{data.rejectReason ?? data.lastError}</Typography>
        </Box>
      )}

      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" } }}>
        {[
          { label: "Destinatários", value: c.total },
          { label: "Enviadas", value: c.sent },
          { label: "Entregues", value: c.delivered },
          { label: "Lidas", value: c.read },
          { label: "Falhas", value: c.failed },
          { label: "Na fila", value: c.pending },
        ].map((card) => (
          <Box key={card.label} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
            <Typography variant="caption" color="text.secondary">{card.label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{card.value.toLocaleString("pt-BR")}</Typography>
          </Box>
        ))}
      </Box>

      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 0.5, width: "fit-content" }}>
        {STATUS_TABS.map((s) => (
          <Button
            key={s}
            size="small"
            variant={statusTab === s ? "contained" : "text"}
            color={statusTab === s ? "primary" : "inherit"}
            sx={{ borderRadius: 2 }}
            onClick={() => setStatusTab(s)}
          >
            {s === "todos" ? "Todos" : RECIPIENT_LABEL[s]}
          </Button>
        ))}
      </Stack>

      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Cliente</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>Situação</TableCell>
              <TableCell>Motivo / horário</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.recipients.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name ?? "—"}</TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{r.phone}</TableCell>
                <TableCell>
                  <Chip size="small" color={RECIPIENT_COLOR[r.status] ?? "default"} label={RECIPIENT_LABEL[r.status] ?? r.status} />
                </TableCell>
                <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>
                  {r.errorMessage
                    ? `${r.errorMessage}${r.errorCode ? ` (${r.errorCode})` : ""}`
                    : r.readAt
                      ? `Lida em ${new Date(r.readAt).toLocaleString("pt-BR")}`
                      : r.deliveredAt
                        ? `Entregue em ${new Date(r.deliveredAt).toLocaleString("pt-BR")}`
                        : r.sentAt
                          ? `Enviada em ${new Date(r.sentAt).toLocaleString("pt-BR")}`
                          : "—"}
                </TableCell>
              </TableRow>
            ))}
            {data.recipients.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  Nenhum destinatário nessa situação.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
