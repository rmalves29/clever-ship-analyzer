import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, BarChart3, Copy, Pencil, Trash2, RefreshCw, Plus, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listMetaTemplates,
  getTemplateStats,
  duplicateMetaTemplate,
  updateMetaTemplate,
  deleteMetaTemplate,
  createMetaTemplate,
  getRecentTemplateEvents,
} from "@/lib/whatsapp-meta.functions";

const LANGUAGES = [
  { value: "pt_BR", label: "Português (BR)" },
  { value: "en_US", label: "English (US)" },
  { value: "es_ES", label: "Español" },
];

const EVENT_LABEL: Record<string, string> = {
  APPROVED: "aprovado",
  REJECTED: "rejeitado",
  PENDING: "enviado pra revisão",
  PENDING_DELETION: "marcado pra exclusão",
  PAUSED: "pausado pela Meta",
  DISABLED: "desativado pela Meta",
  FLAGGED: "sinalizado pela Meta",
};

type TemplateRow = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: { type: string; text?: string; format?: string }[];
};

function bodyText(t: TemplateRow) {
  return t.components.find((c) => c.type === "BODY")?.text ?? "";
}

const STATUS_CLASS: Record<string, string> = {
  APPROVED: "bg-success-soft text-success",
  PENDING: "bg-warning-soft text-warning",
  REJECTED: "bg-critical-soft text-critical",
  PAUSED: "bg-muted text-muted-foreground",
};

