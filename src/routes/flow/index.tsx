import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listFlowAutomations,
  createFlowAutomation,
  deleteFlowAutomation,
  listFlowContacts,
  listFlowLogs,
} from "@/lib/flow.functions";
import type { FlowAutomation } from "@/lib/flow.server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MessageSquare, Trash2, MoreVertical, Users, ScrollText, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/flow/")({
  component: FlowDashboard,
  head: () => ({
    meta: [
      { title: "Flow | Automações" },
      { name: "description", content: "Automações de Instagram — comentário em post/reel/story vira DM automática." },
    ],
  }),
});

function FlowDashboard() {
  const [view, setView] = useState<"automacoes" | "contatos" | "logs">("automacoes");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const list = useServerFn(listFlowAutomations);
  const create = useServerFn(createFlowAutomation);
  const del = useServerFn(deleteFlowAutomation);
  const runContacts = useServerFn(listFlowContacts);
  const runLogs = useServerFn(listFlowLogs);

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["flow-automations"],
    queryFn: () => list(),
    enabled: view === "automacoes",
  });

  const { data: contacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ["flow-contacts"],
    queryFn: () => runContacts(),
    enabled: view === "contatos",
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["flow-logs"],
    queryFn: () => runLogs(),
    enabled: view === "logs",
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["flow-automations"] });
      navigate({ to: "/flow/$id", params: { id: a.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow-automations"] });
      toast.success("Automação excluída");
    },
  });

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Flow</h1>
          <p className="text-sm text-muted-foreground">Fluxos que respondem por você no Instagram — comentário vira DM automática.</p>
        </div>
        {view === "automacoes" && (
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="gap-2">
            <Plus className="size-4" /> Nova automação
          </Button>
        )}
      </div>

      <div className="mt-4">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="automacoes" className="gap-1.5">
              <MessageSquare className="size-3.5" /> Automações
            </TabsTrigger>
            <TabsTrigger value="contatos" className="gap-1.5">
              <Users className="size-3.5" /> Contatos
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5">
              <ScrollText className="size-3.5" /> Logs
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "automacoes" && (
        <div className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : automations.length === 0 ? (
            <EmptyState onCreate={() => createMut.mutate()} loading={createMut.isPending} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {automations.map((a) => (
                <AutomationCard key={a.id} a={a} onDelete={() => deleteMut.mutate(a.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {view === "contatos" && (
        <div className="mt-4">
          {loadingContacts ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : contacts.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-16 text-center max-w-xl mx-auto">
              <div className="size-12 rounded-xl bg-brand-soft text-brand grid place-items-center mx-auto mb-4">
                <Users className="size-6" />
              </div>
              <h2 className="text-lg font-semibold mb-1">Sem contatos ainda</h2>
              <p className="text-sm text-muted-foreground">Quando alguém for atingido por uma automação, aparece aqui.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Usuário</th>
                    <th className="text-left px-4 py-3 font-medium">Primeiro contato</th>
                    <th className="text-left px-4 py-3 font-medium">Último contato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-medium">@{c.username ?? c.ig_user_id}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDistanceToNow(new Date(c.first_seen_at), { locale: ptBR, addSuffix: true })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDistanceToNow(new Date(c.last_seen_at), { locale: ptBR, addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "logs" && (
        <div className="mt-4">
          {loadingLogs ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : logs.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-16 text-center max-w-xl mx-auto">
              <div className="size-12 rounded-xl bg-brand-soft text-brand grid place-items-center mx-auto mb-4">
                <ScrollText className="size-6" />
              </div>
              <h2 className="text-lg font-semibold mb-1">Nenhum disparo ainda</h2>
              <p className="text-sm text-muted-foreground">Cada tentativa de envio (sucesso ou erro) aparece aqui.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {logs.map((l) => (
                <div key={l.id} className="p-4 flex items-center gap-4">
                  {l.status === "success" ? (
                    <CheckCircle2 className="size-5 text-success shrink-0" />
                  ) : l.status === "error" ? (
                    <XCircle className="size-5 text-critical shrink-0" />
                  ) : (
                    <MinusCircle className="size-5 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">@{l.ig_username ?? l.ig_user_id ?? "—"}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground truncate">{l.flow_automations?.name ?? "Automação removida"}</span>
                      {l.matched_keyword && (
                        <span className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{l.matched_keyword}</span>
                      )}
                    </div>
                    {l.error_message && <p className="text-xs text-critical mt-0.5 truncate">{l.error_message}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(l.created_at), { locale: ptBR, addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AutomationCard({ a, onDelete }: { a: FlowAutomation; onDelete: () => void }) {
  return (
    <div className="group relative rounded-xl border border-border bg-card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="size-9 rounded-lg bg-brand-soft text-brand grid place-items-center">
          <MessageSquare className="size-4" />
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={a.status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-critical" onClick={onDelete}>
                <Trash2 className="size-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Link to="/flow/$id" params={{ id: a.id }} className="block">
        <h3 className="font-semibold mb-1 truncate">{a.name}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {a.keywords.length > 0
            ? a.keywords.slice(0, 3).map((k) => `"${k}"`).join(", ")
            : a.match_any_comment
              ? "Qualquer comentário"
              : "Sem palavras-chave"}
        </p>
        <div className="flex justify-between text-xs text-muted-foreground pt-3 border-t border-border">
          <span>{a.dispatch_count} disparos</span>
          <span>Editado {formatDistanceToNow(new Date(a.updated_at), { locale: ptBR, addSuffix: true })}</span>
        </div>
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: FlowAutomation["status"] }) {
  if (status === "active") return <Badge className="bg-success-soft text-success border-transparent hover:bg-success-soft">Ativa</Badge>;
  if (status === "paused") return <Badge variant="outline">Pausada</Badge>;
  return <Badge variant="secondary">Rascunho</Badge>;
}

function EmptyState({ onCreate, loading }: { onCreate: () => void; loading: boolean }) {
  return (
    <div className="rounded-xl border border-dashed p-16 text-center max-w-xl mx-auto mt-8">
      <div className="size-12 rounded-xl bg-brand-soft text-brand grid place-items-center mx-auto mb-4">
        <MessageSquare className="size-6" />
      </div>
      <h2 className="text-lg font-semibold mb-1">Nenhuma automação ainda</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Crie um fluxo: alguém comenta no seu Reel → recebe DM automática com o link.
      </p>
      <Button onClick={onCreate} disabled={loading} className="gap-2">
        <Plus className="size-4" />
        Criar primeira automação
      </Button>
    </div>
  );
}
