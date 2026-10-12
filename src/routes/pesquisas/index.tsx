import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { SurveyTree } from "@/components/pesquisas/SurveyTree";
import { buildTagDictionary, buildTreeLayout } from "@/lib/survey-tree";
import { listSurveys, saveSurvey, toggleSurvey, deleteSurvey, type Survey } from "@/lib/surveys.functions";

export const Route = createFileRoute("/pesquisas/")({
  head: () => ({
    meta: [
      { title: "Pesquisas | CRM Insights" },
      { name: "description", content: "Cada pesquisa como uma árvore de perguntas e respostas, com o caminho de cada resposta e as etiquetas que ela grava." },
    ],
  }),
  component: PesquisasPage,
});

type SurveyRow = Survey & { responseCount: number };

const LEGEND: { label: string; color: "info" | "success" | "secondary" | "warning" | "text" }[] = [
  { label: "Botões", color: "info" },
  { label: "Lista", color: "success" },
  { label: "Texto livre", color: "secondary" },
  { label: "Mensagem", color: "warning" },
];

function legendColor(c: (typeof LEGEND)[number]["color"]): string {
  return c === "text" ? "text.disabled" : `${c}.main`;
}

function PesquisasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runList = useServerFn(listSurveys);
  const runSave = useServerFn(saveSurvey);
  const runToggle = useServerFn(toggleSurvey);
  const runDelete = useServerFn(deleteSurvey);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem("pesquisas-aba");
    } catch {
      return null;
    }
  });
  const [tagQuery, setTagQuery] = useState("");

  const { data, isLoading, refetch } = useQuery({ queryKey: ["surveys"], queryFn: () => runList() });
  const surveys = (data ?? []) as SurveyRow[];
  const selected = useMemo(() => surveys.find((s) => s.id === selectedId) ?? surveys[0] ?? null, [surveys, selectedId]);

  useEffect(() => {
    if (!selected) return;
    try {
      window.localStorage.setItem("pesquisas-aba", selected.id);
    } catch {
      /* sem armazenamento: tudo bem */
    }
  }, [selected]);

  const layout = useMemo(() => (selected ? buildTreeLayout(selected.questions) : null), [selected]);
  const dictionary = useMemo(() => (selected ? buildTagDictionary(selected.questions) : []), [selected]);
  const filteredDictionary = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return q ? dictionary.filter((r) => `${r.tag} ${r.when}`.toLowerCase().includes(q)) : dictionary;
  }, [dictionary, tagQuery]);

  const createMut = useMutation({
    mutationFn: async () => {
      const suffix = Math.random().toString(36).slice(2, 6);
      return runSave({
        data: {
          slug: `nova-pesquisa-${suffix}`,
          title: "Nova pesquisa",
          description: "",
          questions: [{ id: crypto.randomUUID(), type: "texto_curto", label: "Qual seu nome?", required: false }],
          is_active: false,
          thank_you_message: "Obrigado por participar da pesquisa!",
        },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      navigate({ to: "/pesquisas/$surveyId", params: { surveyId: res.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar pesquisa."),
  });

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/pesquisa/${slug}`);
    toast.success("Link copiado.");
  };

  const handleToggle = async (s: SurveyRow, next: boolean) => {
    setBusy(true);
    try {
      await runToggle({ data: { id: s.id, is_active: next } });
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (s: SurveyRow) => {
    if (!window.confirm(`Excluir a pesquisa "${s.title}"? As respostas também serão apagadas.`)) return;
    setBusy(true);
    try {
      await runDelete({ data: { id: s.id } });
      toast.success("Pesquisa excluída.");
      setSelectedId(null);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  };

  const edit = (s: SurveyRow) => navigate({ to: "/pesquisas/$surveyId", params: { surveyId: s.id } });

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Stack direction="row" role="tablist" aria-label="Pesquisas" sx={{ flexWrap: "wrap", gap: 1 }}>
          {surveys.map((s, i) => {
            const active = selected?.id === s.id;
            return (
              <Box
                key={s.id}
                component="button"
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedId(s.id)}
                sx={{
                  font: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                  cursor: "pointer",
                  px: 1.75,
                  py: 1,
                  borderRadius: 999,
                  border: "1px solid",
                  borderColor: active ? "text.primary" : "divider",
                  bgcolor: active ? "text.primary" : "transparent",
                  color: active ? "background.paper" : "text.primary",
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                }}
              >
                <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12, opacity: 0.75 }}>P{i + 1}</Box>
                {s.title}
              </Box>
            );
          })}
        </Stack>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          Nova pesquisa
        </Button>
      </Stack>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">Carregando...</Typography>
      ) : !selected || !layout ? (
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 6, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 600 }}>Nenhuma pesquisa criada ainda.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Crie a primeira e desenhe o caminho das respostas; depois gere o link (ou etiqueta NFC) para coletar.
          </Typography>
          <Button variant="contained" startIcon={<Plus size={16} />} sx={{ mt: 2 }} onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            Nova pesquisa
          </Button>
        </Box>
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{selected.title}</Typography>
              {selected.description ? (
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "68ch" }}>{selected.description}</Typography>
              ) : null}
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <FormControlLabel
                labelPlacement="start"
                control={<Switch checked={selected.is_active} disabled={busy} onChange={(e) => handleToggle(selected, e.target.checked)} />}
                label={<Typography variant="body2" color="text.secondary">{selected.is_active ? "Ativa" : "Pausada"}</Typography>}
              />
              <Button variant="outlined" startIcon={<Pencil size={14} />} onClick={() => edit(selected)}>Editar</Button>
              <IconButton size="small" title="Copiar link" onClick={() => copyLink(selected.slug)}><Copy size={16} /></IconButton>
              <IconButton size="small" title="Abrir pesquisa" component="a" href={`/pesquisa/${selected.slug}`} target="_blank"><ExternalLink size={16} /></IconButton>
              <IconButton size="small" color="error" title="Excluir" disabled={busy} onClick={() => handleDelete(selected)}><Trash2 size={16} /></IconButton>
            </Stack>
          </Stack>

          <Box
            component="dl"
            sx={{
              m: 0,
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0, 1fr))" },
              gap: "1px",
              bgcolor: "divider",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2.5,
              overflow: "hidden",
            }}
          >
            {[
              ["Link", `/pesquisa/${selected.slug}`],
              ["Perguntas", String(selected.questions.length)],
              ["Respostas", String(selected.responseCount)],
              ["Etiquetas gravadas", String(new Set(dictionary.map((r) => r.tag)).size)],
            ].map(([k, v]) => (
              <Box key={k} sx={{ bgcolor: "background.paper", px: 1.75, py: 1.5, minWidth: 0 }}>
                <Typography component="dt" variant="overline" sx={{ color: "text.secondary", lineHeight: 1, display: "block", mb: 0.75 }}>{k}</Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: "anywhere", fontFamily: k === "Link" ? "monospace" : undefined }}>{v}</Typography>
              </Box>
            ))}
          </Box>

          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, color: "text.secondary", fontSize: 13 }}>
            {LEGEND.map((l) => (
              <Box key={l.label} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: 0.75, bgcolor: legendColor(l.color) }} />
                {l.label}
              </Box>
            ))}
            <Box component="span">Passe o mouse numa resposta para ver o caminho dela.</Box>
          </Stack>

          {layout.unreachable.length > 0 && (
            <Alert severity="warning">
              {layout.unreachable.length === 1 ? "1 pergunta não é alcançada" : `${layout.unreachable.length} perguntas não são alcançadas`} por nenhuma resposta
              (ficam de fora da árvore). Ajuste os destinos no editor.
            </Alert>
          )}

          <SurveyTree questions={selected.questions} thankYou={selected.thank_you_message} onOpenQuestion={() => edit(selected)} />

          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.25, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Dicionário de etiquetas</Typography>
            <Typography variant="body2" color="text.secondary">
              Cada resposta pode gravar etiquetas na resposta da pesquisa; aqui está onde cada uma nasce.
            </Typography>
            <TextField size="small" type="search" placeholder="Buscar etiqueta ou resposta" value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} slotProps={{ htmlInput: { "aria-label": "Buscar etiqueta" } }} />
            <TableContainer sx={{ maxHeight: 360, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Etiqueta</TableCell>
                    <TableCell>Gravada quando</TableCell>
                    <TableCell>Pergunta</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDictionary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ color: "text.secondary", py: 3 }}>
                        {dictionary.length === 0 ? "Esta pesquisa ainda não grava etiquetas. Defina-as no editor, em cada resposta." : "Nenhuma etiqueta com esse termo."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDictionary.map((r, i) => (
                      <TableRow key={`${r.tag}-${r.questionId}-${i}`}>
                        <TableCell><Chip size="small" variant="outlined" label={r.tag} sx={{ fontFamily: "monospace" }} /></TableCell>
                        <TableCell>{r.when}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", color: "text.secondary" }}>#{r.position}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}
    </Box>
  );
}
