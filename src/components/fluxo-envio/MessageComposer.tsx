import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Clock, Eye, Loader2, Pencil, Plus, Send, ThumbsDown, ThumbsUp, Trash2, Upload, X } from "lucide-react";
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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";
import {
  getEnvioComposerData,
  sendEnvioMessages,
  cancelEnvioScheduledMessages,
  updateEnvioPendingMessage,
  createEnvioMediaUpload,
} from "@/lib/envio-fe-messages.functions";
import { listRecentEnvioMessages, submitMessageFeedback, getRecentMessageFeedback } from "@/lib/envio-messages.functions";
import { checkVideoNoteFile } from "@/lib/video-note-check";
import { SequenceSteps, TypeIcon, TYPE_LABELS, ACCEPT, uploadEnvioFile, cleanStepPoll, stepDelaySeconds, validateStep, type SeqStep, type StepType } from "./SequenceSteps";

const STATUS_LABEL: Record<string, string> = { pending: "Agendada", sending: "Enviando", sent: "Enviada", failed: "Falhou" };
const STATUS_COLOR: Record<string, ChipProps["color"]> = { pending: "warning", sending: "primary", sent: "success", failed: "error" };
const TZ = "America/Sao_Paulo";

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: TZ });
const fmtShort = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Traduz o erro do provedor de WhatsApp para algo que o lojista entende.
function friendlyError(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (t.includes("not participating")) return "O número de WhatsApp conectado não participa mais deste grupo (saiu ou foi removido). Entre de novo no grupo ou atualize a lista de grupos.";
  if (t.includes("not admin") || t.includes("forbidden") || t.includes("not-authorized")) return "O número conectado não tem permissão para enviar neste grupo (precisa ser administrador).";
  if (t.includes("rate") || t.includes("429")) return "O WhatsApp limitou os envios por excesso de mensagens seguidas. Tente novamente mais tarde.";
  if (t.includes("disconnected") || t.includes("not connected")) return "O WhatsApp está desconectado. Reconecte na aba Conexão.";
  return raw;
}

