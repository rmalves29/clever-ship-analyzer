import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MousePointerClick, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  listConversationalFlows,
  toggleConversationalFlow,
  deleteConversationalFlow,
  getConversationRunMetrics,
} from "@/lib/conversational-flows.functions";
import { ConversationalFlowDialog, type ConversationalFlowSeed } from "./ConversationalFlowDialog";

type FlowRow = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  trigger_type: "button_click" | "keyword";
  trigger_template_name: string | null;
  trigger_values: string[];
  steps: unknown[];
  total_execucoes: number;
};

export function ConversationalFlowsTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSeed, setEditSeed] = useState<ConversationalFlowSeed | null>(null);

  const { data: flows, isLoading } = useQuery({
    queryKey: ["conversational-flows"],
    queryFn: () => listConversationalFlows(),
  });

  const { data: metrics } = useQuery({
    queryKey: ["conversation-run-metrics"],
    queryFn: () => getConversationRunMetrics(),
  });

  const runToggle = useServerFn(toggleConversationalFlow);
  const runDelete = useServerFn(deleteConversationalFlow);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["conversational-flows"] });
    queryClient.invalidateQueries({ queryKey: ["conversation-run-metrics"] });
  };

  const handleToggle = async (flow: FlowRow, ativo: boolean) => {
    const res = await runToggle({ data: { id: flow.id, ativo } });
    if (!res.success) {
      toast.error(res.error || "Falha ao atualizar.");
      return;
    }
    invalidate();
  };

  const handleDelete = async (flow: FlowRow) => {
    if (!window.confirm(`Excluir o fluxo "${flow.nome}"?`)) return;
    const res = await runDelete({ data: { id: flow.id } });
    if (!res.success) {
      toast.error(res.error || "Falha ao excluir.");
      return;
    }
    toast.success("Fluxo excluído.");
    invalidate();
  };

  const openNew = () => {
    setEditSeed(null);
    setDialogOpen(true);
  };

  const openEdit = (flow: FlowRow) => {
    setEditSeed({
      id: flow.id,
      nome: flow.nome,
      descricao: flow.descricao ?? undefined,
      ativo: flow.ativo,
      triggerType: flow.trigger_type,
      triggerTemplateName: flow.trigger_template_name ?? undefined,
      triggerValues: flow.trigger_values,
      steps: flow.steps as ConversationalFlowSeed["steps"],
    });
    setDialogOpen(true);
  };

  const rows = (flows ?? []) as FlowRow[];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Dispara quando o <strong>cliente</strong> manda uma mensagem — clique em botão de um template, ou palavra-chave em texto livre.
        </p>
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus className="size-3.5" /> Criar fluxo
        </Button>
      </div>

      {isLoading && <p className="mt-6 text-center text-muted-foreground">Carregando...</p>}
      {!isLoading && rows.length === 0 && (
        <p className="mt-6 text-center text-muted-foreground">Nenhum fluxo conversacional ainda. Crie o primeiro acima.</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((flow) => {
          const m = metrics?.[flow.id];
          return (
            <div key={flow.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{flow.nome}</p>
                  {flow.descricao && <p className="text-xs text-muted-foreground mt-0.5">{flow.descricao}</p>}
                </div>
                <Switch checked={flow.ativo} onCheckedChange={(v) => handleToggle(flow, v)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {flow.trigger_type === "button_click" ? <MousePointerClick className="size-3" /> : <Type className="size-3" />}
                  {flow.trigger_type === "button_click" ? `Botão: ${flow.trigger_template_name ?? "?"}` : "Palavra-chave"}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{flow.steps.length} etapa{flow.steps.length === 1 ? "" : "s"}</span>
                {m && m.total > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {m.byStatus["active"] ?? 0} em andamento · {m.byStatus["completed"] ?? 0} concluídos
                  </span>
                )}
              </div>

              <p className="mt-2 text-xs text-muted-foreground truncate">
                {flow.trigger_type === "button_click" ? flow.trigger_values.join(", ") : `"${flow.trigger_values.join('", "')}"`}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(flow)}>
                  <Pencil className="size-3.5" /> Editar
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 text-critical" onClick={() => handleDelete(flow)}>
                  <Trash2 className="size-3.5" /> Excluir
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <ConversationalFlowDialog
        seed={editSeed}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={invalidate}
      />
    </div>
  );
}
