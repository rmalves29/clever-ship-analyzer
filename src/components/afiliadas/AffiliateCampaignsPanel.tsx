import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { listAffiliateCampaignsFn, saveAffiliateCampaignFn } from "@/lib/affiliates.functions";
import { dateBr, dayEndIso, dayStartIso, isoToDay } from "./format";

type Campaign = Awaited<ReturnType<typeof listAffiliateCampaignsFn>>[number];

type Form = { id: string | undefined; name: string; commission: string; discount: string; from: string; to: string; active: boolean };
const EMPTY: Form = { id: undefined, name: "", commission: "15", discount: "5", from: "", to: "", active: true };

export function AffiliateCampaignsPanel() {
  const queryClient = useQueryClient();
  const list = useServerFn(listAffiliateCampaignsFn);
  const save = useServerFn(saveAffiliateCampaignFn);
  const { data, isLoading, error } = useQuery({ queryKey: ["affiliate-campaigns"], queryFn: () => list() });
  const [form, setForm] = useState<Form | null>(null);

  const open = (c?: Campaign) =>
    setForm(
      c
        ? { id: c.id, name: c.name, commission: String(c.commissionPct), discount: String(c.discountPct), from: isoToDay(c.salesStart), to: isoToDay(c.salesEnd), active: c.isActive }
        : EMPTY,
    );

  const mutation = useMutation({
    mutationFn: (f: Form) =>
      save({
        data: {
          ...(f.id ? { id: f.id } : {}),
          name: f.name,
          commissionPct: Number(f.commission.replace(",", ".")),
          discountPct: Number(f.discount.replace(",", ".")),
          salesStart: dayStartIso(f.from),
          salesEnd: dayEndIso(f.to),
          isActive: f.active,
        },
      }),
    onSuccess: () => {
      toast.success("Campanha salva.");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["affiliate-campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliate-program"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const toggle = (c: Campaign) =>
    mutation.mutate({ id: c.id, name: c.name, commission: String(c.commissionPct), discount: String(c.discountPct), from: isoToDay(c.salesStart), to: isoToDay(c.salesEnd), active: !c.isActive });

  if (isLoading) return <Typography sx={{ p: 3 }} color="text.secondary">Carregando…</Typography>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error instanceof Error ? error.message : "Erro ao carregar."}</Alert>;
  const campaigns = data ?? [];
  const openOnes = campaigns.filter((c) => c.isActive);

  return (
    <Stack spacing={2} sx={{ py: 2 }}>
      <Alert severity={openOnes.length === 0 ? "warning" : "info"}>
        {openOnes.length === 0
          ? "Nenhuma campanha aberta: a página de cadastro mostra \"inscrições fechadas\"."
          : `A página de cadastro usa a campanha aberta mais recente (${openOnes[0]?.name}). Quem se inscreve herda a comissão dela e a mantém, mesmo que você mude depois.`}
      </Alert>
      <div>
        <Button variant="contained" onClick={() => open()}>Nova campanha</Button>
      </div>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Campanha</TableCell>
              <TableCell align="right">Comissão</TableCell>
              <TableCell align="right">Desconto do cupom</TableCell>
              <TableCell>Vendas que contam</TableCell>
              <TableCell align="right">Afiliadas</TableCell>
              <TableCell>Inscrições</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow key={c.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                <TableCell align="right">{c.commissionPct}%</TableCell>
                <TableCell align="right">{c.discountPct}%</TableCell>
                <TableCell>{c.salesStart || c.salesEnd ? `${dateBr(c.salesStart)} a ${dateBr(c.salesEnd)}` : "Sempre"}</TableCell>
                <TableCell align="right">{c.affiliates}</TableCell>
                <TableCell>
                  <Chip size="small" color={c.isActive ? "success" : "default"} label={c.isActive ? "Abertas" : "Fechadas"} />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => open(c)}>Editar</Button>
                  <Button size="small" color={c.isActive ? "inherit" : "primary"} disabled={mutation.isPending} onClick={() => toggle(c)}>
                    {c.isActive ? "Fechar inscrições" : "Abrir inscrições"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: "text.secondary", py: 4 }}>Nenhuma campanha criada ainda.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(form)} onClose={() => setForm(null)} fullWidth maxWidth="xs">
        <DialogTitle>{form?.id ? "Editar campanha" : "Nova campanha"}</DialogTitle>
        <DialogContent>
          {form && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField label="Nome da campanha" size="small" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Black Friday 2026" />
              <TextField
                label="Comissão (%)"
                size="small"
                value={form.commission}
                onChange={(e) => setForm({ ...form, commission: e.target.value })}
                helperText="Quem se inscrever com a campanha aberta herda esse percentual."
              />
              <TextField
                label="Desconto do cupom para o cliente (%)"
                size="small"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                helperText="Mínimo 1% (a Shopify exige). Vale para cupons criados depois."
              />
              <Stack direction="row" spacing={1.5}>
                <TextField type="date" label="Vendas a partir de" size="small" fullWidth value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField type="date" label="Vendas até" size="small" fullWidth value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Período em que as vendas geram comissão (horário de Brasília). Para pagar só no dia da Black Friday, coloque a mesma data nos dois campos. Em branco = sempre. Os cupons novos expiram na loja ao fim do período.
              </Typography>
              <FormControlLabel control={<Switch checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />} label="Inscrições abertas" />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="contained" disabled={mutation.isPending || !form || form.name.trim().length < 2} onClick={() => form && mutation.mutate(form)}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
