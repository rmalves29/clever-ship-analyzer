import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Copy, Trash2, Pencil, MousePointerClick, ArrowRightToLine, Percent, Users } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  listEnvioCampaigns,
  createEnvioCampaign,
  updateEnvioCampaign,
  deleteEnvioCampaign,
} from "@/lib/envio-campaigns.functions";
import { CampaignDetailDialog } from "./CampaignDetailDialog";

export function CampaignsManager() {
  const qc = useQueryClient();
  const list = useServerFn(listEnvioCampaigns);
  const create = useServerFn(createEnvioCampaign);
  const update = useServerFn(updateEnvioCampaign);
  const del = useServerFn(deleteEnvioCampaign);

  const { data: campaigns, isLoading } = useQuery({ queryKey: ["envio-campaigns"], queryFn: () => list() });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["envio-campaigns"] });

  const createMut = useMutation({
    mutationFn: () => create({ data: { name, description: description || undefined } }),
    onSuccess: () => {
      toast.success("Campanha criada.");
      setCreateOpen(false);
      setName("");
      setDescription("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: (input: { id: string; name: string; description: string }) => update({ data: { id: input.id, name: input.name.trim(), description: input.description.trim() } }),
    onSuccess: () => {
      toast.success("Campanha atualizada.");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; is_entry_open?: boolean; is_active?: boolean }) => update({ data: input }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
        Carregando…
      </Typography>
    );
  }

  return (
    <Stack spacing={2} sx={{ py: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
          Nova campanha
        </Button>
      </Box>

      <Grid container spacing={2}>
        {(campaigns ?? []).map((c) => {
          // O link que se divulga é o do Cartzy (o redirecionamento e a contagem de cliques são de lá).
          const url = c.public_url ?? "";
          const stats = c.stats;
          return (
            <Grid key={c.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card variant="outlined" sx={{ cursor: "pointer", height: "100%" }} onClick={() => setDetailId(c.id)}>
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Typography sx={{ fontWeight: 600 }}>{c.name}</Typography>
                    <Stack direction="row" spacing={0.25}>
                      <IconButton
                        size="small"
                        title="Editar nome e descrição"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing({ id: c.id, name: c.name, description: c.description ?? "" });
                        }}
                      >
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Apagar a campanha "${c.name}"?`)) deleteMut.mutate(c.id);
                        }}
                      >
                        <Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" />
                      </IconButton>
                    </Stack>
                  </Stack>
                  {c.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {c.description}
                    </Typography>
                  )}
                  {stats && (
                    <Stack direction="row" spacing={2} sx={{ mt: 1.25, color: "text.secondary" }}>
                      <Stack direction="row" spacing={0.5} title="Cliques no link" sx={{ alignItems: "center" }}>
                        <MousePointerClick size={14} />
                        <Typography variant="caption">{stats.clicks.toLocaleString("pt-BR")}</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} title="Entradas nos grupos" sx={{ alignItems: "center" }}>
                        <ArrowRightToLine size={14} />
                        <Typography variant="caption">{stats.entries.toLocaleString("pt-BR")}</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} title="% de entrada (entradas ÷ cliques)" sx={{ alignItems: "center" }}>
                        <Percent size={14} />
                        <Typography variant="caption">{stats.entryRate.toFixed(0)}</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} title="Grupos vinculados" sx={{ alignItems: "center" }}>
                        <Users size={14} />
                        <Typography variant="caption">{stats.groupCount}</Typography>
                      </Stack>
                    </Stack>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} onClick={(e) => e.stopPropagation()}>
                    <TextField size="small" fullWidth value={url} slotProps={{ input: { readOnly: true } }} sx={{ "& input": { fontSize: 12 } }} />
                    <IconButton
                      size="small"
                      sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, flexShrink: 0 }}
                      onClick={() => {
                        navigator.clipboard.writeText(url);
                        toast.success("Link copiado.");
                      }}
                    >
                      <Copy size={14} />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" spacing={2} sx={{ mt: 1.5, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Typography variant="caption">Aberta</Typography>
                      <Switch size="small" checked={c.is_entry_open} onChange={(e) => toggleMut.mutate({ id: c.id, is_entry_open: e.target.checked })} />
                    </Stack>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Typography variant="caption">Ativa</Typography>
                      <Switch size="small" checked={c.is_active} onChange={(e) => toggleMut.mutate({ id: c.id, is_active: e.target.checked })} />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
        {(campaigns ?? []).length === 0 && (
          <Grid size={12}>
            <Typography variant="body2" color="text.secondary">
              Nenhuma campanha criada ainda.
            </Typography>
          </Grid>
        )}
      </Grid>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nova campanha</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField fullWidth size="small" label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField fullWidth size="small" label="Descrição (opcional)" multiline rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => createMut.mutate()} disabled={createMut.isPending || !name}>
            Criar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar campanha</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField fullWidth size="small" label="Nome" value={editing?.name ?? ""} onChange={(e) => setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))} />
            <TextField
              fullWidth
              size="small"
              label="Descrição"
              multiline
              rows={3}
              value={editing?.description ?? ""}
              onChange={(e) => setEditing((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
            />
            <Typography variant="caption" color="text.secondary">
              O link da campanha não muda ao editar o nome.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="contained" disabled={editMut.isPending || !editing?.name.trim()} onClick={() => editing && editMut.mutate(editing)}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {detailId && <CampaignDetailDialog campaignId={detailId} onClose={() => setDetailId(null)} />}
    </Stack>
  );
}
