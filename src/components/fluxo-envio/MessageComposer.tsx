import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Paperclip, X, ThumbsUp, ThumbsDown } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
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
  createAndSendEnvioMessage,
  listRecentEnvioMessages,
  cancelPendingEnvioMessage,
  uploadEnvioMedia,
  submitMessageFeedback,
  getRecentMessageFeedback,
} from "@/lib/envio-messages.functions";
import { listEnvioGroups } from "@/lib/envio-groups.functions";
import { listEnvioCampaigns, getCampaignGroupLinks } from "@/lib/envio-campaigns.functions";

const CONTENT_TYPES = [
  { value: "text", label: "Texto" },
  { value: "image", label: "Imagem" },
  { value: "audio", label: "Áudio" },
  { value: "video", label: "Vídeo" },
  { value: "video_note", label: "Vídeo redondo" },
] as const;

const STATUS_LABEL: Record<string, string> = { pending: "Agendada", sending: "Enviando", sent: "Enviada", failed: "Falhou" };
const STATUS_COLOR: Record<string, ChipProps["color"]> = { pending: "warning", sending: "primary", sent: "success", failed: "error" };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function MessageComposer() {
  const qc = useQueryClient();
  const send = useServerFn(createAndSendEnvioMessage);
  const listMessages = useServerFn(listRecentEnvioMessages);
  const cancelMsg = useServerFn(cancelPendingEnvioMessage);
  const upload = useServerFn(uploadEnvioMedia);
  const listGroups = useServerFn(listEnvioGroups);
  const listCampaigns = useServerFn(listEnvioCampaigns);
  const getLinks = useServerFn(getCampaignGroupLinks);

  const { data: groups } = useQuery({ queryKey: ["envio-groups"], queryFn: () => listGroups() });
  const { data: campaigns } = useQuery({ queryKey: ["envio-campaigns"], queryFn: () => listCampaigns() });
  const { data: history } = useQuery({ queryKey: ["envio-messages"], queryFn: () => listMessages(), refetchInterval: 5000 });
  const runSubmitFeedback = useServerFn(submitMessageFeedback);
  const runGetFeedback = useServerFn(getRecentMessageFeedback);
  const sentIds = (history ?? []).filter((m) => m.status === "sent").map((m) => m.id);
  const { data: feedbackMap } = useQuery({
    queryKey: ["envio-message-feedback", sentIds.join(",")],
    queryFn: () => runGetFeedback({ data: { messageIds: sentIds } }),
    enabled: sentIds.length > 0,
  });
  const feedbackMut = useMutation({
    mutationFn: (input: { id: string; feedback: "good" | "bad" }) => runSubmitFeedback({ data: { envioMessageId: input.id, feedback: input.feedback } }),
    onSuccess: () => {
      toast.success("Feedback registrado.");
      qc.invalidateQueries({ queryKey: ["envio-message-feedback"] });
    },
  });

  const [contentType, setContentType] = useState<(typeof CONTENT_TYPES)[number]["value"]>("text");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [targetMode, setTargetMode] = useState<"groups" | "campaign">("groups");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [campaignId, setCampaignId] = useState<string>("");
  const [scheduleMode, setScheduleMode] = useState<"instant" | "scheduled">("instant");
  const [scheduledAt, setScheduledAt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await upload({ data: { fileName: file.name, base64Data: base64, contentType: file.type } });
      setMediaUrl(res.url);
    } catch (e: any) {
      toast.error("Falha no upload: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const sendMut = useMutation({
    mutationFn: async () => {
      let groupIds: string[];
      if (targetMode === "campaign") {
        if (!campaignId) throw new Error("Escolha uma campanha");
        const links = await getLinks({ data: { campaignId } });
        groupIds = links.map((l) => l.group_id);
      } else {
        groupIds = Array.from(selectedGroupIds);
      }
      if (groupIds.length === 0) throw new Error("Selecione ao menos 1 grupo");
      return send({
        data: {
          groupIds,
          contentType,
          contentText: text || undefined,
          mediaUrl: mediaUrl || undefined,
          scheduledAt: scheduleMode === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(scheduleMode === "scheduled" ? "Mensagem agendada." : "Enviando…");
      setText("");
      setMediaUrl("");
      setSelectedGroupIds(new Set());
      qc.invalidateQueries({ queryKey: ["envio-messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelMsg({ data: { id } }),
    onSuccess: (r) => {
      if (r.cancelled) toast.success("Cancelada.");
      else toast.info("Já começou a ser enviada.");
      qc.invalidateQueries({ queryKey: ["envio-messages"] });
    },
  });

  const adminGroups = (groups ?? []).filter((g) => g.is_admin);

  return (
    <Grid container spacing={3} sx={{ py: 2 }}>
      <Grid size={{ xs: 12, lg: "grow" }}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2.5 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              {CONTENT_TYPES.map((t) => (
                <Button
                  key={t.value}
                  size="small"
                  variant={contentType === t.value ? "contained" : "outline"}
                  onClick={() => {
                    setContentType(t.value);
                    setMediaUrl("");
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </Stack>

            <TextField
              fullWidth
              multiline
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={contentType === "text" ? "Mensagem…" : "Legenda (opcional)…"}
            />

            {contentType !== "text" && (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <input ref={fileInputRef} type="file" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <Button variant="outline" startIcon={<Paperclip size={16} />} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? "Enviando…" : mediaUrl ? "Trocar arquivo" : "Anexar arquivo"}
                </Button>
                {mediaUrl && <Chip size="small" label="arquivo pronto" />}
              </Stack>
            )}

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.75 }}>
                Destino
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant={targetMode === "groups" ? "contained" : "outline"} onClick={() => setTargetMode("groups")}>
                  Grupos específicos
                </Button>
                <Button size="small" variant={targetMode === "campaign" ? "contained" : "outline"} onClick={() => setTargetMode("campaign")}>
                  Campanha
                </Button>
              </Stack>
            </Box>

            {targetMode === "groups" ? (
              <Box sx={{ maxHeight: 192, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1 }}>
                {adminGroups.map((g) => (
                  <FormControlLabel
                    key={g.id}
                    sx={{ display: "flex", width: "100%", m: 0, borderRadius: 1, px: 1, py: 0.25, "&:hover": { bgcolor: "action.hover" } }}
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedGroupIds.has(g.id)}
                        onChange={(e) => {
                          setSelectedGroupIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(g.id);
                            else next.delete(g.id);
                            return next;
                          });
                        }}
                      />
                    }
                    label={<Typography variant="body2">{g.group_name}</Typography>}
                  />
                ))}
              </Box>
            ) : (
              <FormControl size="small" fullWidth>
                <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} displayEmpty>
                  <MenuItem value="">
                    <em>Escolha uma campanha</em>
                  </MenuItem>
                  {(campaigns ?? []).map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.75 }}>
                Envio
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant={scheduleMode === "instant" ? "contained" : "outline"} onClick={() => setScheduleMode("instant")}>
                  Instantâneo
                </Button>
                <Button size="small" variant={scheduleMode === "scheduled" ? "contained" : "outline"} onClick={() => setScheduleMode("scheduled")}>
                  Agendado
                </Button>
              </Stack>
              {scheduleMode === "scheduled" && (
                <TextField fullWidth size="small" type="datetime-local" sx={{ mt: 1.5 }} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              )}
            </Box>

            <Button variant="contained" fullWidth startIcon={<Send size={16} />} onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
              {scheduleMode === "scheduled" ? "Agendar" : "Enviar agora"}
            </Button>
          </Stack>
        </Box>
      </Grid>

      <Grid size={{ xs: 12, lg: 4 }} sx={{ maxWidth: { lg: 320 } }}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Histórico recente
          </Typography>
          <Stack spacing={1}>
            {(history ?? []).map((m) => (
              <Box key={m.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Chip size="small" color={STATUS_COLOR[m.status]} label={STATUS_LABEL[m.status]} />
                  {m.status === "pending" && (
                    <IconButton size="small" onClick={() => cancelMut.mutate(m.id)}>
                      <X size={14} color="var(--mui-palette-error-main, #EA5455)" />
                    </IconButton>
                  )}
                  {m.status === "sent" && (
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        size="small"
                        title="nao está dando certo."
                        onClick={() => feedbackMut.mutate({ id: m.id, feedback: "good" })}
                        sx={{ color: feedbackMap?.[m.id] === "good" ? "success.main" : "text.secondary" }}
                      >
                        <ThumbsUp size={14} />
                      </IconButton>
                      <IconButton
                        size="small"
                        title="nao está dando certo."
                        onClick={() => feedbackMut.mutate({ id: m.id, feedback: "bad" })}
                        sx={{ color: feedbackMap?.[m.id] === "bad" ? "error.main" : "text.secondary" }}
                      >
                        <ThumbsDown size={14} />
                      </IconButton>
                    </Stack>
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.content_text || m.content_type}
                </Typography>
              </Box>
            ))}
            {(history ?? []).length === 0 && (
              <Typography variant="caption" color="text.secondary">
                Nenhum envio ainda.
              </Typography>
            )}
          </Stack>
        </Box>
      </Grid>
    </Grid>
  );
}
