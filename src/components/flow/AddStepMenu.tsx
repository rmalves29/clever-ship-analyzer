import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { STEP_META, CONTENT_KINDS, LOGIC_KINDS } from "./stepMeta";
import type { FlowNodeKind } from "@/lib/flow.server";

interface Props {
  onAdd: (kind: FlowNodeKind) => void;
  trigger?: React.ReactNode;
}

export function AddStepMenu({ onAdd, trigger }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Plus className="size-4 mr-2" /> Adicionar passo
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0 overflow-hidden">
        <MenuSection title="Conteúdo" kinds={CONTENT_KINDS} onAdd={onAdd} labelOverride={{ message: "Instagram" }} />
        <div className="h-px bg-border" />
        <MenuSection title="Lógica" kinds={LOGIC_KINDS} onAdd={onAdd} />
      </PopoverContent>
    </Popover>
  );
}

function MenuSection({
  title,
  kinds,
  onAdd,
  labelOverride,
}: {
  title: string;
  kinds: FlowNodeKind[];
  onAdd: (kind: FlowNodeKind) => void;
  labelOverride?: Partial<Record<FlowNodeKind, string>>;
}) {
  return (
    <div className="py-1.5">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {title}
      </div>
      {kinds.map((k) => {
        const meta = STEP_META[k];
        const Icon = meta.icon;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onAdd(k)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 text-left"
          >
            <div
              className="size-6 rounded-md grid place-items-center shrink-0"
              style={{ background: meta.iconBg, color: meta.iconColor }}
            >
              <Icon className="size-3.5" strokeWidth={2.5} />
            </div>
            <span className="text-primary">+ {labelOverride?.[k] ?? meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
