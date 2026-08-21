import { X } from "lucide-react";

export function DeleteNodeButton({ id, className = "" }: { id: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("flow-node-delete", { detail: { id } }));
      }}
      className={`ml-auto size-5 rounded-md grid place-items-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ${className}`}
      aria-label="Excluir passo"
      title="Excluir"
    >
      <X className="size-3.5" strokeWidth={2.5} />
    </button>
  );
}
