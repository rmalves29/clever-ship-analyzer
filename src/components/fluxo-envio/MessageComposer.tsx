import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Paperclip, X, ThumbsUp, ThumbsDown } from "lucide-react";
import {
  createAndSendEnvioMessage,
  listRecentEnvioMessages,
  editPendingEnvioMessage,
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
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-warning-soft text-warning",
  sending: "bg-brand-soft text-brand",
  sent: "bg-success-soft text-success",
  failed: "bg-critical-soft text-critical",
};

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
  const editMsg = useServerFn(editPendingEnvioMessage);
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
    <div className="grid gap-6 py-4 lg:grid-cols-[1fr_320px]">
      <div className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {CONTENT_TYPES.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={contentType === t.value ? "default" : "outline"}
              onClick={() => {
                setContentType(t.value);
                setMediaUrl("");
              }}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={contentType === "text" ? "Mensagem…" : "Legenda (opcional)…"}
          rows={4}
        />

        {contentType !== "text" && (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-2">
              <Paperclip className="size-4" /> {uploading ? "Enviando…" : mediaUrl ? "Trocar arquivo" : "Anexar arquivo"}
            </Button>
            {mediaUrl && <Badge variant="secondary">arquivo pronto</Badge>}
          </div>
        )}

        <div>
          <Label>Destino</Label>
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant={targetMode === "groups" ? "default" : "outline"} onClick={() => setTargetMode("groups")}>
              Grupos específicos
            </Button>
            <Button size="sm" variant={targetMode === "campaign" ? "default" : "outline"} onClick={() => setTargetMode("campaign")}>
              Campanha
            </Button>
          </div>
        </div>

        {targetMode === "groups" ? (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {adminGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <Checkbox
                  checked={selectedGroupIds.has(g.id)}
                  onCheckedChange={(checked) => {
                    setSelectedGroupIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(g.id);
                      else next.delete(g.id);
                      return next;
                    });
                  }}
                />
                {g.group_name}
              </label>
            ))}
          </div>
        ) : (
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha uma campanha" />
            </SelectTrigger>
            <SelectContent>
              {(campaigns ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div>
          <Label>Envio</Label>
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant={scheduleMode === "instant" ? "default" : "outline"} onClick={() => setScheduleMode("instant")}>
              Instantâneo
            </Button>
            <Button size="sm" variant={scheduleMode === "scheduled" ? "default" : "outline"} onClick={() => setScheduleMode("scheduled")}>
              Agendado
            </Button>
          </div>
          {scheduleMode === "scheduled" && (
            <Input type="datetime-local" className="mt-2" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          )}
        </div>

        <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending} className="w-full gap-2">
          <Send className="size-4" /> {scheduleMode === "scheduled" ? "Agendar" : "Enviar agora"}
        </Button>
      </div>

      <div className="surface-card p-4">
        <p className="mb-2 text-sm font-semibold">Histórico recente</p>
        <div className="space-y-2">
          {(history ?? []).map((m) => (
            <div key={m.id} className="rounded-lg border border-border p-2 text-xs">
              <div className="flex items-center justify-between">
                <Badge className={STATUS_CLASS[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                {m.status === "pending" && (
                  <button onClick={() => cancelMut.mutate(m.id)} className="text-critical hover:underline">
                    <X className="size-3.5" />
                  </button>
                )}
                {m.status === "sent" && (
                  <div className="flex items-center gap-1">
                    <button
                      title="Deu certo"
                      onClick={() => feedbackMut.mutate({ id: m.id, feedback: "good" })}
                      className={`rounded p-0.5 hover:bg-success-soft ${feedbackMap?.[m.id] === "good" ? "text-success" : "text-muted-foreground"}`}
                    >
                      <ThumbsUp className="size-3.5" />
                    </button>
                    <button
                      title="Não deu certo"
                      onClick={() => feedbackMut.mutate({ id: m.id, feedback: "bad" })}
                      className={`rounded p-0.5 hover:bg-critical-soft ${feedbackMap?.[m.id] === "bad" ? "text-critical" : "text-muted-foreground"}`}
                    >
                      <ThumbsDown className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-1 truncate text-muted-foreground">{m.content_text || m.content_type}</p>
            </div>
          ))}
          {(history ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum envio ainda.</p>}
        </div>
      </div>
    </div>
  );
}
