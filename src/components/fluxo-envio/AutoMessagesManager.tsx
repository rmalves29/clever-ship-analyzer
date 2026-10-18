import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, Loader2, MessageSquare, Pencil, Plus, Trash2, Upload, UserMinus, UserPlus, X } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  listEnvioAutoMessages,
  createEnvioAutoMessage,
  updateEnvioAutoMessage,
  deleteEnvioAutoMessage,
  listEnvioReturnAutomations,
  createEnvioReturnAutomation,
  updateEnvioReturnAutomation,
  deleteEnvioReturnAutomation,
  getEnvioReturnStats,
  getEnvioAutomationOptions,
} from "@/lib/envio-auto-messages.functions";
import { createEnvioMediaUpload } from "@/lib/envio-fe-messages.functions";
import { uploadEnvioFile } from "./SequenceSteps";

type ScopeType = "all" | "group" | "campaign";

type JoinForm = { content_type: "text" | "image"; content_text: string; media_url: string; scope_type: ScopeType; scope_id: string };
type LeaveForm = {
  name: string;
  scope_type: "group" | "campaign";
  scope_ids: string[];
  invite_message: string;
  reward_message: string;
  coupon_code: string;
  validity_days: number;
  cooldown_hours: number;
  is_active: boolean;
  /** Preservado na edição (o painel do Cartzy não expõe este campo). */
  delay_minutes: number;
};

const defaultJoin: JoinForm = { content_type: "text", content_text: "", media_url: "", scope_type: "all", scope_id: "" };
const defaultLeave: LeaveForm = {
  name: "",
  scope_type: "group",
  scope_ids: [],
  invite_message: "Olá {nome}, sentimos sua falta no grupo *{grupo}*! 💛\nVolte agora pelo link e libere um cupom especial:\n{link_grupo}",
  reward_message: "Que bom te ver de volta, {nome}! 🎉\nAqui está seu cupom exclusivo: *{cupom}*",
  coupon_code: "",
  validity_days: 7,
  cooldown_hours: 24,
  is_active: true,
  delay_minutes: 0,
};

