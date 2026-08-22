import { memo, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Image as ImageIcon, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FlowNodeData } from "@/lib/flow.server";
import { uploadFlowImage } from "@/lib/flow.functions";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteNodeButton } from "./DeleteNodeButton";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export const MessageNode = memo(function MessageNode({ data, id }: NodeProps) {
  const d = data as FlowNodeData;
  const [text, setText] = useState(d.text ?? "");
  const [publicReply, setPublicReply] = useState(d.publicReply ?? "");
  const [buttonLabel, setButtonLabel] = useState(d.buttonLabel ?? "");
  const [buttonUrl, setButtonUrl] = useState(d.buttonUrl ?? "");
  const [imageUrl, setImageUrl] = useState(d.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runUpload = useServerFn(uploadFlowImage);

  function update<K extends keyof FlowNodeData>(key: K, value: FlowNodeData[K]) {
    (data as FlowNodeData)[key] = value;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key, value } }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB).");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const base64Data = await fileToBase64(file);
      const res = await runUpload({ data: { fileName: file.name, base64Data, contentType: file.type || "image/jpeg" } });
      setImageUrl(res.url);
      update("imageUrl", res.url);
      toast.success("Imagem enviada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="w-80 rounded-xl bg-card border shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="size-5 rounded bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 grid place-items-center">
          <MessageSquare className="size-3 text-white" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide">Enviar Mensagem</span>
        <DeleteNodeButton id={id} />
      </div>

      <div className="px-4 py-2 grid grid-cols-4 gap-1 text-center border-b bg-muted/20">
        {[
          { label: "Enviado", value: d.stats?.sent_count ?? 0 },
          { label: "Entregue", value: d.stats?.delivered_count ?? 0 },
          { label: "Aberto", value: d.stats?.opened_count ?? 0 },
          { label: "Clicado", value: d.stats?.clicked_count ?? 0 },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-primary font-semibold text-sm">{s.value}</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="p-3 space-y-2.5">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Resposta pública (comentário)</Label>
          <Input
            value={publicReply}
            onChange={(e) => {
              setPublicReply(e.target.value);
              update("publicReply", e.target.value);
            }}
            placeholder="Enviei no seu Direct! 📩"
            className="h-8 text-xs mt-1"
          />
        </div>

        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Mensagem no Direct</Label>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              update("text", e.target.value);
            }}
            placeholder="Olá! Aqui está o material que prometi 👇"
            rows={3}
            className="text-sm mt-1 resize-none"
          />
        </div>

        <div>
          <Label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
            <ImageIcon className="size-3" /> Imagem (upload ou URL)
          </Label>
          <div className="mt-1 flex gap-1">
            <Input
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                update("imageUrl", e.target.value);
              }}
              placeholder="https://…"
              className="h-8 flex-1 text-xs"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Enviar imagem"
              className="grid size-8 shrink-0 place-items-center rounded-md border hover:bg-muted disabled:opacity-50"
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
          {imageUrl && (
            <img src={imageUrl} alt="" className="mt-1.5 h-14 w-14 rounded-md border object-cover" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Botão</Label>
            <Input
              value={buttonLabel}
              onChange={(e) => {
                setButtonLabel(e.target.value);
                update("buttonLabel", e.target.value);
              }}
              placeholder="QUERO"
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Link</Label>
            <Input
              value={buttonUrl}
              onChange={(e) => {
                setButtonUrl(e.target.value);
                update("buttonUrl", e.target.value);
              }}
              placeholder="https://…"
              className="h-8 text-xs mt-1"
            />
          </div>
        </div>
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
