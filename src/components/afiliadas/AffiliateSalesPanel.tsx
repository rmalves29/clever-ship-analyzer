import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { toast } from "sonner";
import { assignAffiliateOrderFn, getAffiliateSalesFn, listAffiliatesFn, removeAffiliateOrderAttributionFn } from "@/lib/affiliates.functions";
import { COMMISSION_STATUS_LABEL, type CommissionStatus } from "@/lib/affiliate-commission";
import { brl, csvCell, dateTimeBr, downloadCsv } from "./format";

const COLOR: Record<CommissionStatus, "default" | "success" | "warning" | "error" | "info"> = {
  approved: "success",
  pending: "warning",
  paid: "info",
  unpaid: "default",
  void: "error",
  outside_window: "default",
  self_purchase: "default",
};

const ORIGIN: Record<"coupon" | "link" | "manual", string> = { coupon: "Cupom", link: "Link", manual: "Manual" };

const STATUSES = Object.keys(COMMISSION_STATUS_LABEL) as CommissionStatus[];

export function AffiliateSalesPanel() {
  const sales = useServerFn(getAffiliateSalesFn);
  const list = useServerFn(listAffiliatesFn);
  const queryClient = useQueryClient();
  const assign = useServerFn(assignAffiliateOrderFn);
  const unassign = useServerFn(removeAffiliateOrderAttributionFn);
  const [affiliateId, setAffiliateId] = useState("");
  const [status, setStatus] = useState<CommissionStatus | "">("");
  const [manualOrder, setManualOrder] = useState("");
  const [manualAffiliate, setManualAffiliate] = useState("");
  const [manualNote, setManualNote] = useState("");

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["affiliate-sales"] });
    void queryClient.invalidateQueries({ queryKey: ["affiliates"] });
    void queryClient.invalidateQueries({ queryKey: ["affiliate-payouts"] });
  };
  const assignMutation = useMutation({
    mutationFn: () => assign({ data: { orderNumber: manualOrder, affiliateId: manualAffiliate, note: manualNote.trim() || null } }),
    onSuccess: (r) => {
      toast.success(`Pedido ${r.orderNumber} atribuído a ${r.affiliateName}.`);
      setManualOrder("");
      setManualNote("");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atribuir."),
  });
  const unassignMutation = useMutation({
    mutationFn: (orderId: string) => unassign({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Atribuição manual removida.");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível remover."),
  });

  const affiliates = useQuery({ queryKey: ["affiliates"], queryFn: () => list() });
  const { data, isLoading, error } = useQuery({
    queryKey: ["affiliate-sales", affiliateId, status],
    queryFn: () => sales({ data: { affiliateId: affiliateId || null, status: status || null } }),
  });

  const exportCsv = () => {
    if (!data) return;
    const lines = [["pedido", "data", "afiliada", "cupom", "origem", "status_pedido", "base_produtos", "comissao", "situacao_comissao", "conferir"].join(";")];
    for (const s of data.sales) {
      lines.push(
        [
          s.orderNumber ?? s.orderId,
          dateTimeBr(s.createdAt),
          s.affiliateName,
          s.code,
          ORIGIN[s.attribution],
          s.financialStatus ?? "",
          String(s.base).replace(".", ","),
          String(s.commission).replace(".", ","),
          COMMISSION_STATUS_LABEL[s.status],
          s.needsReview ? "sim" : "",
        ]
          .map(csvCell)
          .join(";"),
      );
    }
    downloadCsv(`afiliadas-vendas-${new Date().toISOString().slice(0, 10)}.csv`, lines);
  };

  return (
    <Stack spacing={2} sx={{ py: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", gap: 1 }}>
          <TextField select size="small" label="Afiliada" value={affiliateId} onChange={(e) => setAffiliateId(e.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">Todas</MenuItem>
            {(affiliates.data?.affiliates ?? []).filter((a) => a.code).map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.name} ({a.code})</MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Situação" value={status} onChange={(e) => setStatus(e.target.value as CommissionStatus | "")} sx={{ minWidth: 220 }}>
            <MenuItem value="">Todas</MenuItem>
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>{COMMISSION_STATUS_LABEL[s]}</MenuItem>
            ))}
          </TextField>
        </Stack>
        <Button size="small" variant="outlined" startIcon={<Download size={16} />} onClick={exportCsv} disabled={!data || data.sales.length === 0}>
          Exportar CSV
        </Button>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" }, border: "1px dashed", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>Atribuir pedido à mão</Typography>
        <TextField size="small" label="Nº do pedido" placeholder="#3995" value={manualOrder} onChange={(e) => setManualOrder(e.target.value)} sx={{ width: 140 }} />
        <TextField select size="small" label="Afiliada" value={manualAffiliate} onChange={(e) => setManualAffiliate(e.target.value)} sx={{ minWidth: 220 }}>
          {(affiliates.data?.affiliates ?? []).filter((a) => a.code).map((a) => (
            <MenuItem key={a.id} value={a.id}>{a.name} ({a.code})</MenuItem>
          ))}
        </TextField>
        <TextField size="small" label="Motivo (opcional)" value={manualNote} onChange={(e) => setManualNote(e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
        <Button variant="contained" size="small" disabled={!manualOrder.trim() || !manualAffiliate || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
          Atribuir
        </Button>
      </Stack>

      {error && <Alert severity="error">{error instanceof Error ? error.message : "Erro ao carregar."}</Alert>}
      {isLoading && <Typography color="text.secondary">Carregando…</Typography>}

      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Pedido</TableCell>
              <TableCell>Data</TableCell>
              <TableCell>Afiliada</TableCell>
              <TableCell>Origem</TableCell>
              <TableCell align="right">Produtos</TableCell>
              <TableCell align="right">Comissão</TableCell>
              <TableCell>Situação</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.sales ?? []).map((s) => (
              <TableRow key={`${s.orderId}-${s.affiliateId}`} hover>
                <TableCell>{s.orderNumber ? `#${s.orderNumber}` : s.orderId}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{dateTimeBr(s.createdAt)}</TableCell>
                <TableCell>
                  {s.affiliateName} <Typography component="span" variant="caption" color="text.secondary">({s.code})</Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined" label={ORIGIN[s.attribution]} color={s.attribution === "manual" ? "warning" : "default"} title={s.attribution === "link" ? "O cliente entrou pelo link da afiliada" : s.attribution === "coupon" ? "O pedido usou o cupom da afiliada" : "Atribuído à mão"} />
                  {s.attribution === "manual" && s.status !== "paid" && (
                    <Button size="small" color="inherit" disabled={unassignMutation.isPending} onClick={() => unassignMutation.mutate(s.orderId)}>desfazer</Button>
                  )}
                </TableCell>
                <TableCell align="right">{brl(s.base)}</TableCell>
                <TableCell align="right">{brl(s.commission)}</TableCell>
                <TableCell>
                  <Chip size="small" color={COLOR[s.status]} label={COMMISSION_STATUS_LABEL[s.status]} />
                  {s.needsReview && <Chip size="small" color="warning" variant="outlined" label="conferir" sx={{ ml: 0.5 }} title="Reembolso parcial ou estorno depois de pago" />}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (data?.sales ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: "text.secondary", py: 4 }}>
                  Nenhum pedido com cupom de afiliada ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {data && data.total > data.sales.length && (
        <Typography variant="caption" color="text.secondary">Mostrando os {data.sales.length} mais recentes de {data.total}. Use os filtros para refinar.</Typography>
      )}
    </Stack>
  );
}
