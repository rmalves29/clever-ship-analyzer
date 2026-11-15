import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ShoppingCart } from "lucide-react";
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
import { getPurchaseRecoveryStatus } from "@/lib/purchase-recovery.functions";

type Cor = "success" | "warning" | "error" | "default" | "info";

const ESTADO: Record<string, { label: string; cor: Cor }> = {
  online: { label: "Online", cor: "success" },
  aguardando_meta: { label: "Armado · aguardando aprovação da Meta", cor: "warning" },
  rejeitado_meta: { label: "Modelo rejeitado pela Meta", cor: "error" },
  bloqueado_meta: { label: "Bloqueado pela Meta", cor: "error" },
  bloqueado: { label: "Armado · bloqueado", cor: "warning" },
  armado: { label: "Armado · aguardando publicação", cor: "info" },
  desarmado: { label: "Desarmado", cor: "default" },
  rascunho: { label: "Rascunho", cor: "default" },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando 1ª mensagem",
  queued_initial: "1ª mensagem na fila",
  waiting_reminder: "Aguardando lembrete",
  queued_reminder: "Lembrete na fila",
  completed: "Concluídas",
  exited: "Saíram",
  excluded: "Excluídas",
  failed: "Falharam",
};

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

const corDoModelo = (status: string): Cor => (status === "APPROVED" ? "success" : status === "PENDING" || status === "IN_APPEAL" ? "warning" : "error");

export function PurchaseRecoveryPanel() {
  const fetchStatus = useServerFn(getPurchaseRecoveryStatus);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["purchase-recovery-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 60_000,
  });

  if (isLoading) return null;
  if (error) {
    return (
      <Typography variant="body2" color="error">
        Não foi possível carregar a recuperação de compras: {error instanceof Error ? error.message : String(error)}
      </Typography>
    );
  }
  const fluxos = data ?? [];
  if (fluxos.length === 0) return null;

  return (
    <Stack spacing={2}>
      {fluxos.map((f) => {
        const estado = ESTADO[f.state] ?? { label: f.state, cor: "default" as Cor };
        return (
          <Box key={f.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <ShoppingCart size={18} />
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>{f.nome}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Checkout abandonado ou pedido expirado · espera 30 min · 1ª mensagem + 1 lembrete 4h após o envio · 09h–19h
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                <Chip size="small" color={estado.cor} label={estado.label} />
                <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} disabled={isFetching} onClick={() => refetch()}>
                  Atualizar
                </Button>
              </Stack>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
              {f.gate ? (
                [f.gate.initial, f.gate.reminder].map((m) => (
                  <Chip
                    key={m.name}
                    size="small"
                    variant="outlined"
                    color={corDoModelo(m.status)}
                    label={`${m.name}: ${m.status}${m.status === "APPROVED" && !m.bodyMatches ? " (texto diferente)" : ""}`}
                  />
                ))
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Status dos modelos ainda não consultado pelo agendamento publicado.
                </Typography>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              Última verificação: {fmt(f.lastTickAt)}
              {f.lastBlocker ? ` · ${f.lastBlocker}` : ""}
            </Typography>
            {f.lastError && (
              <Typography variant="caption" color="error" sx={{ display: "block" }}>
                Erro: {f.lastError}
              </Typography>
            )}

            <Box sx={{ mt: 1.5, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)", xl: "repeat(8, 1fr)" } }}>
              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                <Box key={key} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography sx={{ fontWeight: 700 }}>{f.byStatus[key] ?? 0}</Typography>
                </Box>
              ))}
            </Box>

            {Object.keys(f.reasons).length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  Motivos de exclusão/saída
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.75 }}>
                  {Object.entries(f.reasons)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => (
                      <Chip key={reason} size="small" variant="outlined" label={`${reason} · ${count}`} />
                    ))}
                </Stack>
              </Box>
            )}

            {f.recent.length > 0 && (
              <TableContainer sx={{ mt: 1.5, maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Cliente</TableCell>
                      <TableCell>Origem</TableCell>
                      <TableCell>Tentativa</TableCell>
                      <TableCell>Situação</TableCell>
                      <TableCell>1ª mensagem</TableCell>
                      <TableCell>Lembrete</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {f.recent.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {r.name ?? "—"}
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                            {r.phone}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {r.source === "order" ? "Pedido expirado" : "Checkout"} · {r.cohort === "initial" ? "lote 13–14/11" : "contínuo"}
                        </TableCell>
                        <TableCell>{fmt(r.attemptAt)}</TableCell>
                        <TableCell>
                          {STATUS_LABEL[r.status] ?? r.status}
                          {(r.reason || r.lastError) && (
                            <Typography variant="caption" color={r.lastError ? "error" : "text.secondary"} sx={{ display: "block" }}>
                              {r.lastError ?? r.reason}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{fmt(r.initialSentAt)}</TableCell>
                        <TableCell>{r.reminderSentAt ? fmt(r.reminderSentAt) : r.reminderDueAt ? `previsto ${fmt(r.reminderDueAt)}` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
