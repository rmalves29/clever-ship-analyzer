import { useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BarChart3, Circle, FileText, Image as ImageIcon, Loader2, Music, Plus, Trash2, Upload, Video, X } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { createEnvioMediaUpload } from "@/lib/envio-fe-messages.functions";
import { checkVideoNoteFile } from "@/lib/video-note-check";

export type StepType = "text" | "image" | "audio" | "video" | "video_note" | "poll";

export interface SeqStep {
  key: string;
  contentType: StepType;
  text: string;
  mediaUrl: string;
  mediaName: string;
  uploading: boolean;
  pollOptions: string[];
  pollMultiple: boolean;
  delayValue: number;
  delayUnit: "seconds" | "minutes";
}

export const MAX_EXTRA_STEPS = 4;

export const newStep = (): SeqStep => ({
  key: Math.random().toString(36).slice(2),
  contentType: "text",
  text: "",
  mediaUrl: "",
  mediaName: "",
  uploading: false,
  pollOptions: ["", ""],
  pollMultiple: false,
  delayValue: 5,
  delayUnit: "seconds",
});

export const stepDelaySeconds = (s: SeqStep) => Math.max(0, Math.round((Number(s.delayValue) || 0) * (s.delayUnit === "minutes" ? 60 : 1)));

export const cleanStepPoll = (s: SeqStep) => s.pollOptions.map((o) => o.trim()).filter(Boolean);

/** Devolve a mensagem de erro (ou null se a etapa está válida). */
export function validateStep(s: SeqStep, index: number): string | null {
  const label = `Mensagem ${index + 2}`;
  if (s.uploading) return `${label}: aguarde o envio do arquivo terminar`;
  if (s.contentType === "text" && !s.text.trim()) return `${label}: escreva o texto`;
  if (s.contentType === "poll") {
    const opts = cleanStepPoll(s);
    if (!s.text.trim()) return `${label}: escreva a pergunta da enquete`;
    if (opts.length < 2) return `${label}: a enquete precisa de pelo menos 2 opções`;
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return `${label}: há opções repetidas na enquete`;
  } else if (s.contentType !== "text" && !s.mediaUrl) {
    return `${label}: anexe um arquivo`;
  }
  return null;
}

export const TYPE_LABELS: Record<StepType, string> = {
  text: "Texto",
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  video_note: "Vídeo redondo",
  poll: "Enquete",
};
export const ACCEPT: Partial<Record<StepType, string>> = { image: "image/*", audio: "audio/*", video: "video/*", video_note: "video/*" };

export function TypeIcon({ type, size = 15 }: { type: StepType; size?: number }) {
  if (type === "text") return <FileText size={size} />;
  if (type === "image") return <ImageIcon size={size} />;
  if (type === "audio") return <Music size={size} />;
  if (type === "video") return <Video size={size} />;
  if (type === "video_note") return <Circle size={size} />;
  return <BarChart3 size={size} />;
}

/** Envia o arquivo direto do navegador para o armazenamento do Cartzy (endereço assinado) e devolve o link público. */
export async function uploadEnvioFile(prepare: (file: File) => Promise<{ signedUrl: string; publicUrl: string }>, file: File): Promise<string> {
  const { signedUrl, publicUrl } = await prepare(file);
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new File([file], file.name, { type: file.type }));
  const res = await fetch(signedUrl, { method: "PUT", body: form });
  if (!res.ok) throw new Error("Não consegui enviar o arquivo. Tente de novo.");
  return publicUrl;
}

