import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, RefreshCw, Plus, ExternalLink, Link2, Pencil } from "lucide-react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
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
  refreshEnvioGroupLinks,
  addEnvioGroupManual,
  updateEnvioGroup,
  deleteEnvioGroup,
} from "@/lib/envio-groups.functions";

type GroupSyncResult = {
  synced: number;
  total_found: number;
  admin_count: number;
  names_updated: number;
  duplicate_records_updated: number;
  detail_failures: number;
  failed: number;
  warning?: string;
};

export function GroupsManager() {
  const qc = useQueryClient();
  const list = useServerFn(listEnvioGroups);
  const sync = useServerFn(syncEnvioGroupsFromWhatsapp);
  const refreshLinks = useServerFn(refreshEnvioGroupLinks);
  const add = useServerFn(addEnvioGroupManual);
  const update = useServerFn(updateEnvioGroup);
  const del = useServerFn(deleteEnvioGroup);

  // A lista se atualiza sozinha (o painel original usa tempo real): participantes e entrada mudam por fora.
  const { data: groups, isLoading, isError, error: loadError } = useQuery({
    queryKey: ["envio-groups"],
    queryFn: () => list(),
    refetchInterval: 20_000,
  });

  const [search, setSearch] = useState("");
  const [adminOnly, setAdminOnly] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const [editLink, setEditLink] = useState<{ id: string; name: string; value: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newJid, setNewJid] = useState("");
  const [newName, setNewName] = useState("");
  const [newInvite, setNewInvite] = useState("");
  const [lastSync, setLastSync] = useState<GroupSyncResult | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["envio-groups"] });

  const syncMut = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      const result = r as GroupSyncResult;
      setLastSync(result);
      const hasWarnings = result.detail_failures > 0 || result.failed > 0;
      const message = `WhatsApp: ${result.total_found} encontrado(s); ${result.synced} salvo(s); ${result.names_updated} nome(s) alterado(s).`;
      if (result.warning) {
        toast.warning(`${message} ${result.warning}`);
      } else if (hasWarnings) {
        toast.warning(
          `${message} ${result.detail_failures} detalhe(s) falharam e ${result.failed} gravação(ões) falharam.`,
        );
      } else {
        toast.success(message);
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshLinksMut = useMutation({
    mutationFn: () => refreshLinks(),
    onSuccess: (r) => {
      const result = r as { checked: number; updated: number; failed: number };
      const failedText = result.failed > 0 ? ` — ${result.failed} não puderam ser obtidos` : "";
      toast.success(`${result.updated} link(s) atualizado(s) de ${result.checked} grupo(s) verificado(s)${failedText}.`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: () =>
      add({ data: { groupJid: newJid, groupName: newName, inviteLink: newInvite || undefined } }),
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
    mutationFn: (input: { id: string; is_entry_open?: boolean; is_active?: boolean; invite_link?: string }) =>
      update({ data: input }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveLinkMut = useMutation({
    mutationFn: (input: { id: string; invite_link: string }) => update({ data: input }),
    onSuccess: () => {
      toast.success("Link de convite salvo.");
      setEditLink(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  // Mesma ordem do painel original: do mais antigo para o mais novo.
  const filtered = (groups ?? [])
    .filter((g) => {
      if (adminOnly && !g.is_admin) return false;
      if (!showInactive && !g.is_active) return false;
      if (search && !g.group_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const activeCount = (groups ?? []).filter((g) => g.is_active).length;
  const adminCount = (groups ?? []).filter((g) => g.is_admin).length;

  if (isLoading) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
        Carregando…
      </Typography>
    );
  }

  return (
    <Stack spacing={2} sx={{ py: 2 }}>
      {isError && (
        <Alert severity="error">
          Não consegui carregar os grupos: {(loadError as Error | null)?.message ?? "erro desconhecido"}. Confira a conexão com o Live Launchpad em Configurações.
        </Alert>
      )}
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="Buscar grupo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ maxWidth: 260 }}
        />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Switch
            size="small"
            checked={adminOnly}
            onChange={(e) => setAdminOnly(e.target.checked)}
          />
          <Typography variant="body2">Só onde sou admin</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Switch
            size="small"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <Typography variant="body2">Mostrar inativos</Typography>
        </Stack>
        <Chip size="small" variant="outlined" label={`${activeCount} ativos · ${adminCount} onde sou admin`} />
        <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
          <Button variant="outline" startIcon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
            Adicionar manual
          </Button>
          <Button
            variant="outline"
            startIcon={<Link2 size={16} className={refreshLinksMut.isPending ? "animate-pulse" : undefined} />}
            onClick={() => refreshLinksMut.mutate()}
            disabled={refreshLinksMut.isPending}
            title="Atualiza só os links de convite dos grupos onde você é admin, sem re-sincronizar nomes e participantes"
          >
            Atualizar links
          </Button>
          <Button
            variant="contained"
            startIcon={
              <RefreshCw size={16} className={syncMut.isPending ? "animate-spin" : undefined} />
            }
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
          >
            Buscar do WhatsApp
          </Button>
        </Stack>
      </Stack>

      {lastSync && (
        <Alert
          severity={lastSync.detail_failures > 0 || lastSync.failed > 0 ? "warning" : "success"}
        >
          <strong>Última verificação:</strong> {lastSync.total_found} grupo(s) retornado(s) pela
          UazAPI, {lastSync.synced} salvo(s), {lastSync.names_updated} nome(s) atualizado(s) e{" "}
          {lastSync.admin_count} identificado(s) como admin.
          {lastSync.duplicate_records_updated > 0 &&
            ` ${lastSync.duplicate_records_updated} registro(s) duplicado(s) também foram atualizado(s).`}
          {lastSync.detail_failures > 0 &&
            ` Não foi possível consultar os detalhes de ${lastSync.detail_failures} grupo(s); o nome pode ter vindo da listagem antiga.`}
          {lastSync.failed > 0 && ` ${lastSync.failed} operação(ões) de gravação falharam.`}
        </Alert>
      )}

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
            sx={{
              flexWrap: "wrap",
              alignItems: "center",
              p: 2,
              borderTop: i > 0 ? "1px solid" : "none",
              borderColor: "divider",
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.group_name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.group_jid}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5 }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${g.participant_count}/${g.max_participants || 1024}`}
                />
                {g.is_admin && <Chip size="small" color="primary" label="Admin" />}
                {g.invite_link ? (
                  <Link
                    href={g.invite_link}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: 12 }}
                  >
                    <ExternalLink size={12} /> Link
                  </Link>
                ) : (
                  <Typography variant="caption" color="error.main">
                    Falta link de convite
                  </Typography>
                )}
              </Stack>
            </Box>
            <IconButton size="small" title="Editar link de convite" onClick={() => setEditLink({ id: g.id, name: g.group_name, value: g.invite_link ?? "" })}>
              <Pencil size={15} />
            </IconButton>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Typography variant="caption">Aberto</Typography>
              <Switch
                size="small"
                checked={g.is_entry_open}
                onChange={(e) => updateMut.mutate({ id: g.id, is_entry_open: e.target.checked })}
              />
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Typography variant="caption">Ativo</Typography>
              <Switch
                size="small"
                checked={g.is_active}
                onChange={(e) => updateMut.mutate({ id: g.id, is_active: e.target.checked })}
              />
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

      <Dialog open={Boolean(editLink)} onClose={() => setEditLink(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar link de convite</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {editLink?.name}
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Link de convite do WhatsApp"
              value={editLink?.value ?? ""}
              onChange={(e) => setEditLink((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              placeholder="https://chat.whatsapp.com/…"
            />
            <Typography variant="caption" color="text.secondary">
              Deixe em branco para remover o link.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditLink(null)}>Cancelar</Button>
          <Button variant="contained" disabled={saveLinkMut.isPending} onClick={() => editLink && saveLinkMut.mutate({ id: editLink.id, invite_link: editLink.value })}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Adicionar grupo manualmente</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              fullWidth
              size="small"
              label="JID do grupo"
              value={newJid}
              onChange={(e) => setNewJid(e.target.value)}
              placeholder="120363xxxxxxxxxxxx@g.us"
            />
            <TextField
              fullWidth
              size="small"
              label="Nome"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
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
          <Button
            variant="contained"
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || !newJid || !newName}
          >
            Adicionar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
