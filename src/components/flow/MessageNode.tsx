import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, Image as ImageIcon } from "lucide-react";
import type { FlowNodeData } from "@/lib/flow.server";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteNodeButton } from "./DeleteNodeButton";

export const MessageNode = memo(function MessageNode({ data, id }: NodeProps) {
  const d = data as FlowNodeData;
  const [text, setText] = useState(d.text ?? "");
  const [publicReply, setPublicReply] = useState(d.publicReply ?? "");
  const [buttonLabel, setButtonLabel] = useState(d.buttonLabel ?? "");
  const [buttonUrl, setButtonUrl] = useState(d.buttonUrl ?? "");
  const [imageUrl, setImageUrl] = useState(d.imageUrl ?? "");

  function update<K extends keyof FlowNodeData>(key: K, value: FlowNodeData[K]) {
    (data as FlowNodeData)[key] = value;
    window.dispatchEvent(new CustomEvent("flow-node-update", { detail: { id, key, value } }));
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
        {["Enviado", "Entregue", "Aberto", "Clicado"].map((k) => (
          <div key={k}>
            <div className="text-primary font-semibold text-sm">0</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{k}</div>
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
            <ImageIcon className="size-3" /> Imagem (URL opcional)
          </Label>
          <Input
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              update("imageUrl", e.target.value);
            }}
            placeholder="https://…"
            className="h-8 text-xs mt-1"
          />
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