export function AutoMessagesManager() {
  const qc = useQueryClient();
  const listJoin = useServerFn(listEnvioAutoMessages);
  const createJoin = useServerFn(createEnvioAutoMessage);
  const updateJoin = useServerFn(updateEnvioAutoMessage);
  const deleteJoin = useServerFn(deleteEnvioAutoMessage);
  const listLeave = useServerFn(listEnvioReturnAutomations);
  const createLeave = useServerFn(createEnvioReturnAutomation);
  const updateLeave = useServerFn(updateEnvioReturnAutomation);
  const deleteLeave = useServerFn(deleteEnvioReturnAutomation);
  const getStats = useServerFn(getEnvioReturnStats);
  const getOptions = useServerFn(getEnvioAutomationOptions);
  const prepareUpload = useServerFn(createEnvioMediaUpload);

  const { data: joinMessages, isLoading: loadingJoin, isError, error: loadError } = useQuery({ queryKey: ["envio-auto-messages"], queryFn: () => listJoin() });
  const { data: returnAutos } = useQuery({ queryKey: ["envio-return-automations"], queryFn: () => listLeave() });
  const { data: stats } = useQuery({ queryKey: ["envio-return-stats"], queryFn: () => getStats(), refetchInterval: 30_000 });
  const { data: options } = useQuery({ queryKey: ["envio-automation-options"], queryFn: () => getOptions() });
  const groups = options?.groups ?? [];
  const campaigns = options?.campaigns ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventType, setEventType] = useState<"join" | "leave">("join");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [joinForm, setJoinForm] = useState<JoinForm>({ ...defaultJoin });
  const [leaveForm, setLeaveForm] = useState<LeaveForm>({ ...defaultLeave });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["envio-auto-messages"] });
    qc.invalidateQueries({ queryKey: ["envio-return-automations"] });
    qc.invalidateQueries({ queryKey: ["envio-return-stats"] });
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  const openCreate = () => {
    setEditingId(null);
    setEventType("join");
    setJoinForm({ ...defaultJoin });
    setLeaveForm({ ...defaultLeave });
    setDialogOpen(true);
  };

  const openEditJoin = (m: NonNullable<typeof joinMessages>[number]) => {
    setEditingId(m.id);
    setEventType("join");
    const scope_type: ScopeType = m.campaign_id ? "campaign" : m.group_id ? "group" : "all";
    setJoinForm({
      content_type: m.content_type === "image" ? "image" : "text",
      content_text: m.content_text ?? "",
      media_url: m.media_url ?? "",
      scope_type,
      scope_id: m.campaign_id ?? m.group_id ?? "",
    });
    setDialogOpen(true);
  };

  const openEditLeave = (a: NonNullable<typeof returnAutos>[number]) => {
    setEditingId(a.id);
    setEventType("leave");
    const useCampaigns = (a.campaign_ids?.length ?? 0) > 0;
    setLeaveForm({
      name: a.name,
      scope_type: useCampaigns ? "campaign" : "group",
      scope_ids: useCampaigns ? (a.campaign_ids ?? []) : (a.group_ids ?? []),
      invite_message: a.invite_message,
      reward_message: a.reward_message,
      coupon_code: a.coupon_code,
      validity_days: a.validity_days,
      cooldown_hours: a.cooldown_hours,
      is_active: a.is_active,
      delay_minutes: a.delay_minutes,
    });
    setDialogOpen(true);
  };

  const handleImage = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) return void toast.error("Formato inválido. Use JPG, PNG, WebP ou GIF.");
    if (file.size > 5 * 1024 * 1024) return void toast.error("Arquivo muito grande (máximo 5 MB).");
    setUploading(true);
    try {
      const url = await uploadEnvioFile((f) => prepareUpload({ data: { fileName: f.name, size: f.size } }), file);
      setJoinForm((p) => ({ ...p, media_url: url }));
      toast.success("Imagem enviada!");
    } catch (e: any) {
      toast.error("Erro no upload: " + (e?.message ?? "falha desconhecida"));
    } finally {
      setUploading(false);
    }
  };

  const saveJoinMut = useMutation({
    mutationFn: async () => {
      const payload = {
        group_id: joinForm.scope_type === "group" ? joinForm.scope_id : null,
        campaign_id: joinForm.scope_type === "campaign" ? joinForm.scope_id : null,
        content_type: joinForm.content_type,
        content_text: joinForm.content_text,
        media_url: joinForm.media_url || null,
      };
      if (editingId) return updateJoin({ data: { id: editingId, ...payload } });
      return createJoin({ data: { ...payload, event_type: "join", is_active: true } });
    },
    onSuccess: () => {
      toast.success("Salvo");
      closeDialog();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveLeaveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: leaveForm.name.trim(),
        group_ids: leaveForm.scope_type === "group" ? leaveForm.scope_ids : [],
        campaign_ids: leaveForm.scope_type === "campaign" ? leaveForm.scope_ids : [],
        delay_minutes: leaveForm.delay_minutes,
        invite_message: leaveForm.invite_message,
        reward_message: leaveForm.reward_message,
        coupon_code: leaveForm.coupon_code.trim(),
        validity_days: leaveForm.validity_days,
        cooldown_hours: leaveForm.cooldown_hours,
        is_active: leaveForm.is_active,
      };
      if (editingId) return updateLeave({ data: { id: editingId, ...payload } });
      return createLeave({ data: payload });
    },
    onSuccess: () => {
      toast.success("Salvo");
      closeDialog();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = () => {
    if (eventType === "join") {
      if (!joinForm.content_text.trim()) return void toast.error("Preencha o texto");
      if (joinForm.content_type === "image" && !joinForm.media_url) return void toast.error("Anexe uma imagem");
      if (joinForm.scope_type !== "all" && !joinForm.scope_id) return void toast.error("Selecione o escopo");
      saveJoinMut.mutate();
    } else {
      if (!leaveForm.name.trim() || leaveForm.scope_ids.length === 0 || !leaveForm.invite_message.trim() || !leaveForm.reward_message.trim()) {
        return void toast.error("Preencha nome, escopo e mensagens");
      }
      saveLeaveMut.mutate();
    }
  };

  const toggleJoinMut = useMutation({ mutationFn: (m: { id: string; is_active: boolean }) => updateJoin({ data: m }), onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const toggleLeaveMut = useMutation({ mutationFn: (a: { id: string; is_active: boolean }) => updateLeave({ data: a }), onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const removeJoinMut = useMutation({ mutationFn: (id: string) => deleteJoin({ data: { id } }), onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const removeLeaveMut = useMutation({ mutationFn: (id: string) => deleteLeave({ data: { id } }), onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });

  const joinScopeLabel = (m: NonNullable<typeof joinMessages>[number]) => {
    if (m.campaign_id) return `Campanha: ${campaigns.find((c) => c.id === m.campaign_id)?.name ?? ""}`;
    if (m.group_id) return groups.find((g) => g.id === m.group_id)?.group_name ?? "Grupo";
    return "Todos os grupos";
  };

  const left = stats?.leftTotal ?? 0;
  const returned = stats?.rewardedTotal ?? 0;
  const busy = saveJoinMut.isPending || saveLeaveMut.isPending || uploading;

  if (loadingJoin) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
        Carregando…
      </Typography>
    );
  }

  return (
    <Stack spacing={3} sx={{ py: 2 }}>
      {isError && <Typography color="error">Não consegui carregar as automações: {(loadError as Error | null)?.message ?? "erro desconhecido"}</Typography>}
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Automações
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Boas-vindas (entrada) e reengajamento com cupom (saída/retorno)
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={openCreate}>
          Nova automação
        </Button>
      </Stack>

      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <UserPlus size={16} />
          <Typography sx={{ fontWeight: 600 }}>Mensagens de entrada</Typography>
        </Stack>
        {(joinMessages ?? []).length === 0 ? (
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 3, textAlign: "center", color: "text.secondary" }}>
            <MessageSquare size={30} style={{ opacity: 0.4 }} />
            <Typography variant="body2">Nenhuma mensagem de boas-vindas configurada.</Typography>
          </Box>
        ) : (
          (joinMessages ?? []).map((m) => (
            <Stack key={m.id} direction="row" spacing={1.5} sx={{ alignItems: "flex-start", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
                  <Chip size="small" color="primary" label="Entrada" />
                  <Chip size="small" variant="outlined" label={joinScopeLabel(m)} />
                  {m.content_type === "image" && <Chip size="small" variant="outlined" label="Imagem + legenda" />}
                </Stack>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {m.content_text}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
                <IconButton size="small" onClick={() => openEditJoin(m)}>
                  <Pencil size={15} />
                </IconButton>
                <Switch size="small" checked={m.is_active} onChange={(e) => toggleJoinMut.mutate({ id: m.id, is_active: e.target.checked })} />
                <IconButton
                  size="small"
                  onClick={() => {
                    if (confirm("Remover?")) removeJoinMut.mutate(m.id);
                  }}
                >
                  <Trash2 size={15} color="var(--mui-palette-error-main, #EA5455)" />
                </IconButton>
              </Stack>
            </Stack>
          ))
        )}
      </Stack>

      <Grid container spacing={1.5}>
        {[
          { icon: <UserMinus size={14} color="var(--mui-palette-error-main)" />, label: "Clientes que saíram", value: String(left) },
          { icon: <UserPlus size={14} color="var(--mui-palette-primary-main)" />, label: "Clientes que retornaram", value: String(returned) },
          { icon: <Gift size={14} color="var(--mui-palette-primary-main)" />, label: "Sucesso de retorno", value: `${left > 0 ? ((returned / left) * 100).toFixed(1) : "0.0"}%` },
        ].map((card) => (
          <Grid key={card.label} size={{ xs: 12, sm: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary", mb: 0.5 }}>
                {card.icon}
                <Typography variant="caption">{card.label}</Typography>
              </Stack>
              <Typography sx={{ fontWeight: 700, fontSize: 24 }}>{card.value}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <UserMinus size={16} color="var(--mui-palette-error-main)" />
          <Typography sx={{ fontWeight: 600 }}>Retorno após saída (com cupom)</Typography>
        </Stack>
        {(returnAutos ?? []).length === 0 ? (
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 3, textAlign: "center", color: "text.secondary" }}>
            <Gift size={30} style={{ opacity: 0.4 }} />
            <Typography variant="body2">Nenhuma automação de retorno configurada.</Typography>
          </Box>
        ) : (
          (returnAutos ?? []).map((a) => {
            const inCampaigns = (a.campaign_ids?.length ?? 0) > 0;
            const names = (inCampaigns
              ? a.campaign_ids.map((id) => campaigns.find((c) => c.id === id)?.name)
              : a.group_ids.map((id) => groups.find((g) => g.id === id)?.group_name)
            ).filter(Boolean);
            return (
              <Stack key={a.id} direction="row" spacing={1.5} sx={{ alignItems: "flex-start", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap", rowGap: 0.5, alignItems: "center" }}>
                    <Chip size="small" color="error" label="Saída → Retorno" />
                    <Chip size="small" variant="outlined" label={`${inCampaigns ? "Campanhas" : "Grupos"}: ${names.join(", ") || "—"}`} />
                    {a.coupon_code && <Chip size="small" icon={<Gift size={12} />} label={a.coupon_code} />}
                    <Typography variant="caption" color="text.secondary">
                      Validade {a.validity_days}d · Cooldown {a.cooldown_hours}h
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {a.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.invite_message}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
                  <IconButton size="small" onClick={() => openEditLeave(a)}>
                    <Pencil size={15} />
                  </IconButton>
                  <Switch size="small" checked={a.is_active} onChange={(e) => toggleLeaveMut.mutate({ id: a.id, is_active: e.target.checked })} />
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (confirm("Remover? Convites pendentes serão cancelados.")) removeLeaveMut.mutate(a.id);
                    }}
                  >
                    <Trash2 size={15} color="var(--mui-palette-error-main, #EA5455)" />
                  </IconButton>
                </Stack>
              </Stack>
            );
          })
        )}
      </Stack>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { maxHeight: "90vh" } } }}>
        <DialogTitle>{editingId ? "Editar automação" : "Nova automação"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <FormControl fullWidth size="small">
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                Evento
              </Typography>
              <Select value={eventType} disabled={Boolean(editingId)} onChange={(e) => setEventType(e.target.value as "join" | "leave")}>
                <MenuItem value="join">Entrada (boas-vindas no grupo)</MenuItem>
                <MenuItem value="leave">Saída (convite privado de retorno + cupom)</MenuItem>
              </Select>
            </FormControl>

            {eventType === "join" && (
              <>
                <FormControl fullWidth size="small">
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                    Escopo
                  </Typography>
                  <Select value={joinForm.scope_type} onChange={(e) => setJoinForm((p) => ({ ...p, scope_type: e.target.value as ScopeType, scope_id: "" }))}>
                    <MenuItem value="all">Todos os grupos</MenuItem>
                    <MenuItem value="group">Grupo específico</MenuItem>
                    <MenuItem value="campaign">Campanha específica</MenuItem>
                  </Select>
                </FormControl>
                {joinForm.scope_type === "group" && (
                  <FormControl fullWidth size="small">
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                      Grupo
                    </Typography>
                    <Select displayEmpty value={joinForm.scope_id} onChange={(e) => setJoinForm((p) => ({ ...p, scope_id: e.target.value }))}>
                      <MenuItem value="" disabled>
                        Selecione
                      </MenuItem>
                      {groups.map((g) => (
                        <MenuItem key={g.id} value={g.id}>
                          {g.group_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                {joinForm.scope_type === "campaign" && (
                  <FormControl fullWidth size="small">
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                      Campanha
                    </Typography>
                    <Select displayEmpty value={joinForm.scope_id} onChange={(e) => setJoinForm((p) => ({ ...p, scope_id: e.target.value }))}>
                      <MenuItem value="" disabled>
                        Selecione
                      </MenuItem>
                      {campaigns.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <FormControl fullWidth size="small">
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                    Tipo de conteúdo
                  </Typography>
                  <Select value={joinForm.content_type} onChange={(e) => setJoinForm((p) => ({ ...p, content_type: e.target.value as "text" | "image" }))}>
                    <MenuItem value="text">Texto</MenuItem>
                    <MenuItem value="image">Imagem + legenda</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={4}
                  label="Texto"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={joinForm.content_text}
                  onChange={(e) => setJoinForm((p) => ({ ...p, content_text: e.target.value }))}
                  helperText="Variáveis: {{phone}}, {{group}}"
                />
                {joinForm.content_type === "image" && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Imagem
                    </Typography>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void handleImage(f);
                      }}
                    />
                    {joinForm.media_url ? (
                      <Box sx={{ position: "relative", border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden", mt: 0.5 }}>
                        <img src={joinForm.media_url} alt="" style={{ width: "100%", height: 128, objectFit: "cover", display: "block" }} />
                        <IconButton size="small" sx={{ position: "absolute", top: 8, right: 8, bgcolor: "background.paper" }} onClick={() => setJoinForm((p) => ({ ...p, media_url: "" }))}>
                          <X size={15} />
                        </IconButton>
                      </Box>
                    ) : (
                      <Button fullWidth variant="outline" sx={{ mt: 0.5, height: 96, borderStyle: "dashed", flexDirection: "column", gap: 0.5 }} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                        {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        <span>{uploading ? "Enviando..." : "Enviar imagem"}</span>
                      </Button>
                    )}
                  </Box>
                )}
              </>
            )}

            {eventType === "leave" && (
              <>
                <TextField fullWidth size="small" label="Nome da automação" slotProps={{ inputLabel: { shrink: true } }} value={leaveForm.name} onChange={(e) => setLeaveForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: Volta VIP" />
                <FormControl fullWidth size="small">
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                    Aplicar em
                  </Typography>
                  <Select value={leaveForm.scope_type} onChange={(e) => setLeaveForm((p) => ({ ...p, scope_type: e.target.value as "group" | "campaign", scope_ids: [] }))}>
                    <MenuItem value="group">Grupos</MenuItem>
                    <MenuItem value="campaign">Campanhas</MenuItem>
                  </Select>
                </FormControl>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {leaveForm.scope_type === "group" ? "Grupos (onde você é admin)" : "Campanhas"}
                  </Typography>
                  <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 0.5, maxHeight: 160, overflowY: "auto", mt: 0.5 }}>
                    {(leaveForm.scope_type === "group" ? groups.map((g) => ({ id: g.id, label: g.group_name })) : campaigns.map((c) => ({ id: c.id, label: c.name }))).map((item) => (
                      <FormControlLabel
                        key={item.id}
                        sx={{ display: "flex", m: 0, px: 0.5, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
                        control={
                          <Checkbox
                            size="small"
                            checked={leaveForm.scope_ids.includes(item.id)}
                            onChange={() => setLeaveForm((f) => ({ ...f, scope_ids: f.scope_ids.includes(item.id) ? f.scope_ids.filter((x) => x !== item.id) : [...f.scope_ids, item.id] }))}
                          />
                        }
                        label={<Typography variant="body2">{item.label}</Typography>}
                      />
                    ))}
                    {(leaveForm.scope_type === "group" ? groups : campaigns).length === 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: "block" }}>
                        {leaveForm.scope_type === "group" ? "Nenhum grupo admin ativo" : "Nenhuma campanha"}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={6}>
                    <TextField fullWidth size="small" type="number" label="Validade (dias)" slotProps={{ htmlInput: { min: 1 }, inputLabel: { shrink: true } }} value={leaveForm.validity_days} onChange={(e) => setLeaveForm((p) => ({ ...p, validity_days: parseInt(e.target.value) || 7 }))} />
                  </Grid>
                  <Grid size={6}>
                    <TextField fullWidth size="small" type="number" label="Cooldown (horas)" slotProps={{ htmlInput: { min: 0 }, inputLabel: { shrink: true } }} value={leaveForm.cooldown_hours} onChange={(e) => setLeaveForm((p) => ({ ...p, cooldown_hours: Math.max(0, parseInt(e.target.value) || 0) }))} />
                  </Grid>
                </Grid>
                <TextField fullWidth size="small" label="Cupom (texto que entra em {cupom})" slotProps={{ inputLabel: { shrink: true } }} value={leaveForm.coupon_code} onChange={(e) => setLeaveForm((p) => ({ ...p, coupon_code: e.target.value }))} placeholder="Ex: VOLTEI10" helperText="Opcional. O Cartzy só coloca este texto na mensagem de recompensa; o cupom precisa existir na loja." />
                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={4}
                  label="Mensagem de convite (privada, envio imediato)"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={leaveForm.invite_message}
                  onChange={(e) => setLeaveForm((p) => ({ ...p, invite_message: e.target.value }))}
                  helperText="Variáveis: {nome}, {grupo}, {link_grupo} · Envios respeitam limite de 1 msg / 5s."
                />
                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={3}
                  label="Mensagem de recompensa (quando o cliente voltar)"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={leaveForm.reward_message}
                  onChange={(e) => setLeaveForm((p) => ({ ...p, reward_message: e.target.value }))}
                  helperText="Variáveis: {nome}, {cupom}, {grupo}"
                />
                <FormControlLabel control={<Switch checked={leaveForm.is_active} onChange={(e) => setLeaveForm((p) => ({ ...p, is_active: e.target.checked }))} />} label="Ativa" />
              </>
            )}

            <Button fullWidth variant="contained" disabled={busy} onClick={save}>
              {editingId ? "Salvar alterações" : "Criar"}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
