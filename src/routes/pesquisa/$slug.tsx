import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2, ClipboardList } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { getPublicSurvey, submitSurveyResponse, type SurveyQuestion } from "@/lib/surveys.functions";

export const Route = createFileRoute("/pesquisa/$slug")({
  validateSearch: (search: Record<string, unknown>) => z.object({ origem: z.string().optional() }).parse(search),
  head: () => ({
    meta: [{ title: "Pesquisa" }],
  }),
  component: PublicSurveyPage,
});

type AnswerValue = string | string[];

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) {
  switch (question.type) {
    case "texto_curto":
      return <TextField value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} fullWidth />;
    case "texto_longo":
      return <TextField value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} multiline minRows={3} fullWidth />;
    case "sim_nao":
      return (
        <RadioGroup row value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <FormControlLabel value="Sim" control={<Radio />} label="Sim" />
          <FormControlLabel value="Não" control={<Radio />} label="Não" />
        </RadioGroup>
      );
    case "escolha_unica":
      return (
        <RadioGroup value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          {(question.options ?? []).map((opt) => (
            <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
          ))}
        </RadioGroup>
      );
    case "multipla_escolha": {
      const selected = (value as string[]) ?? [];
      return (
        <FormGroup>
          {(question.options ?? []).map((opt) => (
            <FormControlLabel
              key={opt}
              control={
                <Checkbox
                  checked={selected.includes(opt)}
                  onChange={(e) => {
                    onChange(e.target.checked ? [...selected, opt] : selected.filter((o) => o !== opt));
                  }}
                />
              }
              label={opt}
            />
          ))}
        </FormGroup>
      );
    }
    case "nota":
      return (
        <ToggleButtonGroup
          exclusive
          value={(value as string) ?? null}
          onChange={(_, v) => v && onChange(v)}
          sx={{ flexWrap: "wrap" }}
        >
          {["1", "2", "3", "4", "5"].map((n) => (
            <ToggleButton key={n} value={n} sx={{ width: 48, height: 48 }}>
              {n}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      );
    default:
      return null;
  }
}

function PublicSurveyPage() {
  const { slug } = Route.useParams();
  const { origem } = Route.useSearch();
  const runGetSurvey = useServerFn(getPublicSurvey);
  const runSubmit = useServerFn(submitSurveyResponse);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data: survey, isLoading } = useQuery({
    queryKey: ["public-survey", slug],
    queryFn: () => runGetSurvey({ data: { slug } }),
  });

  const submitMut = useMutation({
    mutationFn: () => runSubmit({ data: { slug, answers, source: origem ?? null } }),
    onSuccess: (res) => {
      if (res.success) setSubmitted(true);
      else alert(res.error ?? "Não foi possível enviar a resposta.");
    },
    onError: (e: any) => alert(e?.message ?? "Não foi possível enviar a resposta."),
  });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
      <Box sx={{ width: "100%", maxWidth: 560, border: "1px solid", borderColor: "divider", borderRadius: 4, p: { xs: 3, sm: 4 }, bgcolor: "background.paper" }}>
        {isLoading ? (
          <Stack sx={{ alignItems: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : !survey ? (
          <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center", py: 4 }}>
            <ClipboardList size={32} color="var(--mui-palette-text-secondary, #6f6b7d)" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Pesquisa não encontrada</Typography>
            <Typography variant="body2" color="text.secondary">Esse link não existe mais ou a pesquisa foi encerrada.</Typography>
          </Stack>
        ) : submitted ? (
          <Stack spacing={1.5} sx={{ alignItems: "center", textAlign: "center", py: 4 }}>
            <CheckCircle2 size={40} color="var(--mui-palette-success-main, #28C76F)" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{survey.thank_you_message}</Typography>
          </Stack>
        ) : (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{survey.title}</Typography>
              {survey.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{survey.description}</Typography>
              )}
            </Box>

            <Stack spacing={2.5}>
              {survey.questions.map((q) => (
                <Box key={q.id}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                    {q.label}{q.required && <Typography component="span" color="error"> *</Typography>}
                  </Typography>
                  <QuestionField
                    question={q}
                    value={answers[q.id]}
                    onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  />
                </Box>
              ))}
            </Stack>

            <Button variant="contained" size="large" fullWidth onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
              {submitMut.isPending ? "Enviando..." : "Enviar resposta"}
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
