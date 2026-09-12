import { useMemo, useState } from "react";
import { createFileRoute, createLink, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listFlowAutomations,
  createFlowAutomation,
  deleteFlowAutomation,
  duplicateFlowAutomation,
  updateFlowAutomation,
  listFlowContacts,
  listFlowLogs,
  addFlowContactTag,
  removeFlowContactTag,
  getFlowAutomationsStats,
} from "@/lib/flow.functions";
import { getFlowStatus } from "@/lib/flow-diagnostics.functions";
import type { FlowAutomation, FlowAutomationStats, FlowContact } from "@/lib/flow.server";
import { Plus, MessageSquare, Trash2, MoreVertical, Users, ScrollText, CheckCircle2, XCircle, MinusCircle, Tag, X, Pencil, Copy, Send, Eye, MousePointerClick, Inbox } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export const Route = createFileRoute("/flow/")({
  component: FlowDashboard,
  head: () => ({
    meta: [
      { title: "ManyChat | Automações" },
      { name: "description", content: "Automações de Instagram — comentário em post/reel/story vira DM automática." },
    ],
  }),
});

const LinkMenuItem = createLink(MenuItem);
const LinkBox = createLink(Box);

function FlowDashboard() {
  const [view, setView] = useState<"automacoes" | "contatos" | "logs">("automacoes");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const list = useServerFn(listFlowAutomations);
  const create = useServerFn(createFlowAutomation);
  const del = useServerFn(deleteFlowAutomation);
  const runDuplicate = useServerFn(duplicateFlowAutomation);
  const runUpdate = useServerFn(updateFlowAutomation);
  const runStats = useServerFn(getFlowAutomationsStats);
  const runContacts = useServerFn(listFlowContacts);
  const runLogs = useServerFn(listFlowLogs);
  const runAddTag = useServerFn(addFlowContactTag);
  const runRemoveTag = useServerFn(removeFlowContactTag);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const runDiagnostics = useServerFn(getFlowStatus);

  const { data: diagnostics } = useQuery({
    queryKey: ["flow-diagnostics"],
    queryFn: () => runDiagnostics(),
  });

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["flow-automations"],
    queryFn: () => list(),
    enabled: view === "automacoes",
  });

  const { data: automationsStats = {} } = useQuery({
    queryKey: ["flow-automations-stats"],
    queryFn: () => runStats(),
    enabled: view === "automacoes",
  });

  const { data: contacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ["flow-contacts"],
    queryFn: () => runContacts(),
    enabled: view === "contatos",
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["flow-logs"],
    queryFn: () => runLogs(),
    enabled: view === "logs",
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["flow-automations"] });
      navigate({ to: "/flow/$id", params: { id: a.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow-automations"] });
      toast.success("Automação excluída");
    },
  });

  const toggleStatusMut = useMutation({
    mutationFn: (input: { id: string; status: "active" | "paused" }) => runUpdate({ data: input }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["flow-automations"] });
      toast.success(a.status === "active" ? "Automação ativada" : "Automação pausada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => runDuplicate({ data: { id } }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["flow-automations"] });
      toast.success("Automação duplicada");
      navigate({ to: "/flow/$id", params: { id: a.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTagMut = useMutation({
    mutationFn: (input: { contactId: string; tag: string }) => runAddTag({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flow-contacts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTagMut = useMutation({
    mutationFn: (input: { contactId: string; tag: string }) => runRemoveTag({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flow-contacts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [contacts]);

  const filteredContacts = useMemo(
    () => (tagFilter ? contacts.filter((c) => c.tags.includes(tagFilter)) : contacts),
    [contacts, tagFilter],
  );

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>ManyChat</Typography>
          <Typography variant="body2" color="text.secondary">Fluxos que respondem por você no Instagram — comentário vira DM automática.</Typography>
        </Box>
        {view === "automacoes" && (
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            Nova automação
          </Button>
        )}
      </Stack>

      {diagnostics && (
        <Box sx={{ mt: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
          <Box sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: diagnostics.webhookCount > 0 ? "success.light" : "warning.light" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Status do Webhook</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: diagnostics.webhookCount > 0 ? "success.main" : "warning.main" }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {diagnostics.webhookCount > 0 ? `${diagnostics.webhookCount} eventos recebidos` : "Aguardando primeiro evento..."}
              </Typography>
            </Stack>
          </Box>
          <Box sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: diagnostics.hasCredentials ? "success.light" : "error.light" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Conexão Instagram</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
              {diagnostics.hasCredentials ? "Autenticado e pronto" : "Credenciais ausentes em Configurações"}
            </Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Saúde do Fluxo</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
              {(diagnostics.recentErrors?.length ?? 0) > 0 ? "Existem falhas recentes" : "Nenhum erro reportado"}
            </Typography>
          </Box>
        </Box>
      )}

      {diagnostics && (diagnostics.recentErrors?.length ?? 0) > 0 && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: "error.50", border: "1px solid", borderColor: "error.light" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "error.main", mb: 1 }}>
            <XCircle size={16} />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Problemas de Permissão Detectados</Typography>
          </Stack>
          <Stack spacing={1}>
            {diagnostics.recentErrors?.slice(0, 1).map((e: any, idx: number) => (
              <Box key={idx} sx={{ fontSize: 12, color: "error.main", bgcolor: "rgba(255,255,255,0.5)", p: 1, borderRadius: 1, fontFamily: "monospace" }}>
                {e.message}
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" sx={{ mt: 1, display: "block", color: "error.main", lineHeight: 1.6 }}>
            <strong>Dica de Correção:</strong> O erro "(#3) Capability" geralmente significa que o App da Meta não tem a permissão{" "}
            <code>instagram_manage_messages</code>. Vá ao{" "}
            <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", fontWeight: 700 }}>Meta for Developers</a>,{" "}
            garanta que o produto "Instagram Graph API" está configurado e que todas as permissões de mensagens estão ativas.
          </Typography>
        </Box>
      )}

      <Box sx={{ mt: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Tabs value={view} onChange={(_, v) => setView(v)}>
          <Tab value="automacoes" icon={<MessageSquare size={14} />} iconPosition="start" label="ManyChat" sx={{ minHeight: 40 }} />
          <Tab value="contatos" icon={<Users size={14} />} iconPosition="start" label="Contatos" sx={{ minHeight: 40 }} />
          <Tab value="logs" icon={<ScrollText size={14} />} iconPosition="start" label="Logs" sx={{ minHeight: 40 }} />
        </Tabs>
      </Box>

      {view === "automacoes" && (
        <Box sx={{ mt: 2 }}>
          {isLoading ? (
            <Typography variant="body2" color="text.secondary">Carregando…</Typography>
          ) : automations.length === 0 ? (
            <EmptyState onCreate={() => createMut.mutate()} loading={createMut.isPending} />
          ) : (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", lg: "repeat(3, 1fr)" } }}>
              {automations.map((a) => (
                <AutomationCard
                  key={a.id}
                  a={a}
                  stats={automationsStats[a.id]}
                  onDelete={() => deleteMut.mutate(a.id)}
                  onDuplicate={() => duplicateMut.mutate(a.id)}
                  onToggleStatus={(active) => toggleStatusMut.mutate({ id: a.id, status: active ? "active" : "paused" })}
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      {view === "contatos" && (
        <Box sx={{ mt: 2 }}>
          {loadingContacts ? (
            <Typography variant="body2" color="text.secondary">Carregando…</Typography>
          ) : contacts.length === 0 ? (
            <Box sx={{ mt: 2, border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 8, textAlign: "center", maxWidth: 480, mx: "auto" }}>
              <Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: "primary.50", color: "primary.main", display: "grid", placeItems: "center", mx: "auto", mb: 2 }}>
                <Users size={24} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Sem contatos ainda</Typography>
              <Typography variant="body2" color="text.secondary">Quando alguém for atingido por uma automação, aparece aqui.</Typography>
            </Box>
          ) : (
            <>
              {allTags.length > 0 && (
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
                  <Tag size={14} color="var(--mui-palette-text-secondary, #6f6b7d)" />
                  <Chip
                    size="small"
                    label="Todos"
                    color={tagFilter === null ? "primary" : "default"}
                    variant={tagFilter === null ? "filled" : "outlined"}
                    onClick={() => setTagFilter(null)}
                  />
                  {allTags.map((t) => (
                    <Chip
                      key={t}
                      size="small"
                      label={t}
                      color={tagFilter === t ? "primary" : "default"}
                      variant={tagFilter === t ? "filled" : "outlined"}
                      onClick={() => setTagFilter(t === tagFilter ? null : t)}
                    />
                  ))}
                </Stack>
              )}
              <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Usuário</TableCell>
                      <TableCell>Tags</TableCell>
                      <TableCell>Primeiro contato</TableCell>
                      <TableCell>Último contato</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredContacts.map((c) => (
                      <ContactRow
                        key={c.id}
                        contact={c}
                        onAddTag={(tag) => addTagMut.mutate({ contactId: c.id, tag })}
                        onRemoveTag={(tag) => removeTagMut.mutate({ contactId: c.id, tag })}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      )}

      {view === "logs" && (
        <Box sx={{ mt: 2 }}>
          {loadingLogs ? (
            <Typography variant="body2" color="text.secondary">Carregando…</Typography>
          ) : logs.length === 0 ? (
            <Box sx={{ mt: 2, border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 8, textAlign: "center", maxWidth: 480, mx: "auto" }}>
              <Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: "primary.50", color: "primary.main", display: "grid", placeItems: "center", mx: "auto", mb: 2 }}>
                <ScrollText size={24} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Nenhum disparo ainda</Typography>
              <Typography variant="body2" color="text.secondary">Cada tentativa de envio (sucesso ou erro) aparece aqui.</Typography>
            </Box>
          ) : (
            <Stack sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }} divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
              {logs.map((l) => (
                <Stack key={l.id} direction="row" spacing={2} sx={{ alignItems: "center", p: 2 }}>
                  {l.status === "success" ? (
                    <CheckCircle2 size={20} color="var(--mui-palette-success-main, #28C76F)" style={{ flexShrink: 0 }} />
                  ) : l.status === "error" ? (
                    <XCircle size={20} color="var(--mui-palette-error-main, #EA5455)" style={{ flexShrink: 0 }} />
                  ) : (
                    <MinusCircle size={20} color="var(--mui-palette-text-secondary, #6f6b7d)" style={{ flexShrink: 0 }} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>@{l.ig_username ?? l.ig_user_id ?? "—"}</Typography>
                      <Typography variant="body2" color="text.secondary">·</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>{l.flow_automations?.name ?? "Automação removida"}</Typography>
                      {l.matched_keyword && (
                        <Chip size="small" label={l.matched_keyword} sx={{ fontFamily: "monospace", fontSize: 11 }} />
                      )}
                    </Stack>
                    {l.error_message && <Typography variant="caption" color="error" noWrap sx={{ display: "block", mt: 0.25 }}>{l.error_message}</Typography>}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {formatDistanceToNow(new Date(l.created_at), { locale: ptBR, addSuffix: true })}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  );
}

function AutomationCard({
  a,
  stats,
  onDelete,
  onDuplicate,
  onToggleStatus,
}: {
  a: FlowAutomation;
  stats?: FlowAutomationStats | undefined;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleStatus: (active: boolean) => void;
}) {
  const s = stats ?? { sent: 0, delivered: 0, opened: 0, clicked: 0 };
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  return (
    <Box sx={{ position: "relative", borderRadius: 3, border: "1px solid", borderColor: "divider", p: 2.5, "&:hover": { boxShadow: 2 } }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: "primary.50", color: "primary.main", display: "grid", placeItems: "center" }}>
          <MessageSquare size={16} />
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <StatusBadge status={a.status} />
          <Switch
            size="small"
            checked={a.status === "active"}
            onChange={(e) => onToggleStatus(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            title={a.status === "active" ? "Pausar automação" : "Ativar automação"}
          />
          <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
            <MoreVertical size={16} />
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <LinkMenuItem to="/flow/$id" params={{ id: a.id }} onClick={() => setAnchorEl(null)}>
              <ListItemIcon><Pencil size={16} /></ListItemIcon>
              Editar
            </LinkMenuItem>
            <MenuItem onClick={() => { setAnchorEl(null); onDuplicate(); }}>
              <ListItemIcon><Copy size={16} /></ListItemIcon>
              Duplicar
            </MenuItem>
            <MenuItem sx={{ color: "error.main" }} onClick={() => { setAnchorEl(null); onDelete(); }}>
              <ListItemIcon><Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" /></ListItemIcon>
              Excluir
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>

      <LinkBox to="/flow/$id" params={{ id: a.id }} sx={{ display: "block", textDecoration: "none", color: "inherit" }}>
        <Typography sx={{ fontWeight: 600, mb: 0.5 }} noWrap>{a.name}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          {a.keywords.length > 0
            ? a.keywords.slice(0, 3).map((k) => `"${k}"`).join(", ")
            : a.match_any_comment
              ? "Qualquer comentário"
              : "Sem palavras-chave"}
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5, textAlign: "center", py: 1.5, borderRadius: 2, bgcolor: "action.hover", mb: 1.5 }}>
          <StatCell icon={Send} label="Enviado" value={s.sent} />
          <StatCell icon={Inbox} label="Entregue" value={s.delivered} />
          <StatCell icon={Eye} label="Aberto" value={s.opened} />
          <StatCell icon={MousePointerClick} label="Clicado" value={s.clicked} />
        </Box>

        <Stack direction="row" sx={{ justifyContent: "space-between", pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary">{a.dispatch_count} disparos</Typography>
          <Typography variant="caption" color="text.secondary">Editado {formatDistanceToNow(new Date(a.updated_at), { locale: ptBR, addSuffix: true })}</Typography>
        </Stack>
      </LinkBox>
    </Box>
  );
}

function StatCell({ icon: Icon, label, value }: { icon: typeof Send; label: string; value: number }) {
  return (
    <Stack spacing={0.25} sx={{ alignItems: "center" }}>
      <Icon size={12} color="var(--mui-palette-text-secondary, #6f6b7d)" />
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}</Typography>
      <Typography sx={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>{label}</Typography>
    </Stack>
  );
}

function ContactRow({
  contact,
  onAddTag,
  onRemoveTag,
}: {
  contact: FlowContact;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  function submit() {
    const tag = value.trim();
    if (tag) onAddTag(tag);
    setValue("");
    setAdding(false);
  }

  return (
    <TableRow>
      <TableCell sx={{ verticalAlign: "top", fontWeight: 600 }}>
        {contact.username ? (
          <Box component="a" href={`https://instagram.com/${contact.username}`} target="_blank" rel="noopener noreferrer" sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
            @{contact.username}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">@{contact.ig_user_id}</Typography>
        )}
      </TableCell>
      <TableCell sx={{ verticalAlign: "top" }}>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
          {contact.tags.map((t) => (
            <Chip key={t} size="small" label={t} onDelete={() => onRemoveTag(t)} deleteIcon={<X size={12} />} />
          ))}
          {adding ? (
            <TextField
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setValue("");
                  setAdding(false);
                }
              }}
              onBlur={submit}
              placeholder="tag…"
              size="small"
              sx={{ width: 100, "& .MuiInputBase-input": { fontSize: 12, py: 0.5 } }}
            />
          ) : (
            <IconButton size="small" onClick={() => setAdding(true)} title="Adicionar tag" sx={{ border: "1px dashed", borderColor: "divider" }}>
              <Plus size={12} />
            </IconButton>
          )}
        </Stack>
      </TableCell>
      <TableCell sx={{ verticalAlign: "top", color: "text.secondary" }}>
        {formatDistanceToNow(new Date(contact.first_seen_at), { locale: ptBR, addSuffix: true })}
      </TableCell>
      <TableCell sx={{ verticalAlign: "top", color: "text.secondary" }}>
        {formatDistanceToNow(new Date(contact.last_seen_at), { locale: ptBR, addSuffix: true })}
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: FlowAutomation["status"] }) {
  if (status === "active") return <Chip size="small" color="success" label="Ativa" />;
  if (status === "paused") return <Chip size="small" variant="outlined" label="Pausada" />;
  return <Chip size="small" label="Rascunho" />;
}

function EmptyState({ onCreate, loading }: { onCreate: () => void; loading: boolean }) {
  return (
    <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 8, textAlign: "center", maxWidth: 480, mx: "auto", mt: 4 }}>
      <Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: "primary.50", color: "primary.main", display: "grid", placeItems: "center", mx: "auto", mb: 2 }}>
        <MessageSquare size={24} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Nenhuma automação ainda</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Crie um fluxo: alguém comenta no seu Reel → recebe DM automática com o link.
      </Typography>
      <Button variant="contained" startIcon={<Plus size={16} />} onClick={onCreate} disabled={loading}>
        Criar primeira automação
      </Button>
    </Box>
  );
}
