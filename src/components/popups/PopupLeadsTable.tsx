import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { listPopupLeads } from "@/lib/popup.functions";

export function PopupLeadsTable() {
  const list = useServerFn(listPopupLeads);
  const { data: leads, isLoading } = useQuery({ queryKey: ["popup-leads"], queryFn: () => list() });

  return (
    <Box sx={{ py: 2 }}>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
        <Table sx={{ minWidth: 760 }} size="small">
          <TableHead>
            <TableRow>
              <TableCell>Telefone</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Pop-up</TableCell>
              <TableCell>Cupom</TableCell>
              <TableCell>Capturada em</TableCell>
              <TableCell>Última visita</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Carregando...
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (leads ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Nenhuma lead capturada ainda.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {(leads ?? []).map((lead: any) => (
              <TableRow key={lead.id}>
                <TableCell sx={{ fontWeight: 500 }}>{lead.phone}</TableCell>
                <TableCell>{lead.name ?? "—"}</TableCell>
                <TableCell sx={{ color: "text.secondary" }}>{lead.popup_campaigns?.name ?? "—"}</TableCell>
                <TableCell>{lead.coupon_code ?? "—"}</TableCell>
                <TableCell sx={{ color: "text.secondary" }}>{new Date(lead.first_captured_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell sx={{ color: "text.secondary" }}>
                  {lead.last_visit_at ? new Date(lead.last_visit_at).toLocaleString("pt-BR") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