export function TemplatesTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<TemplateRow | null>(null);
  const [statsTemplate, setStatsTemplate] = useState<TemplateRow | null>(null);
  const [editTemplate, setEditTemplate] = useState<TemplateRow | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: templatesResult, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => listMetaTemplates(),
    refetchInterval: (query) => {
      const list = query.state.data?.success ? (query.state.data.templates as TemplateRow[]) : [];
      return list.some((t) => t.status === "PENDING") ? 20_000 : false;
    },
  });

  const { data: events } = useQuery({
    queryKey: ["whatsapp-template-events"],
    queryFn: () => runGetEvents(),
    refetchInterval: 20_000,
  });

  const runDuplicate = useServerFn(duplicateMetaTemplate);
  const runUpdate = useServerFn(updateMetaTemplate);
  const runDelete = useServerFn(deleteMetaTemplate);
  const runCreate = useServerFn(createMetaTemplate);
  const runGetEvents = useServerFn(getRecentTemplateEvents);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [newLanguage, setNewLanguage] = useState("pt_BR");
  const [newHeader, setNewHeader] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newFooter, setNewFooter] = useState("");
  const [newButtons, setNewButtons] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const resetNewForm = () => {
    setNewName("");
    setNewCategory("MARKETING");
    setNewLanguage("pt_BR");
    setNewHeader("");
    setNewBody("");
    setNewFooter("");
    setNewButtons([]);
  };

  const handleCreate = async () => {
    if (!newBody.trim()) {
      toast.error("O corpo da mensagem é obrigatório.");
      return;
    }
    setCreating(true);
    try {
      const components: any[] = [{ type: "BODY", text: newBody.trim() }];
      if (newHeader.trim()) components.unshift({ type: "HEADER", format: "TEXT", text: newHeader.trim() });
      if (newFooter.trim()) components.push({ type: "FOOTER", text: newFooter.trim() });
      const buttonTexts = newButtons.map((b) => b.trim()).filter(Boolean);
      if (buttonTexts.length) components.push({ type: "BUTTONS", buttons: buttonTexts.map((text) => ({ type: "QUICK_REPLY", text })) });

      const res = await runCreate({ data: { name: newName, category: newCategory, language: newLanguage, components } });
      if (!res.success) {
        toast.error(res.error || "Falha ao criar o template.");
        return;
      }
      toast.success(`Template "${res.name}" enviado pra aprovação da Meta.`);
      setNewOpen(false);
      resetNewForm();
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-template-events"] });
    } catch (err: any) {
      toast.error("Erro: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setCreating(false);
    }
  };

  const templates = ((templatesResult?.success ? templatesResult.templates : []) as TemplateRow[]).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleDuplicate = async (t: TemplateRow) => {
    try {
      const res = await runDuplicate({ data: { sourceName: t.name, components: t.components, category: t.category, language: t.language } });
      if (!res.success) {
        toast.error(res.error || "Falha ao duplicar.");
        return;
      }
      toast.success(`Template duplicado como "${res.name}" (entra em revisão da Meta).`);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    } catch (err: any) {
      toast.error("Erro: " + (err?.message ?? "falha desconhecida"));
    }
  };

  const handleDelete = async (t: TemplateRow) => {
    if (!window.confirm(`Excluir o template "${t.name}"? Isso remove todas as línguas desse template na Meta.`)) return;
    try {
      const res = await runDelete({ data: { name: t.name } });
      if (!res.success) {
        toast.error(res.error || "Falha ao excluir.");
        return;
      }
      toast.success("Template excluído.");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    } catch (err: any) {
      toast.error("Erro: " + (err?.message ?? "falha desconhecida"));
    }
  };

  const openEdit = (t: TemplateRow) => {
    setEditTemplate(t);
    setEditBody(bodyText(t));
  };

  const handleSaveEdit = async () => {
    if (!editTemplate) return;
    setSavingEdit(true);
    try {
      const newComponents = editTemplate.components.map((c) => (c.type === "BODY" ? { ...c, text: editBody } : c));
      const res = await runUpdate({ data: { templateId: editTemplate.id, components: newComponents } });
      if (!res.success) {
        toast.error(res.error || "Falha ao salvar.");
        return;
      }
      toast.success(
        editTemplate.status === "APPROVED" ? "Template atualizado — voltou pra revisão da Meta." : "Template atualizado.",
      );
      setEditTemplate(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    } catch (err: any) {
      toast.error("Erro: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="size-3.5" /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="size-3.5" /> Novo template
          </Button>
        </div>
      </div>

      {events && events.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Clock className="size-3.5" /> Últimas atualizações da Meta
          </p>
          <ul className="space-y-1 text-sm">
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground">
                <span className="font-medium text-foreground">{e.template_name}</span>
                <span>{EVENT_LABEL[e.event] ?? e.event.toLowerCase()}</span>
                {e.reason && <span className="text-xs">— {e.reason}</span>}
                <span className="text-xs">{new Date(e.received_at).toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Idioma</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td>
              </tr>
            )}
            {!isLoading && templatesResult && !templatesResult.success && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{templatesResult.error}</td>
              </tr>
            )}
            {!isLoading && templatesResult?.success && templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <p className="text-muted-foreground">Nenhum template encontrado na conta Meta.</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 gap-2"
                    onClick={() => window.open("https://business.facebook.com/wa/manage/message-templates/", "_blank")}
                  >
                    Gerenciar Templates na Meta
                  </Button>
                </td>
              </tr>
            )}
            {templates.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.category}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.language}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[t.status] ?? "bg-muted text-muted-foreground"}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="size-8" title="Ver mensagem" onClick={() => setPreviewTemplate(t)}>
                      <Eye className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" title="Estatísticas" onClick={() => setStatsTemplate(t)}>
                      <BarChart3 className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" title="Editar" onClick={() => openEdit(t)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" title="Duplicar" onClick={() => handleDuplicate(t)}>
                      <Copy className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 text-critical" title="Excluir" onClick={() => handleDelete(t)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(previewTemplate)} onOpenChange={(v) => !v && setPreviewTemplate(null)}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold">{previewTemplate?.name}</h2>
          <div className="rounded-xl bg-[#075E54] p-4 text-white">
            {previewTemplate?.components
              .filter((c) => c.type === "HEADER" && c.format !== "IMAGE" && c.text)
              .map((c, i) => <p key={i} className="font-semibold">{c.text}</p>)}
            <p className="mt-1 whitespace-pre-wrap text-sm">{previewTemplate ? bodyText(previewTemplate) : ""}</p>
            {previewTemplate?.components
              .filter((c) => c.type === "FOOTER" && c.text)
              .map((c, i) => <p key={i} className="mt-1 text-xs text-white/70">{c.text}</p>)}
          </div>
        </DialogContent>
      </Dialog>

      <TemplateStatsDialog template={statsTemplate} onOpenChange={(v) => !v && setStatsTemplate(null)} />

      <Dialog open={Boolean(editTemplate)} onOpenChange={(v) => !v && setEditTemplate(null)}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold">Editar template</h2>
          {editTemplate?.status === "APPROVED" && (
            <p className="text-sm text-warning">Esse template já está aprovado — editar reenvia ele pra revisão da Meta.</p>
          )}
          <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={5} />
          <Button onClick={handleSaveEdit} disabled={savingEdit} className="w-full">
            {savingEdit ? "Salvando..." : "Salvar"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={newOpen} onOpenChange={(v) => { setNewOpen(v); if (!v) resetNewForm(); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <h2 className="text-lg font-semibold">Novo template</h2>
          <p className="text-sm text-muted-foreground">
            Ao salvar, o template é enviado direto pra revisão da Meta. Some da fila "PENDING" assim que ela aprovar ou rejeitar
            (a lista acima atualiza sozinha enquanto isso).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome (sem espaços/acentos)</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="ex: carrinho_abandonado_v1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Idioma</label>
              <Select value={newLanguage} onValueChange={setNewLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Categoria</label>
            <Select value={newCategory} onValueChange={(v) => setNewCategory(v as typeof newCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">Marketing (promoções, novidades)</SelectItem>
                <SelectItem value="UTILITY">Utilidade (atualização de pedido, cobrança)</SelectItem>
                <SelectItem value="AUTHENTICATION">Autenticação (código de verificação)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Cabeçalho (opcional)</label>
            <Input value={newHeader} onChange={(e) => setNewHeader(e.target.value)} placeholder="Título curto em negrito" maxLength={60} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Corpo — use {"{{1}}"}, {"{{2}}"}... pra variáveis (nome do cliente, cupom, etc.)
            </label>
            <Textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={4} placeholder="Oi {{1}}, vimos que..." maxLength={1024} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Rodapé (opcional)</label>
            <Input value={newFooter} onChange={(e) => setNewFooter(e.target.value)} placeholder="ex: Responda STOP para sair" maxLength={60} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Botões de resposta rápida (opcional)</label>
            <div className="mt-1 space-y-2">
              {newButtons.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={b}
                    onChange={(e) => setNewButtons((prev) => prev.map((x, xi) => (xi === i ? e.target.value : x)))}
                    placeholder="ex: Quero saber mais"
                    maxLength={25}
                  />
                  <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setNewButtons((prev) => prev.filter((_, xi) => xi !== i))}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              {newButtons.length < 3 && (
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setNewButtons((prev) => [...prev, ""])}>
                  <Plus className="size-3.5" /> Adicionar botão
                </Button>
              )}
            </div>
          </div>

          {(newHeader || newBody || newFooter) && (
            <div className="rounded-xl bg-[#075E54] p-4 text-white">
              {newHeader && <p className="font-semibold">{newHeader}</p>}
              <p className="mt-1 whitespace-pre-wrap text-sm">{newBody}</p>
              {newFooter && <p className="mt-1 text-xs text-white/70">{newFooter}</p>}
              {newButtons.filter(Boolean).length > 0 && (
                <div className="mt-2 space-y-1 border-t border-white/20 pt-2">
                  {newButtons.filter(Boolean).map((b, i) => (
                    <p key={i} className="text-center text-sm text-[#53bdeb]">{b}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button onClick={handleCreate} disabled={creating || !newName || !newBody} className="w-full">
            {creating ? "Enviando pra Meta..." : "Enviar pra aprovação"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateStatsDialog({ template, onOpenChange }: { template: TemplateRow | null; onOpenChange: (v: boolean) => void }) {
  const runStats = useServerFn(getTemplateStats);
  const { data } = useQuery({
    queryKey: ["whatsapp-template-stats", template?.name],
    queryFn: () => runStats({ data: { templateName: template!.name } }),
    enabled: Boolean(template),
  });

  const rate = (n: number, total: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0.0%");

  return (
    <Dialog open={Boolean(template)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <h2 className="text-lg font-semibold">{template?.name}</h2>
        {data && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-2xl font-bold">{data.enviados}</p>
                <p className="text-xs text-muted-foreground">Enviados</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-2xl font-bold">{data.entregues}</p>
                <p className="text-xs text-muted-foreground">Entregues ({rate(data.entregues, data.enviados)})</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-2xl font-bold">{data.lidos}</p>
                <p className="text-xs text-muted-foreground">Lidos ({rate(data.lidos, data.enviados)})</p>
              </div>
            </div>
            <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-left uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Env</th>
                    <th className="px-3 py-2">Ent</th>
                    <th className="px-3 py-2">Lid</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porDia.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Sem envios ainda.</td>
                    </tr>
                  )}
                  {data.porDia.map((d) => (
                    <tr key={d.data} className="border-t border-border">
                      <td className="px-3 py-1.5">{d.data}</td>
                      <td className="px-3 py-1.5">{d.env}</td>
                      <td className="px-3 py-1.5">{d.ent}</td>
                      <td className="px-3 py-1.5">{d.lid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
