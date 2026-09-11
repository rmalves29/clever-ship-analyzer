import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AutomationDialog, SEGMENT_LABEL, type AutomationSeed } from "@/components/crm/AutomationDialog";
import { ConversationalFlowsTab } from "@/components/whatsapp/ConversationalFlowsTab";
import { deleteAutomation, listAutomations, runAutomationNow, toggleAutomation } from "@/lib/whatsapp-meta.functions";

export const Route = createFileRoute("/whatsapp/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações de WhatsApp | CRM Insights" },
      { name: "description", content: "Réguas automáticas e fluxos conversacionais do WhatsApp oficial da loja." },
      { property: "og:title", content: "Automações de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Configure réguas e respostas automáticas no WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomacoesPage,
});

function AutomacoesPage() {
  const runToggle = useServerFn(toggleAutomation);
  const runDelete = useServerFn(deleteAutomation);
  const runNow = useServerFn(runAutomationNow);
  const [seed, setSeed] = useState<AutomationSeed | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: automations, refetch } = useQuery({ queryKey: ["whatsapp-automations"], queryFn: () => listAutomations() });

  const wrap = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Não deu certo.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Réguas automáticas</h2>
            <p className="text-xs text-muted-foreground">Disparos por comportamento do cliente, sem ninguém apertar botão.</p>
          </div>
          <Button
            className="gap-2"
            onClick={() => {
              setSeed({ nome: "Nova régua", segmentType: "sem_recompra", oferta: "" } as AutomationSeed);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Nova régua
          </Button>
        </div>

        <div className="space-y-2">
          {(automations ?? []).map((a: any) => (
            <div key={a.id} className="surface-card flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-[200px] flex-1">
                <p className="font-semibold">{a.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {SEGMENT_LABEL[a.segmentType as keyof typeof SEGMENT_LABEL] ?? a.segmentType} · {a.steps?.length ?? 0} etapa(s)
                </p>
              </div>
              <Badge variant="outline">{a.ativo ? "Ativa" : "Pausada"}</Badge>
              <Switch
                checked={Boolean(a.ativo)}
                disabled={busyId === a.id}
                onCheckedChange={(v) => wrap(a.id, () => runToggle({ data: { id: a.id, ativo: v } }))}
              />
              <Button variant="outline" size="sm" className="gap-1.5" disabled={busyId === a.id} onClick={() => wrap(a.id, () => runNow({ data: { id: a.id } }))}>
                <Play className="size-3.5" /> Rodar agora
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busyId === a.id}
                onClick={() => {
                  if (confirm(`Apagar a régua "${a.nome}"?`)) wrap(a.id, () => runDelete({ data: { id: a.id } }));
                }}
              >
                <Trash2 className="size-4 text-critical" />
              </Button>
            </div>
          ))}
          {(automations ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma régua criada ainda.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Fluxos conversacionais</h2>
          <p className="text-xs text-muted-foreground">Respostas automáticas quando o cliente escreve para a loja.</p>
        </div>
        <ConversationalFlowsTab />
      </section>

      <AutomationDialog seed={seed} open={open} onOpenChange={setOpen} onSaved={() => refetch()} />
    </div>
  );
}
