import { useEffect, useMemo, useState } from "react";
import { createFileRoute, createLink } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, Download, ExternalLink, GripVertical, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { BarChart } from "@mui/x-charts/BarChart";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  getSurvey,
  saveSurvey,
  listSurveyResponses,
  exportSurveyResponsesCsv,
  type SurveyQuestion,
  type SurveyQuestionType,
} from "@/lib/surveys.functions";

export const Route = createFileRoute("/pesquisas/$surveyId")({
  head: () => ({
    meta: [{ title: "Editar pesquisa | CRM Insights" }],
  }),
  component: SurveyEditorPage,
});

const LinkIconButton = createLink(IconButton);

const QUESTION_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  texto_curto: "Texto curto",
  texto_longo: "Texto longo",
  multipla_escolha: "Múltipla escolha",
  escolha_unica: "Escolha única",
  nota: "Nota (1 a 5)",
  sim_nao: "Sim / Não",
};

const HAS_OPTIONS: SurveyQuestionType[] = ["multipla_escolha", "escolha_unica"];

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function newQuestion(): SurveyQuestion {
  return { id: crypto.randomUUID(), type: "texto_curto", label: "", required: false };
}

function SurveyEditorPage() {
  const { surveyId } = Route.useParams();
  const runGet = useServerFn(getSurvey);
  const runSave = useServerFn(saveSurvey);
  const runResponses = useServerFn(listSurveyResponses);
  const runExport = useServerFn(exportSurveyResponsesCsv);

  const [tab, setTab] = useState<"perguntas" | "respostas">("perguntas");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: survey, isLoading } = useQuery({
    queryKey: ["survey", surveyId],
    queryFn: () => runGet({ data: { id: surveyId } }),
  });

  useEffect(() => {
    if (survey && !loaded) {
      setTitle(survey.title);
      setSlug(survey.slug);
      setDescription(survey.description ?? "");
      setThankYouMessage(survey.thank_you_message);
      setIsActive(survey.is_active);
      setQuestions(survey.questions);
      setLoaded(true);
    }
  }, [survey, loaded]);

  const { data: responses } = useQuery({
    queryKey: ["survey-responses", surveyId],
    queryFn: () => runResponses({ data: { surveyId } }),
    enabled: tab === "respostas",
  });

  const saveMut = useMutation({
    mutationFn: () =>
      runSave({
        data: { id: surveyId, title, slug, description, thank_you_message: thankYouMessage, is_active: isActive, questions },
      }),
    onSuccess: () => toast.success("Pesquisa salva."),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const addQuestion = () => setQuestions((prev) => [...prev, newQuestion()]);
  const removeQuestion = (id: string) => setQuestions((prev) => prev.filter((q) => q.id !== id));
  const updateQuestion = (id: string, patch: Partial<SurveyQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const moveQuestion = (index: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/pesquisa/${slug}`);
    toast.success("Link copiado.");
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { csv, filename } = await runExport({ data: { surveyId } });
      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar.");
    } finally {
      setExporting(false);
    }
  };

  const closedQuestionCharts = useMemo(() => {
    if (!responses) return [];
    return questions
      .filter((q) => HAS_OPTIONS.includes(q.type) || q.type === "sim_nao" || q.type === "nota")
      .map((q) => {
        const tally = new Map<string, number>();
        const labels =
          q.type === "sim_nao" ? ["Sim", "Não"] : q.type === "nota" ? ["1", "2", "3", "4", "5"] : q.options ?? [];
        for (const label of labels) tally.set(label, 0);
        for (const r of responses) {
          const v = r.answers[q.id];
          const values = Array.isArray(v) ? v : v != null ? [String(v)] : [];
          for (const val of values) tally.set(val, (tally.get(val) ?? 0) + 1);
        }
        return { question: q, dataset: labels.map((label) => ({ label, count: tally.get(label) ?? 0 })) };
      });
  }, [questions, responses]);

  if (isLoading || !loaded) {
    return <Typography variant="body2" color="text.secondary" sx={{ p: 4 }}>Carregando...</Typography>;
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1, minWidth: 260 }}>
          <LinkIconButton to="/pesquisas">
            <ArrowLeft size={20} />
          </LinkIconButton>
          <TextField
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da pesquisa"
            variant="standard"
            sx={{ minWidth: 240, "& .MuiInputBase-input": { fontSize: 22, fontWeight: 700 } }}
          />
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <FormControlLabel
            labelPlacement="start"
            control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
            label={<Typography variant="body2" color="text.secondary">{isActive ? "Ativa" : "Pausada"}</Typography>}
          />
          <Button variant="contained" startIcon={<Save size={16} />} onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            Salvar
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2, mb: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <TextField
            label="Link (slug)"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            helperText={`URL pública: /pesquisa/${slug || "..."}`}
            sx={{ minWidth: 260, flex: 1 }}
          />
          <Button variant="outlined" startIcon={<Copy size={14} />} onClick={copyLink}>Copiar link</Button>
          <Button
            variant="outlined"
            startIcon={<ExternalLink size={14} />}
            component="a"
            href={`/pesquisa/${slug}`}
            target="_blank"
          >
            Abrir
          </Button>
        </Stack>
      </Box>

      <Box sx={{ borderBottom: "1px solid", borderColor: "divider", mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab value="perguntas" label={`Perguntas (${questions.length})`} />
          <Tab value="respostas" label={`Respostas (${responses?.length ?? "—"})`} />
        </Tabs>
      </Box>

      {tab === "perguntas" && (
        <Stack spacing={3}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            <TextField
              label="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
            <TextField
              label="Mensagem de agradecimento"
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Box>

          <Stack spacing={1.5}>
            {questions.map((q, index) => (
              <Box key={q.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                  <Stack sx={{ alignItems: "center", color: "text.secondary", pt: 1 }}>
                    <GripVertical size={16} />
                    <Typography variant="caption">{index + 1}</Typography>
                  </Stack>
                  <Stack spacing={1.5} sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
                      <TextField
                        label="Pergunta"
                        value={q.label}
                        onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                        sx={{ flex: 1, minWidth: 220 }}
                      />
                      <TextField
                        select
                        label="Tipo"
                        value={q.type}
                        onChange={(e) => {
                          const type = e.target.value as SurveyQuestionType;
                          const patch: Partial<SurveyQuestion> = { type };
                          if (HAS_OPTIONS.includes(type)) patch.options = q.options?.length ? q.options : ["Opção 1", "Opção 2"];
                          updateQuestion(q.id, patch);
                        }}
                        sx={{ minWidth: 180 }}
                      >
                        {Object.entries(QUESTION_TYPE_LABEL).map(([value, label]) => (
                          <MenuItem key={value} value={value}>{label}</MenuItem>
                        ))}
                      </TextField>
                      <FormControlLabel
                        control={<Switch checked={q.required} onChange={(e) => updateQuestion(q.id, { required: e.target.checked })} />}
                        label="Obrigatória"
                      />
                    </Stack>

                    {HAS_OPTIONS.includes(q.type) && (
                      <Stack spacing={1}>
                        <Typography variant="caption" color="text.secondary">Opções</Typography>
                        {(q.options ?? []).map((opt, optIndex) => (
                          <Stack key={optIndex} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <TextField
                              size="small"
                              value={opt}
                              onChange={(e) => {
                                const next = [...(q.options ?? [])];
                                next[optIndex] = e.target.value;
                                updateQuestion(q.id, { options: next });
                              }}
                              fullWidth
                            />
                            <IconButton
                              size="small"
                              onClick={() => updateQuestion(q.id, { options: (q.options ?? []).filter((_, i) => i !== optIndex) })}
                            >
                              <X size={14} />
                            </IconButton>
                          </Stack>
                        ))}
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Plus size={14} />}
                          sx={{ width: "fit-content" }}
                          onClick={() => updateQuestion(q.id, { options: [...(q.options ?? []), `Opção ${(q.options?.length ?? 0) + 1}`] })}
                        >
                          Adicionar opção
                        </Button>
                      </Stack>
                    )}
                  </Stack>
                  <Stack spacing={0.5}>
                    <IconButton size="small" disabled={index === 0} onClick={() => moveQuestion(index, -1)}>▲</IconButton>
                    <IconButton size="small" disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)}>▼</IconButton>
                    <IconButton size="small" color="error" onClick={() => removeQuestion(q.id)}><Trash2 size={16} /></IconButton>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>

          <Button variant="outlined" startIcon={<Plus size={16} />} sx={{ width: "fit-content" }} onClick={addQuestion}>
            Adicionar pergunta
          </Button>
        </Stack>
      )}

      {tab === "respostas" && (
        <Stack spacing={3}>
          <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
            <Button variant="outlined" startIcon={<Download size={16} />} onClick={handleExport} disabled={exporting || !responses?.length}>
              Exportar CSV
            </Button>
          </Stack>

          {closedQuestionCharts.length > 0 && (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
              {closedQuestionCharts.map(({ question, dataset }) => (
                <Box key={question.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={question.label}>{question.label}</Typography>
                  <Box sx={{ mt: 1, height: 200 }}>
                    <BarChart
                      dataset={dataset}
                      xAxis={[{ dataKey: "label", scaleType: "band" }]}
                      series={[{ dataKey: "count", color: "#7367F0" }]}
                      height={200}
                      margin={{ left: 36, right: 10, top: 10, bottom: 30 }}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data</TableCell>
                  <TableCell>Origem</TableCell>
                  {questions.map((q) => (
                    <TableCell key={q.id}>{q.label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {(!responses || responses.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={questions.length + 2} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      Nenhuma resposta ainda.
                    </TableCell>
                  </TableRow>
                )}
                {responses?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{r.source ? <Chip size="small" variant="outlined" label={r.source} /> : "—"}</TableCell>
                    {questions.map((q) => {
                      const v = r.answers[q.id];
                      return <TableCell key={q.id}>{Array.isArray(v) ? v.join(", ") : String(v ?? "—")}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
    </Box>
  );
}
