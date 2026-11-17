import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getPayoutsOverviewFn, registerAffiliatePayoutFn } from "@/lib/affiliates.functions";
import { brl, csvCell, dateTimeBr, downloadCsv, formatWhatsapp } from "./format";

type Pending = Awaited<ReturnType<typeof getPayoutsOverviewFn>>["toPay"][number];

export function AffiliatePayoutsPanel() {
  const queryClient = useQueryClient();
  const overview = useServerFn(getPayoutsOverviewFn);
  const pay = useServerFn(registerAffiliatePayoutFn);
  const { data, isLoading, error } = useQuery({ queryKey: ["affiliate-payouts"], queryFn: () => overview() });
  const [paying, setPaying] = useState<Pending | null>(null);
  const [note, setNote] = useState("");

  const payMutation = useMutation({
    mutationFn: () => pay({ data: { affiliateId: paying!.affiliateId, note: note.trim() || null } }),
    onSuccess: (r) => {
      toast.success(`Pagamento de ${brl(r.amount)} registrado (${r.orders} pedidos).`);
      setPaying(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["affiliate-payouts"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliate-sales"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar o pagamento."),
  });

  const exportCsv = () => {
    if (!data) return;
    const lines = [["nome", "whatsapp", "chave_pix", "pedidos", "valor_a_pagar"].join(";")];
    for (const r of data.toPay) {
      lines.push([r.name, formatWhatsapp(r.whatsapp), r.pixKey ?? "", r.orders, r.amount.toFixed(2).replace(".", ",")].map(csvCell).join(";"));
    }
    downloadCsv(`afiliadas-pagamentos-${new Date().toISOString().slice(0, 10)}.csv`, lines);
  };

  if (isLoading) return <Typography sx={{ p: 3 }} color="text.secondary">Carregando…</Typography>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error instanceof Error ? error.message : "Erro ao carregar."}</Alert>;
  const toPay = data?.toPay ?? [];
  const total = toPay.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Stack spacing={3} sx={{ py: 2 }}>
      <Box>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap", gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            A pagar agora: {brl(total)} ({toPay.length} afiliadas)
          </Typography>
          <Button size="small" variant="outlined" startIcon={<Download size={16} />} onClick={exportCsv} disabled={toPay.length === 0}>
            Exportar para pagar (CSV)
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
          Só entram pedidos pagos que já cumpriram a carência e não foram cancelados. Pague pelo PIX e depois clique em "Marcar como paga": cada pedido só pode ser pago uma vez.
        </Typography>
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Afiliada</TableCell>
                <TableCell>Chave PIX</TableCell>
                <TableCell align="right">Pedidos</TableCell>
                <TableCell align="right">Valor</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {toPay.map((r) => (
                <TableRow key={r.affiliateId} hover>
                  <TableCell>
                    {r.name}
                    <Typography variant="caption" color="text.secondary" component="div">{formatWhatsapp(r.whatsapp)}</Typography>
                  </TableCell>
                  <TableCell>
                    {r.pixKey ? r.pixKey : <Chip size="small" color="warning" label="sem PIX cadastrado" />}
                    {r.status !== "approved" && <Chip size="small" color="error" label={r.status === "blocked" ? "bloqueada" : r.status} sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell align="right">{r.orders}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {brl(r.amount)}
                    {r.needsReview && <Chip size="small" color="warning" variant="outlined" label="conferir" sx={{ ml: 0.5 }} title="Há pedido com reembolso parcial" />}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="contained" disabled={r.status !== "approved"} onClick={() => setPaying(r)}>
                      Marcar como paga
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {toPay.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: "text.secondary", py: 4 }}>
                    Nenhuma comissão aprovada para pagar agora.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Pagamentos já feitos</Typography>
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data</TableCell>
                <TableCell>Afiliada</TableCell>
                <TableCell align="right">Valor</TableCell>
                <TableCell>Observação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.history ?? []).map((h) => (
                <TableRow key={h.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dateTimeBr(h.paidAt)}</TableCell>
                  <TableCell>{h.affiliateName}</TableCell>
                  <TableCell align="right">{brl(h.amount)}</TableCell>
                  <TableCell>{h.note ?? "—"}</TableCell>
                </TableRow>
              ))}
              {(data?.history ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ color: "text.secondary", py: 3 }}>Nenhum pagamento registrado ainda.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Dialog open={Boolean(paying)} onClose={() => setPaying(null)} fullWidth maxWidth="xs">
        <DialogTitle>Registrar pagamento</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Confirma que você já pagou <b>{brl(paying?.amount)}</b> para <b>{paying?.name}</b> ({paying?.orders} pedidos)? Esses pedidos não poderão ser pagos de novo.
            </Typography>
            <TextField label="Observação (opcional)" size="small" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: PIX 28/11" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaying(null)}>Cancelar</Button>
          <Button variant="contained" disabled={payMutation.isPending} onClick={() => payMutation.mutate()}>Confirmar pagamento</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