export function SequenceSteps({ steps, onChange }: { steps: SeqStep[]; onChange: (steps: SeqStep[]) => void }) {
  const prepareUpload = useServerFn(createEnvioMediaUpload);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const patch = (key: string, p: Partial<SeqStep>) => onChange(steps.map((s) => (s.key === key ? { ...s, ...p } : s)));

  const upload = async (step: SeqStep, file: File) => {
    // Vídeo redondo: bloqueia arquivo pesado ou em HEVC antes de subir (senão chega em branco no WhatsApp)
    if (step.contentType === "video_note") {
      const problem = await checkVideoNoteFile(file);
      if (problem) {
        toast.error(`Vídeo não serve para vídeo redondo. ${problem}`);
        return;
      }
    }
    patch(step.key, { uploading: true, mediaName: file.name });
    try {
      const url = await uploadEnvioFile((f) => prepareUpload({ data: { fileName: f.name, size: f.size } }), file);
      patch(step.key, { uploading: false, mediaUrl: url, mediaName: file.name });
    } catch (e: any) {
      toast.error("Erro ao enviar arquivo: " + (e?.message ?? "falha desconhecida"));
      patch(step.key, { uploading: false, mediaUrl: "", mediaName: "" });
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Mensagens seguintes (opcional)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Envie uma sequência, por exemplo uma imagem e logo depois a enquete, com um intervalo entre elas.
          </Typography>
        </Box>
        <Button size="small" variant="outline" startIcon={<Plus size={14} />} disabled={steps.length >= MAX_EXTRA_STEPS} onClick={() => onChange([...steps, newStep()])} sx={{ flexShrink: 0 }}>
          Adicionar mensagem
        </Button>
      </Stack>

      {steps.map((s, idx) => (
        <Box key={s.key} sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Mensagem {idx + 2}
              </Typography>
              <IconButton size="small" aria-label="Remover mensagem" onClick={() => onChange(steps.filter((x) => x.key !== s.key))}>
                <Trash2 size={15} />
              </IconButton>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="body2">Enviar</Typography>
              <TextField
                size="small"
                type="number"
                sx={{ width: 84 }}
                value={s.delayValue}
                slotProps={{ htmlInput: { min: 0, max: s.delayUnit === "minutes" ? 1440 : 3600 } }}
                onChange={(e) => patch(s.key, { delayValue: Number(e.target.value) })}
              />
              <Select size="small" value={s.delayUnit} onChange={(e) => patch(s.key, { delayUnit: e.target.value as "seconds" | "minutes" })} sx={{ width: 118 }}>
                <MenuItem value="seconds">segundos</MenuItem>
                <MenuItem value="minutes">minutos</MenuItem>
              </Select>
              <Typography variant="body2">depois da mensagem {idx + 1}</Typography>
            </Stack>

            <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
              {(Object.keys(TYPE_LABELS) as StepType[]).map((t) => (
                <Button key={t} size="small" variant={s.contentType === t ? "contained" : "outline"} startIcon={<TypeIcon type={t} size={14} />} onClick={() => patch(s.key, { contentType: t, mediaUrl: "", mediaName: "" })}>
                  {TYPE_LABELS[t]}
                </Button>
              ))}
            </Stack>

            <TextField
              fullWidth
              size="small"
              multiline
              minRows={s.contentType === "poll" ? 2 : 3}
              label={s.contentType === "poll" ? "Pergunta da enquete" : s.contentType === "text" ? "Mensagem" : "Legenda (opcional)"}
              slotProps={{ inputLabel: { shrink: true } }}
              value={s.text}
              onChange={(e) => patch(s.key, { text: e.target.value })}
              placeholder={s.contentType === "poll" ? "Ex: Qual coleção você quer ver na live?" : "Digite sua mensagem..."}
            />

            {s.contentType === "poll" && (
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Opções (de 2 a 12)
                </Typography>
                {s.pollOptions.map((opt, i) => (
                  <Stack key={i} direction="row" spacing={1}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder={`Opção ${i + 1}`}
                      value={opt}
                      slotProps={{ htmlInput: { maxLength: 100 } }}
                      onChange={(e) => patch(s.key, { pollOptions: s.pollOptions.map((o, j) => (j === i ? e.target.value : o)) })}
                    />
                    <IconButton size="small" disabled={s.pollOptions.length <= 2} onClick={() => patch(s.key, { pollOptions: s.pollOptions.filter((_, j) => j !== i) })}>
                      <Trash2 size={15} />
                    </IconButton>
                  </Stack>
                ))}
                <Box>
                  <Button size="small" variant="outline" startIcon={<Plus size={14} />} disabled={s.pollOptions.length >= 12} onClick={() => patch(s.key, { pollOptions: [...s.pollOptions, ""] })}>
                    Adicionar opção
                  </Button>
                </Box>
                <FormControlLabel
                  control={<Checkbox size="small" checked={s.pollMultiple} onChange={(e) => patch(s.key, { pollMultiple: e.target.checked })} />}
                  label={<Typography variant="body2">Permitir selecionar mais de uma opção</Typography>}
                />
              </Stack>
            )}

            {s.contentType !== "text" && s.contentType !== "poll" && (
              <Box>
                <input
                  ref={(el) => {
                    fileRefs.current[s.key] = el;
                  }}
                  type="file"
                  accept={ACCEPT[s.contentType] ?? ""}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload(s, f);
                  }}
                />
                {s.mediaName ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1 }}>
                    <TypeIcon type={s.contentType} />
                    <Typography variant="body2" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.mediaName}
                    </Typography>
                    {s.uploading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <IconButton size="small" onClick={() => patch(s.key, { mediaUrl: "", mediaName: "" })}>
                        <X size={15} />
                      </IconButton>
                    )}
                  </Stack>
                ) : (
                  <Button fullWidth variant="outline" startIcon={<Upload size={15} />} onClick={() => fileRefs.current[s.key]?.click()}>
                    Selecionar arquivo
                  </Button>
                )}
              </Box>
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
