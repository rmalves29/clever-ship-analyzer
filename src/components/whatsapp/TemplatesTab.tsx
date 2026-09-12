import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, BarChart3, Copy, Pencil, Trash2, RefreshCw, Plus, X, Clock } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  listMetaTemplates,
  getTemplateStats,
  duplicateMetaTemplate,
  updateMetaTemplate,
  deleteMetaTemplate,
  getRecentTemplateEvents,
} from "@/lib/whatsapp-meta.functions";
import { createMetaTemplateWithVariables } from "@/lib/whatsapp-template-create.functions";
import {
  buildBodyVariableExample,
  renderTemplateVariablePreview,
  validateTemplateVariables,
} from "@/lib/whatsapp-template-variables";

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

const STATUS_COLOR: Record<string, "success" | "warning" | "error" | "default"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "error",
  PAUSED: "default",
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
  const runCreate = useServerFn(createMetaTemplateWithVariables);
  const runGetEvents = useServerFn(getRecentTemplateEvents);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [newLanguage, setNewLanguage] = useState("pt_BR");
  const [newHeader, setNewHeader] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newFooter, setNewFooter] = useState("");
  const [newButtons, setNewButtons] = useState<string[]>([]);
  const [newVariableExamples, setNewVariableExamples] = useState<string[]>([]);
  const [newLinkButtons, setNewLinkButtons] = useState<{ text: string; url: string; example: string }[]>([]);
  const [creating, setCreating] = useState(false);

  const newVariableValidation = useMemo(() => validateTemplateVariables(newBody), [newBody]);
  const newVariableCount = newVariableValidation.indexes.length;
  const variableExamplesReady =
    newVariableValidation.valid &&
    (newVariableCount === 0 ||
      newVariableValidation.indexes.every((_, index) => Boolean(newVariableExamples[index]?.trim())));

  // Cada botão de link só aceita 1 variável ({{1}}), sempre no final da URL — diferente das
  // variáveis do corpo, que podem ser várias em qualquer posição. A Meta permite no máximo 2
  // botões de call-to-action (link ou telefone) por template.
  const linkButtonsReady = newLinkButtons.every(
    (b) => Boolean(b.text.trim()) && Boolean(b.url.trim()) && (!b.url.includes("{{1}}") || Boolean(b.example.trim())),
  );

  const resetNewForm = () => {
    setNewName("");
    setNewCategory("MARKETING");
    setNewLanguage("pt_BR");
    setNewHeader("");
    setNewBody("");
    setNewFooter("");
    setNewButtons([]);
    setNewVariableExamples([]);
    setNewLinkButtons([]);
  };

  const handleCreate = async () => {
    if (!newBody.trim()) {
      toast.error("O corpo da mensagem é obrigatório.");
      return;
    }

    const bodyExample = buildBodyVariableExample(newBody.trim(), newVariableExamples);
    if (!bodyExample.success) {
      toast.error(bodyExample.error);
      return;
    }

    if (!linkButtonsReady) {
      toast.error("Preencha o texto e a URL de cada botão de link (e a URL de exemplo, se usar {{1}}).");
      return;
    }

    setCreating(true);
    try {
      const bodyComponent = {
        type: "BODY" as const,
        text: newBody.trim(),
        ...(bodyExample.example ? { example: bodyExample.example } : {}),
      };
      const components: any[] = [bodyComponent];
      if (newHeader.trim()) components.unshift({ type: "HEADER", format: "TEXT", text: newHeader.trim() });
      if (newFooter.trim()) components.push({ type: "FOOTER", text: newFooter.trim() });
      const buttonTexts = newButtons.map((b) => b.trim()).filter(Boolean);
      const buttons: any[] = buttonTexts.map((text) => ({ type: "QUICK_REPLY", text }));
      for (const linkButton of newLinkButtons) {
        buttons.push({
          type: "URL",
          text: linkButton.text.trim(),
          url: linkButton.url.trim(),
          ...(linkButton.url.includes("{{1}}") ? { example: [linkButton.example.trim()] } : {}),
        });
      }
      if (buttons.length) components.push({ type: "BUTTONS", buttons });

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
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <TextField placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} size="small" sx={{ maxWidth: 320 }} />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={() => refetch()}>
            Atualizar
          </Button>
          <Button size="small" variant="contained" startIcon={<Plus size={14} />} onClick={() => setNewOpen(true)}>
            Novo template
          </Button>
        </Stack>
      </Stack>

      {events && events.length > 0 && (
        <Box sx={{ mt: 1.5, border: "1px solid", borderColor: "divider", bgcolor: "action.hover", borderRadius: 3, p: 1.5 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1 }}>
            <Clock size={14} />
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
              Últimas atualizações da Meta
            </Typography>
          </Stack>
          <Stack spacing={0.5}>
            {events.slice(0, 5).map((e) => (
              <Stack key={e.id} direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "baseline", color: "text.secondary" }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>{e.template_name}</Typography>
                <Typography variant="body2">{EVENT_LABEL[e.event] ?? e.event.toLowerCase()}</Typography>
                {e.reason && <Typography variant="caption">— {e.reason}</Typography>}
                <Typography variant="caption">{new Date(e.received_at).toLocaleString("pt-BR")}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <TableContainer sx={{ mt: 2, border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
        <Table sx={{ minWidth: 720 }} size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Categoria</TableCell>
              <TableCell>Idioma</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>Carregando...</TableCell></TableRow>
            )}
            {!isLoading && templatesResult && !templatesResult.success && (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>{templatesResult.error}</TableCell></TableRow>
            )}
            {!isLoading && templatesResult?.success && templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Nenhum template encontrado na conta Meta.</Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ mt: 2 }}
                    onClick={() => window.open("https://business.facebook.com/wa/manage/message-templates/", "_blank")}
                  >
                    Gerenciar Templates na Meta
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                <TableCell sx={{ color: "text.secondary" }}>{t.category}</TableCell>
                <TableCell sx={{ color: "text.secondary" }}>{t.language}</TableCell>
                <TableCell>
                  <Chip size="small" color={STATUS_COLOR[t.status] ?? "default"} label={t.status} />
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                    <IconButton size="small" title="Ver mensagem" onClick={() => setPreviewTemplate(t)}><Eye size={16} /></IconButton>
                    <IconButton size="small" title="Estatísticas" onClick={() => setStatsTemplate(t)}><BarChart3 size={16} /></IconButton>
                    <IconButton size="small" title="Editar" onClick={() => openEdit(t)}><Pencil size={16} /></IconButton>
                    <IconButton size="small" title="Duplicar" onClick={() => handleDuplicate(t)}><Copy size={16} /></IconButton>
                    <IconButton size="small" title="Excluir" color="error" onClick={() => handleDelete(t)}><Trash2 size={16} /></IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(previewTemplate)} onClose={() => setPreviewTemplate(null)} maxWidth="sm" fullWidth>
        <DialogContent>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{previewTemplate?.name}</Typography>
          <Box sx={{ mt: 1.5, borderRadius: 3, bgcolor: "#075E54", p: 2, color: "#fff" }}>
            {previewTemplate?.components
              .filter((c) => c.type === "HEADER" && c.format !== "IMAGE" && c.text)
              .map((c, i) => <Typography key={i} sx={{ fontWeight: 700 }}>{c.text}</Typography>)}
            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{previewTemplate ? bodyText(previewTemplate) : ""}</Typography>
            {previewTemplate?.components
              .filter((c) => c.type === "FOOTER" && c.text)
              .map((c, i) => <Typography key={i} variant="caption" sx={{ mt: 0.5, display: "block", color: "rgba(255,255,255,0.7)" }}>{c.text}</Typography>)}
          </Box>
        </DialogContent>
      </Dialog>

      <TemplateStatsDialog template={statsTemplate} onOpenChange={(v) => !v && setStatsTemplate(null)} />

      <Dialog open={Boolean(editTemplate)} onClose={() => setEditTemplate(null)} maxWidth="sm" fullWidth>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Editar template</Typography>
            {editTemplate?.status === "APPROVED" && (
              <Typography variant="body2" color="warning.main">Esse template já está aprovado — editar reenvia ele pra revisão da Meta.</Typography>
            )}
            <TextField value={editBody} onChange={(e) => setEditBody(e.target.value)} multiline minRows={5} fullWidth />
            <Button variant="contained" fullWidth onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? "Salvando..." : "Salvar"}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={newOpen} onClose={() => { setNewOpen(false); resetNewForm(); }} maxWidth="md" fullWidth scroll="paper">
        <DialogContent>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Novo template</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Ao salvar, o template é enviado direto pra revisão da Meta. Se usar variáveis, informe exemplos reais abaixo — eles servem apenas para a aprovação e não serão enviados aos clientes.
              </Typography>
            </Box>

            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
              <TextField
                label="Nome (sem espaços/acentos)"
                value={newName}
                onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="ex: carrinho_abandonado_v1"
                fullWidth
              />
              <TextField select label="Idioma" value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)} fullWidth>
                {LANGUAGES.map((l) => <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>)}
              </TextField>
            </Box>

            <TextField select label="Categoria" value={newCategory} onChange={(e) => setNewCategory(e.target.value as typeof newCategory)} fullWidth>
              <MenuItem value="MARKETING">Marketing (promoções, novidades)</MenuItem>
              <MenuItem value="UTILITY">Utilidade (atualização de pedido, cobrança)</MenuItem>
              <MenuItem value="AUTHENTICATION">Autenticação (código de verificação)</MenuItem>
            </TextField>

            <TextField label="Cabeçalho (opcional)" value={newHeader} onChange={(e) => setNewHeader(e.target.value)} placeholder="Título curto em negrito" slotProps={{ htmlInput: { maxLength: 60 } }} fullWidth />

            <Box>
              <TextField
                label={`Corpo — use {{1}}, {{2}}... pra variáveis`}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                multiline
                minRows={4}
                placeholder="Oi {{1}}, seu pedido {{2}} foi enviado!"
                slotProps={{ htmlInput: { maxLength: 1024 } }}
                fullWidth
              />
              {!newVariableValidation.valid && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>{newVariableValidation.error}</Typography>
              )}
            </Box>

            {newVariableValidation.valid && newVariableCount > 0 && (
              <Stack spacing={1.5} sx={{ border: "1px solid", borderColor: "primary.light", bgcolor: "primary.50", borderRadius: 3, p: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Exemplos das variáveis</Typography>
                  <Typography variant="caption" color="text.secondary">
                    A Meta usa estes valores somente para entender e aprovar o template. No disparo, cada cliente receberá os dados dinâmicos configurados na campanha ou automação.
                  </Typography>
                </Box>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                  {newVariableValidation.indexes.map((variableNumber, index) => (
                    <TextField
                      key={variableNumber}
                      label={`Variável {{${variableNumber}}}`}
                      value={newVariableExamples[index] ?? ""}
                      onChange={(e) => {
                        const next = [...newVariableExamples];
                        next[index] = e.target.value;
                        setNewVariableExamples(next);
                      }}
                      placeholder={index === 0 ? "Ex: Maria" : index === 1 ? "Ex: #1548" : "Exemplo real"}
                      fullWidth
                    />
                  ))}
                </Box>
              </Stack>
            )}

            <TextField label="Rodapé (opcional)" value={newFooter} onChange={(e) => setNewFooter(e.target.value)} placeholder="ex: Responda STOP para sair" slotProps={{ htmlInput: { maxLength: 60 } }} fullWidth />

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>Botões de resposta rápida (opcional)</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {newButtons.map((b, i) => (
                  <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField
                      value={b}
                      onChange={(e) => setNewButtons((prev) => prev.map((x, xi) => (xi === i ? e.target.value : x)))}
                      placeholder="ex: Quero saber mais"
                      slotProps={{ htmlInput: { maxLength: 25 } }}
                      fullWidth
                    />
                    <IconButton size="small" onClick={() => setNewButtons((prev) => prev.filter((_, xi) => xi !== i))}><X size={16} /></IconButton>
                  </Stack>
                ))}
                {newButtons.length < 3 && (
                  <Button size="small" variant="outlined" startIcon={<Plus size={14} />} sx={{ width: "fit-content" }} onClick={() => setNewButtons((prev) => [...prev, ""])}>
                    Adicionar botão
                  </Button>
                )}
              </Stack>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>Botões de link (opcional, máx. 2)</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Pra um link que muda por cliente (ex: pagamento), a Meta só aceita variável no FINAL de uma URL com domínio
                fixo — ex: <code>https://minhaloja.com.br/pedido/{"{{1}}"}</code>. Um link totalmente diferente por pedido
                (como o de status da Shopify) não cabe nesse formato — nesses casos, continue mandando o link como texto no
                corpo da mensagem.
              </Typography>
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                {newLinkButtons.map((linkButton, i) => {
                  const hasVariable = linkButton.url.includes("{{1}}");
                  return (
                    <Stack key={i} spacing={1} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, flex: 1 }}>
                          <TextField
                            value={linkButton.text}
                            onChange={(e) => setNewLinkButtons((prev) => prev.map((b, bi) => (bi === i ? { ...b, text: e.target.value } : b)))}
                            placeholder="Texto do botão (ex: Pagar agora)"
                            slotProps={{ htmlInput: { maxLength: 25 } }}
                            fullWidth
                          />
                          <TextField
                            value={linkButton.url}
                            onChange={(e) => setNewLinkButtons((prev) => prev.map((b, bi) => (bi === i ? { ...b, url: e.target.value } : b)))}
                            placeholder="https://... (ou termine com {{1}} pra um link diferente por cliente)"
                            fullWidth
                          />
                        </Box>
                        <IconButton size="small" onClick={() => setNewLinkButtons((prev) => prev.filter((_, bi) => bi !== i))}><X size={16} /></IconButton>
                      </Stack>
                      {hasVariable && (
                        <TextField
                          label="Exemplo de URL completa (só pra Meta aprovar)"
                          value={linkButton.example}
                          onChange={(e) => setNewLinkButtons((prev) => prev.map((b, bi) => (bi === i ? { ...b, example: e.target.value } : b)))}
                          placeholder="https://minhaloja.com.br/pedido/1548"
                          fullWidth
                        />
                      )}
                    </Stack>
                  );
                })}
                {newLinkButtons.length < 2 && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Plus size={14} />}
                    sx={{ width: "fit-content" }}
                    onClick={() => setNewLinkButtons((prev) => [...prev, { text: "", url: "", example: "" }])}
                  >
                    Adicionar botão de link
                  </Button>
                )}
              </Stack>
            </Box>

            {(newHeader || newBody || newFooter) && (
              <Box sx={{ borderRadius: 3, bgcolor: "#075E54", p: 2, color: "#fff" }}>
                {newHeader && <Typography sx={{ fontWeight: 700 }}>{newHeader}</Typography>}
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{renderTemplateVariablePreview(newBody, newVariableExamples)}</Typography>
                {newFooter && <Typography variant="caption" sx={{ mt: 0.5, display: "block", color: "rgba(255,255,255,0.7)" }}>{newFooter}</Typography>}
                {(newButtons.filter(Boolean).length > 0 || newLinkButtons.some((b) => b.text.trim())) && (
                  <Stack spacing={0.5} sx={{ mt: 1, borderTop: "1px solid rgba(255,255,255,0.2)", pt: 1 }}>
                    {newButtons.filter(Boolean).map((b, i) => (
                      <Typography key={i} variant="body2" sx={{ textAlign: "center", color: "#53bdeb" }}>{b}</Typography>
                    ))}
                    {newLinkButtons
                      .filter((b) => b.text.trim())
                      .map((b, i) => (
                        <Typography key={i} variant="body2" sx={{ textAlign: "center", color: "#53bdeb" }}>🔗 {b.text}</Typography>
                      ))}
                  </Stack>
                )}
              </Box>
            )}

            <Button
              variant="contained"
              fullWidth
              onClick={handleCreate}
              disabled={creating || !newName || !newBody || !variableExamplesReady || !linkButtonsReady}
            >
              {creating ? "Enviando pra Meta..." : "Enviar pra aprovação"}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
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
    <Dialog open={Boolean(template)} onClose={() => onOpenChange(false)} maxWidth="sm" fullWidth scroll="paper">
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{template?.name}</Typography>
          {data && (
            <>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(3, 1fr)", textAlign: "center" }}>
                <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 1.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{data.enviados}</Typography>
                  <Typography variant="caption" color="text.secondary">Enviados</Typography>
                </Box>
                <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 1.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{data.entregues}</Typography>
                  <Typography variant="caption" color="text.secondary">Entregues ({rate(data.entregues, data.enviados)})</Typography>
                </Box>
                <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 1.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{data.lidos}</Typography>
                  <Typography variant="caption" color="text.secondary">Lidos ({rate(data.lidos, data.enviados)})</Typography>
                </Box>
              </Box>
              <TableContainer sx={{ maxHeight: 192, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Data</TableCell>
                      <TableCell>Env</TableCell>
                      <TableCell>Ent</TableCell>
                      <TableCell>Lid</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.porDia.length === 0 && (
                      <TableRow><TableCell colSpan={4} align="center" sx={{ py: 2, color: "text.secondary" }}>Sem envios ainda.</TableCell></TableRow>
                    )}
                    {data.porDia.map((d) => (
                      <TableRow key={d.data}>
                        <TableCell>{d.data}</TableCell>
                        <TableCell>{d.env}</TableCell>
                        <TableCell>{d.ent}</TableCell>
                        <TableCell>{d.lid}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
