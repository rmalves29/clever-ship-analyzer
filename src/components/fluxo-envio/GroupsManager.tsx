import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, RefreshCw, Plus, ExternalLink } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  listEnvioGroups,
  syncEnvioGroupsFromWhatsapp,
  addEnvioGroupManual,
  updateEnvioGroup,
  deleteEnvioGroup,
} from "@/lib/envio-groups.functions";

export function GroupsManager() {
  const qc = useQueryClient();
  const list = useServerFn(listEnvioGroups);
  const sync = useServerFn(syncEnvioGroupsFromWhatsapp);
  const add = useServerFn(addEnvioGroupManual);
  const update = useServerFn(updateEnvioGroup);
  const del = useServerFn(deleteEnvioGroup);

  const { data: groups, isLoading } = useQuery({ queryKey: ["envio-groups"], queryFn: () => list() });

  const [search, setSearch] = useState("");
  const [adminOnly, setAdminOnly] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newJid, setNewJid] = useState("");
  const [newName, setNewName] = useState("");
  const [newInvite, setNewInvite] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["envio-groups"] });

  const syncMut = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.synced} grupo(s), ${r.admin_count} como admin.`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: () => add({ data: { groupJid: newJid, groupName: newName, inviteLink: newInvite || undefined } }),
    onSuccess: () => {
      toast.success("Grupo adicionado.");
      setAddOpen(false);
      setNewJid("");
      setNewName("");
      setNewInvite("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; is_entry_open?: boolean; is_active?: boolean }) => update({ data: input }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (groups ?? []).filter((g) => {
    if (adminOnly && !g.is_admin) return false;
    if (!showInactive && !g.is_active) return false;
    if (search && !g.group_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
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
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" placeholder="Buscar grupo…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ maxWidth: 260 }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Switch size="small" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} />
          <Typography variant="body2">Só onde sou admin</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Switch size="small" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          <Typography variant="body2">Mostrar inativos</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
          <Button variant="outline" startIcon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
            Adicionar manual
          </Button>
          <Button
            variant="contained"
            startIcon={<RefreshCw size={16} className={syncMut.isPending ? "animate-spin" : undefined} />}
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
          >
            Buscar do WhatsApp
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
        {filtered.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
            Nenhum grupo encontrado.
          </Typography>
        )}
        {filtered.map((g, i) => (
          <Stack
            key={g.id}
            direction="row"
            spacing={2}
            sx={{ flexWrap: "wrap", alignItems: "center", p: 2, borderTop: i > 0 ? "1px solid" : "none", borderColor: "divider" }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.group_name}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5 }}>
                <Chip size="small" variant="outlined" label={`${g.participant_count}/${g.max_participants || 1024}`} />
                {g.is_admin && <Chip size="small" color="primary" label="Admin" />}
                {g.invite_link ? (
                  <Link href={g.invite_link} target="_blank" rel="noreferrer" underline="hover" sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: 12 }}>
                    <ExternalLink size={12} /> Link
                  </Link>
                ) : (
                  <Typography variant="caption" color="error.main">
                    Falta link de convite
                  </Typography>
                )}
              </Stack>
            </Box>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Typography variant="caption">Aberto</Typography>
              <Switch size="small" checked={g.is_entry_open} onChange={(e) => updateMut.mutate({ id: g.id, is_entry_open: e.target.checked })} />
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Typography variant="caption">Ativo</Typography>
              <Switch size="small" checked={g.is_active} onChange={(e) => updateMut.mutate({ id: g.id, is_active: e.target.checked })} />
            </Stack>
            <IconButton
              size="small"
              onClick={() => {
                if (confirm(`Apagar o grupo "${g.group_name}"?`)) deleteMut.mutate(g.id);
              }}
            >
              <Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" />
            </IconButton>
          </Stack>
        ))}
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Adicionar grupo manualmente</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField fullWidth size="small" label="JID do grupo" value={newJid} onChange={(e) => setNewJid(e.target.value)} placeholder="120363xxxxxxx-group" />
            <TextField fullWidth size="small" label="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <TextField
              fullWidth
              size="small"
              label="Link de convite (opcional)"
              value={newInvite}
              onChange={(e) => setNewInvite(e.target.value)}
              placeholder="https://chat.whatsapp.com/…"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => addMut.mutate()} disabled={addMut.isPending || !newJid || !newName}>
            Adicionar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