export function MessageComposer() {
  const qc = useQueryClient();
  const loadData = useServerFn(getEnvioComposerData);
  const send = useServerFn(sendEnvioMessages);
  const cancel = useServerFn(cancelEnvioScheduledMessages);
  const updatePending = useServerFn(updateEnvioPendingMessage);
  const prepareUpload = useServerFn(createEnvioMediaUpload);

  const { data, isError, error: loadError } = useQuery({ queryKey: ["envio-composer"], queryFn: () => loadData(), refetchInterval: 5000 });
  const groups = data?.groups ?? [];
  const campaigns = data?.campaigns ?? [];
  const messages = data?.messages ?? [];
  const scheduledMsgs = data?.scheduled ?? [];

  const [contentType, setContentType] = useState<StepType>("text");
  const [contentText, setContentText] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaName, setMediaName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sendMode, setSendMode] = useState<"instant" | "scheduled">("instant");
  const [scheduledAt, setScheduledAt] = useState("");
  const [targetType, setTargetType] = useState<"groups" | "campaign">("groups");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [groupSort, setGroupSort] = useState<"name" | "last_sent">("name");
  const [groupSearch, setGroupSearch] = useState("");
  const [extraSteps, setExtraSteps] = useState<SeqStep[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMessage, setViewMessage] = useState<(typeof messages)[number] | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["envio-composer"] });

  const resetPoll = () => {
    setPollOptions(["", ""]);
    setPollMultiple(false);
  };
  const clearMedia = () => {
    setMediaUrl("");
    setMediaName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const cleanPoll = () => pollOptions.map((o) => o.trim()).filter(Boolean);

  const validatePoll = (): boolean => {
    const opts = cleanPoll();
    if (!contentText.trim()) {
      toast.error("Escreva a pergunta da enquete");
      return false;
    }
    if (opts.length < 2) {
      toast.error("A enquete precisa de pelo menos 2 opções");
      return false;
    }
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) {
      toast.error("Há opções repetidas na enquete");
      return false;
    }
    return true;
  };

  const handleFile = async (file: File) => {
    // Vídeo redondo: bloqueia arquivo pesado ou em HEVC antes de subir (senão chega em branco no WhatsApp)
    if (contentType === "video_note") {
      const problem = await checkVideoNoteFile(file);
      if (problem) {
        toast.error(`Vídeo não serve para vídeo redondo. ${problem}`);
        return;
      }
    }
    setUploading(true);
    setMediaName(file.name);
    try {
      const url = await uploadEnvioFile((f) => prepareUpload({ data: { fileName: f.name, size: f.size } }), file);
      setMediaUrl(url);
      toast.success("Arquivo enviado com sucesso");
    } catch (e: any) {
      toast.error("Erro ao enviar arquivo: " + (e?.message ?? "falha desconhecida"));
      clearMedia();
    } finally {
      setUploading(false);
    }
  };

  const sendMut = useMutation({
    mutationFn: async () => {
      const scheduledIso = sendMode === "scheduled" ? new Date(scheduledAt).toISOString() : undefined;
      return send({
        data: {
          contentType,
          contentText: contentText || undefined,
          mediaUrl: mediaUrl || undefined,
          ...(contentType === "poll" ? { pollOptions: cleanPoll(), pollMultiple } : {}),
          ...(targetType === "campaign" ? { campaignId: selectedCampaignId } : { groupIds: selectedGroupIds }),
          ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
          extraSteps: extraSteps.map((st) => ({
            contentType: st.contentType,
            text: st.text || undefined,
            mediaUrl: st.mediaUrl || undefined,
            ...(st.contentType === "poll" ? { pollOptions: cleanStepPoll(st), pollMultiple: st.pollMultiple } : {}),
            delaySeconds: stepDelaySeconds(st),
          })),
        },
      });
    },
    onSuccess: (r) => {
      toast.success(
        r.scheduled ? (r.sequence ? "Sequência agendada!" : "Mensagens agendadas!") : r.sequence ? "Sequência iniciada!" : "Mensagens enviadas!",
      );
      setExtraSteps([]);
      setContentText("");
      resetPoll();
      clearMedia();
      setSelectedGroupIds([]);
      invalidate();
    },
    onError: (e: Error) => toast.error("Erro ao enviar: " + e.message),
    onSettled: () => {
      sendingRef.current = false;
    },
  });

  const handleSend = () => {
    // Trava imediata contra clique duplo (o estado do botão demora um render para refletir)
    if (sendingRef.current) return;
    if (contentType === "text" && !contentText.trim()) return void toast.error("Escreva uma mensagem");
    if (contentType === "poll") {
      if (!validatePoll()) return;
    } else if (contentType !== "text" && !mediaUrl) {
      return void toast.error("Anexe um arquivo para enviar");
    }
    for (let i = 0; i < extraSteps.length; i++) {
      const err = validateStep(extraSteps[i]!, i);
      if (err) return void toast.error(err);
    }
    if (targetType === "groups" && selectedGroupIds.length === 0) return void toast.error("Selecione pelo menos um grupo");
    if (targetType === "campaign" && !selectedCampaignId) return void toast.error("Selecione uma campanha");
    // Antes, "Agendado" sem data enviava na hora sem avisar.
    if (sendMode === "scheduled" && (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime()))) return void toast.error("Defina data/hora do agendamento");
    sendingRef.current = true;
    sendMut.mutate();
  };

  const cancelMut = useMutation({
    mutationFn: (ids: string[]) => cancel({ data: { ids } }),
    onSuccess: (r, ids) => {
      if (r.cancelled === 0) toast.error("A mensagem já começou a ser enviada");
      else toast.success(`${r.cancelled} envio(s) cancelado(s)`);
      setConfirmBatch(null);
      if (viewMessage && ids.includes(viewMessage.id)) setViewMessage(null);
      invalidate();
    },
    onError: (e: Error) => toast.error("Erro ao cancelar: " + e.message),
  });

  const startEdit = (m: (typeof messages)[number]) => {
    setEditingId(m.id);
    setContentType(m.content_type);
    setContentText(m.content_text ?? "");
    setMediaUrl(m.media_url ?? "");
    setMediaName(m.media_url ? "arquivo já anexado" : "");
    if (m.content_type === "poll") {
      const opts = Array.isArray(m.poll_options) ? m.poll_options : [];
      setPollOptions(opts.length >= 2 ? opts : ["", ""]);
      setPollMultiple((m.poll_selectable_count ?? 1) > 1);
    } else resetPoll();
    setSendMode(m.scheduled_at ? "scheduled" : "instant");
    if (m.scheduled_at) {
      const d = new Date(m.scheduled_at);
      setScheduledAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    toast.info("Editando mensagem pendente");
  };

  const stopEdit = () => {
    setEditingId(null);
    setContentText("");
    resetPoll();
    clearMedia();
  };

  const saveEditMut = useMutation({
    mutationFn: () =>
      updatePending({
        data: {
          id: editingId!,
          contentType,
          contentText: contentText || undefined,
          mediaUrl: mediaUrl || undefined,
          ...(contentType === "poll" ? { pollOptions: cleanPoll(), pollMultiple } : {}),
          scheduledAt: sendMode === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      }),
    onSuccess: (r) => {
      if (!r.updated) toast.error("A mensagem já começou a ser enviada");
      else toast.success("Mensagem atualizada!");
      stopEdit();
      invalidate();
    },
    onError: (e: Error) => toast.error("Erro ao salvar: " + e.message),
  });

  // Agrupa agendados iguais (mesmo horário, texto e campanha) para cancelar um lote de uma vez.
  const scheduledBatches = useMemo(() => {
    const map = new Map<string, { key: string; scheduled_at: string; text: string; type: StepType; step: number; delay: number; ids: string[]; groupIds: string[] }>();
    for (const m of scheduledMsgs) {
      const key = [m.scheduled_at, m.campaign_id || "", m.content_type, m.sequence_step || 1, (m.content_text || "").slice(0, 80)].join("|");
      const b = map.get(key) ?? { key, scheduled_at: m.scheduled_at, text: m.content_text || "", type: m.content_type as StepType, step: m.sequence_step || 1, delay: m.delay_seconds || 0, ids: [], groupIds: [] };
      b.ids.push(m.id);
      if (m.group_id) b.groupIds.push(m.group_id);
      map.set(key, b);
    }
    return Array.from(map.values()).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [scheduledMsgs]);

  const visibleGroups = useMemo(
    () =>
      groups
        .filter((g) => (g.group_name || "").toLowerCase().includes(groupSearch.trim().toLowerCase()))
        .sort((a, b) => {
          if (groupSort === "name") return a.group_name.localeCompare(b.group_name);
          const ta = a.last_sent_at ? new Date(a.last_sent_at).getTime() : 0;
          const tb = b.last_sent_at ? new Date(b.last_sent_at).getTime() : 0;
          return tb - ta;
        }),
    [groups, groupSearch, groupSort],
  );

  // Envios automáticos de IA do CRM (tabela local): continuam com o feedback que alimenta o aprendizado.
  const runListAi = useServerFn(listRecentEnvioMessages);
  const runSubmitFeedback = useServerFn(submitMessageFeedback);
  const runGetFeedback = useServerFn(getRecentMessageFeedback);
  const { data: aiHistory } = useQuery({ queryKey: ["envio-messages"], queryFn: () => runListAi(), refetchInterval: 15000 });
  const aiSentIds = (aiHistory ?? []).filter((m) => m.status === "sent").map((m) => m.id);
  const { data: feedbackMap } = useQuery({
    queryKey: ["envio-message-feedback", aiSentIds.join(",")],
    queryFn: () => runGetFeedback({ data: { messageIds: aiSentIds } }),
    enabled: aiSentIds.length > 0,
  });
  const feedbackMut = useMutation({
    mutationFn: (input: { id: string; feedback: "good" | "bad" }) => runSubmitFeedback({ data: { envioMessageId: input.id, feedback: input.feedback } }),
    onSuccess: () => {
      toast.success("Feedback registrado.");
      qc.invalidateQueries({ queryKey: ["envio-message-feedback"] });
    },
  });

  const busy = sendMut.isPending || saveEditMut.isPending || uploading;

  return (
    <Stack spacing={2} sx={{ py: 2 }}>
      {isError && <Typography color="error">Não consegui carregar os envios: {(loadError as Error | null)?.message ?? "erro desconhecido"}</Typography>}
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Envio de Mensagens
        </Typography>
        <TextField size="small" placeholder="Buscar grupo pelo nome..." value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} sx={{ minWidth: 260 }} />
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                  Tipo de conteúdo
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
                  {(Object.keys(TYPE_LABELS) as StepType[]).map((t) => (
                    <Button
                      key={t}
                      size="small"
                      variant={contentType === t ? "contained" : "outline"}
                      startIcon={<TypeIcon type={t} size={14} />}
                      onClick={() => {
                        setContentType(t);
                        clearMedia();
                      }}
                    >
                      {TYPE_LABELS[t]}
                    </Button>
                  ))}
                </Stack>
              </Box>

              <TextField
                fullWidth
                size="small"
                multiline
                minRows={contentType === "poll" ? 2 : 4}
                label={contentType === "poll" ? "Pergunta da enquete" : "Mensagem"}
                slotProps={{ inputLabel: { shrink: true } }}
                placeholder={contentType === "poll" ? "Ex: Qual coleção você quer ver na live?" : "Digite sua mensagem..."}
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
              />

              {contentType === "poll" && (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    Opções (de 2 a 12)
                  </Typography>
                  {pollOptions.map((opt, idx) => (
                    <Stack key={idx} direction="row" spacing={1}>
                      <TextField fullWidth size="small" placeholder={`Opção ${idx + 1}`} value={opt} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={(e) => setPollOptions((prev) => prev.map((o, i) => (i === idx ? e.target.value : o)))} />
                      <IconButton size="small" disabled={pollOptions.length <= 2} onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}>
                        <Trash2 size={15} />
                      </IconButton>
                    </Stack>
                  ))}
                  <Box>
                    <Button size="small" variant="outline" startIcon={<Plus size={14} />} disabled={pollOptions.length >= 12} onClick={() => setPollOptions((prev) => [...prev, ""])}>
                      Adicionar opção
                    </Button>
                  </Box>
                  <FormControlLabel control={<Checkbox size="small" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} />} label={<Typography variant="body2">Permitir selecionar mais de uma opção</Typography>} />
                </Stack>
              )}

              {contentType !== "text" && contentType !== "poll" && (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                    {contentType === "image" ? "Imagem" : contentType === "audio" ? "Áudio" : contentType === "video_note" ? "Vídeo (será enviado redondo)" : "Vídeo"}
                  </Typography>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT[contentType] ?? ""}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleFile(f);
                    }}
                  />
                  {mediaName ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25 }}>
                      <TypeIcon type={contentType} />
                      <Typography variant="body2" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {mediaName}
                      </Typography>
                      {uploading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <IconButton size="small" onClick={clearMedia}>
                          <X size={15} />
                        </IconButton>
                      )}
                    </Stack>
                  ) : (
                    <Button fullWidth variant="outline" startIcon={<Upload size={15} />} onClick={() => fileInputRef.current?.click()}>
                      Selecionar {contentType === "image" ? "imagem" : contentType === "audio" ? "áudio" : "vídeo"}
                    </Button>
                  )}
                </Box>
              )}

              {!editingId && <SequenceSteps steps={extraSteps} onChange={setExtraSteps} />}

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                  Enviar para
                </Typography>
                <FormControl fullWidth size="small">
                  <Select value={targetType} onChange={(e) => setTargetType(e.target.value as "groups" | "campaign")}>
                    <MenuItem value="groups">Grupos específicos</MenuItem>
                    <MenuItem value="campaign">Campanha</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {targetType === "groups" ? (
                <Stack spacing={1}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="caption" color="text.secondary">
                      Ordenar por
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Button size="small" variant={groupSort === "name" ? "contained" : "outline"} onClick={() => setGroupSort("name")} sx={{ py: 0, fontSize: 12 }}>
                        Nome
                      </Button>
                      <Button size="small" variant={groupSort === "last_sent" ? "contained" : "outline"} onClick={() => setGroupSort("last_sent")} sx={{ py: 0, fontSize: 12 }}>
                        Últimos enviados
                      </Button>
                    </Stack>
                  </Stack>
                  <Box sx={{ maxHeight: 220, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 0.5 }}>
                    {visibleGroups.map((g) => (
                      <FormControlLabel
                        key={g.id}
                        sx={{ display: "flex", width: "100%", m: 0, px: 0.5, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
                        control={<Checkbox size="small" checked={selectedGroupIds.includes(g.id)} onChange={() => setSelectedGroupIds((prev) => (prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id]))} />}
                        label={
                          <Stack direction="row" sx={{ flex: 1, justifyContent: "space-between", minWidth: 0, gap: 1 }}>
                            <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {g.group_name}
                            </Typography>
                            {g.last_sent_at && (
                              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                                {fmtShort(g.last_sent_at)}
                              </Typography>
                            )}
                          </Stack>
                        }
                      />
                    ))}
                    {visibleGroups.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                        Nenhum grupo encontrado.
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {selectedGroupIds.length} selecionado(s) · só aparecem grupos onde você é admin
                  </Typography>
                </Stack>
              ) : (
                <FormControl fullWidth size="small">
                  <Select displayEmpty value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
                    <MenuItem value="" disabled>
                      Selecione campanha
                    </MenuItem>
                    {campaigns.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                  Modo de envio
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant={sendMode === "instant" ? "contained" : "outline"} startIcon={<Send size={14} />} onClick={() => setSendMode("instant")}>
                    Imediato
                  </Button>
                  <Button size="small" variant={sendMode === "scheduled" ? "contained" : "outline"} startIcon={<Clock size={14} />} onClick={() => setSendMode("scheduled")}>
                    Agendado
                  </Button>
                </Stack>
                {sendMode === "scheduled" && (
                  <TextField fullWidth size="small" type="datetime-local" label="Data e hora" sx={{ mt: 1.5 }} slotProps={{ inputLabel: { shrink: true } }} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                )}
              </Box>

              {editingId ? (
                <Stack direction="row" spacing={1}>
                  <Button fullWidth variant="contained" startIcon={saveEditMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Pencil size={15} />} disabled={busy} onClick={() => (contentType === "poll" && !validatePoll() ? undefined : saveEditMut.mutate())}>
                    Salvar edição
                  </Button>
                  <Button variant="outline" onClick={stopEdit}>
                    Cancelar
                  </Button>
                </Stack>
              ) : (
                <Button fullWidth variant="contained" startIcon={sendMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} disabled={busy} onClick={handleSend}>
                  {sendMode === "instant" ? "Enviar agora" : "Agendar envio"}
                </Button>
              )}
            </Stack>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack spacing={2}>
            {scheduledBatches.length > 0 && (
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5, gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Envios agendados ({scheduledMsgs.length})
                  </Typography>
                  {scheduledMsgs.length > 1 &&
                    (confirmBatch === "__all__" ? (
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Typography variant="caption" color="text.secondary">
                          Cancelar todos os {scheduledMsgs.length}?
                        </Typography>
                        <Button size="small" color="error" variant="contained" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate(scheduledMsgs.map((m) => m.id))}>
                          Sim, cancelar todos
                        </Button>
                        <Button size="small" onClick={() => setConfirmBatch(null)}>
                          Voltar
                        </Button>
                      </Stack>
                    ) : (
                      <Button size="small" variant="outline" color="error" startIcon={<Ban size={13} />} onClick={() => setConfirmBatch("__all__")}>
                        Cancelar todos
                      </Button>
                    ))}
                </Stack>
                <Stack spacing={1} sx={{ maxHeight: 400, overflowY: "auto" }}>
                  {scheduledBatches.map((b) => {
                    const names = b.groupIds.map((gid) => groups.find((g) => g.id === gid)?.group_name).filter(Boolean) as string[];
                    return (
                      <Box key={b.key} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, mb: 0.5 }}>
                          <TypeIcon type={b.type} />
                          <Chip size="small" color="warning" label="Agendada" />
                          {b.step > 1 && <Chip size="small" variant="outlined" label={`Mensagem ${b.step} · ${b.delay >= 60 && b.delay % 60 === 0 ? `${b.delay / 60} min` : `${b.delay} s`} depois da anterior`} />}
                          <Typography variant="caption" color="text.secondary">
                            <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
                            {fmtDateTime(b.scheduled_at)}
                          </Typography>
                          <Chip size="small" sx={{ ml: "auto" }} label={`${b.ids.length} grupo(s)`} />
                        </Stack>
                        {b.text && (
                          <Typography variant="body2" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {b.text}
                          </Typography>
                        )}
                        {names.length > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                            {names.slice(0, 6).join(" · ")}
                            {names.length > 6 ? ` e mais ${names.length - 6}` : ""}
                          </Typography>
                        )}
                        <Box sx={{ mt: 1 }}>
                          {confirmBatch === b.key ? (
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                              <Typography variant="caption" color="text.secondary">
                                Cancelar este envio em {b.ids.length} grupo(s)?
                              </Typography>
                              <Button size="small" color="error" variant="contained" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate(b.ids)}>
                                Sim, cancelar
                              </Button>
                              <Button size="small" onClick={() => setConfirmBatch(null)}>
                                Voltar
                              </Button>
                            </Stack>
                          ) : (
                            <Button size="small" color="error" startIcon={<Ban size={13} />} onClick={() => setConfirmBatch(b.key)}>
                              Cancelar este envio{b.ids.length > 1 ? ` (${b.ids.length} grupos)` : ""}
                            </Button>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}

            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
                Histórico de Envios
              </Typography>
              {messages.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
                  Nenhum envio realizado
                </Typography>
              ) : (
                <Stack spacing={1} sx={{ maxHeight: 500, overflowY: "auto" }}>
                  {messages.map((m) => (
                    <Box key={m.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                        <TypeIcon type={m.content_type as StepType} />
                        <Chip size="small" color={STATUS_COLOR[m.status]} label={STATUS_LABEL[m.status] ?? m.status} />
                        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                          {new Date(m.created_at).toLocaleString("pt-BR")}
                        </Typography>
                      </Stack>
                      {m.content_text && (
                        <Typography variant="body2" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {m.content_text}
                        </Typography>
                      )}
                      {m.status === "failed" && (
                        <Typography variant="caption" color="error">
                          {friendlyError(m.error_message) || "Motivo não registrado (envios antigos). Os próximos mostrarão o motivo aqui."}
                        </Typography>
                      )}
                      {m.content_type === "poll" && Array.isArray(m.poll_options) && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Opções: {m.poll_options.join(" · ")}
                        </Typography>
                      )}
                      {m.scheduled_at && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
                          Agendado: {new Date(m.scheduled_at).toLocaleString("pt-BR")}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                        <Button size="small" startIcon={<Eye size={13} />} onClick={() => setViewMessage(m)}>
                          Ver
                        </Button>
                        {m.status === "pending" && (
                          <>
                            <Button size="small" startIcon={<Pencil size={13} />} onClick={() => startEdit(m)}>
                              Editar
                            </Button>
                            <Button size="small" color="error" startIcon={<Ban size={13} />} onClick={() => cancelMut.mutate([m.id])}>
                              Cancelar
                            </Button>
                          </>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            {(aiHistory ?? []).length > 0 && (
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Envios automáticos de IA do CRM
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Postagens geradas pela IA. O 👍/👎 ensina a IA a escolher melhor os próximos textos.
                </Typography>
                <Stack spacing={0.75} sx={{ maxHeight: 260, overflowY: "auto" }}>
                  {(aiHistory ?? []).slice(0, 10).map((m) => (
                    <Stack key={m.id} direction="row" spacing={1} sx={{ alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 0.75 }}>
                      <Chip size="small" color={STATUS_COLOR[m.status]} label={STATUS_LABEL[m.status] ?? m.status} />
                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.content_type === "poll" ? `Enquete: ${m.content_text ?? ""}` : m.content_text || m.content_type}
                      </Typography>
                      {m.status === "sent" && (
                        <Stack direction="row" spacing={0.25}>
                          <IconButton size="small" title="Bom resultado" onClick={() => feedbackMut.mutate({ id: m.id, feedback: "good" })} sx={{ color: feedbackMap?.[m.id] === "good" ? "success.main" : "text.secondary" }}>
                            <ThumbsUp size={14} />
                          </IconButton>
                          <IconButton size="small" title="Não está dando certo" onClick={() => feedbackMut.mutate({ id: m.id, feedback: "bad" })} sx={{ color: feedbackMap?.[m.id] === "bad" ? "error.main" : "text.secondary" }}>
                            <ThumbsDown size={14} />
                          </IconButton>
                        </Stack>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </Grid>
      </Grid>

      <Dialog open={Boolean(viewMessage)} onClose={() => setViewMessage(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Detalhes da Mensagem</DialogTitle>
        <DialogContent>
          {viewMessage && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <TypeIcon type={viewMessage.content_type as StepType} />
                <Chip size="small" color={STATUS_COLOR[viewMessage.status]} label={STATUS_LABEL[viewMessage.status] ?? viewMessage.status} />
                <Typography variant="caption" color="text.secondary">
                  {new Date(viewMessage.created_at).toLocaleString("pt-BR")}
                </Typography>
              </Stack>
              {viewMessage.content_text && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Mensagem
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", bgcolor: "action.hover", p: 1.5, borderRadius: 2, mt: 0.5 }}>
                    {viewMessage.content_text}
                  </Typography>
                </Box>
              )}
              {viewMessage.status === "failed" && (
                <Typography variant="body2" color="error">
                  {friendlyError(viewMessage.error_message) || "Motivo não registrado (envios antigos)."}
                </Typography>
              )}
              {viewMessage.content_type === "poll" && Array.isArray(viewMessage.poll_options) && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Opções {(viewMessage.poll_selectable_count || 1) > 1 ? "(múltipla escolha)" : "(escolha única)"}
                  </Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {viewMessage.poll_options.map((o: string, i: number) => (
                      <Typography key={i} variant="body2" sx={{ bgcolor: "action.hover", px: 1.5, py: 1, borderRadius: 2 }}>
                        {o}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              )}
              {viewMessage.media_url && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Mídia
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    {viewMessage.content_type === "image" ? (
                      <img src={viewMessage.media_url} alt="Mídia" style={{ maxHeight: 256, borderRadius: 8, objectFit: "contain" }} />
                    ) : viewMessage.content_type === "video" ? (
                      <video src={viewMessage.media_url} controls style={{ maxHeight: 256, borderRadius: 8 }} />
                    ) : viewMessage.content_type === "audio" ? (
                      <audio src={viewMessage.media_url} controls style={{ width: "100%" }} />
                    ) : (
                      <a href={viewMessage.media_url} target="_blank" rel="noopener noreferrer">
                        {viewMessage.media_url}
                      </a>
                    )}
                  </Box>
                </Box>
              )}
              {viewMessage.scheduled_at && (
                <Typography variant="caption" color="text.secondary">
                  <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
                  Agendado: {new Date(viewMessage.scheduled_at).toLocaleString("pt-BR")}
                </Typography>
              )}
              {viewMessage.sent_at && (
                <Typography variant="caption" color="text.secondary">
                  <Send size={12} style={{ display: "inline", marginRight: 4 }} />
                  Enviado: {new Date(viewMessage.sent_at).toLocaleString("pt-BR")}
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
