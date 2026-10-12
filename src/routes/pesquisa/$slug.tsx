import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowLeft, Check, CheckCircle2, ClipboardList } from "lucide-react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { getPublicSurvey, submitSurveyResponse, type SurveyQuestion } from "@/lib/surveys.functions";
import { FIM, fillPlaceholders, isBranching, nextQuestionId } from "@/lib/survey-tree";

export const Route = createFileRoute("/pesquisa/$slug")({
  // O roteador converte "?pedido=1042" em número; aceita número ou texto e guarda sempre como texto.
  validateSearch: (search: Record<string, unknown>) => {
    const text = (max: number) => z.union([z.string(), z.number()]).transform((v) => String(v).slice(0, max)).optional();
    return z.object({ origem: text(60), nome: text(80), pedido: text(40) }).parse(search);
  },
  head: () => ({
    meta: [{ title: "Pesquisa · Mania de Mulher" }, { name: "viewport", content: "width=device-width, initial-scale=1" }],
  }),
  component: PublicSurveyPage,
});

type AnswerValue = string | string[];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function hasAnswer(v: AnswerValue | undefined): boolean {
  return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "";
}

const fadeUp = {
  "@keyframes surveyFadeUp": { from: { opacity: 0, transform: "translateY(10px)" }, to: { opacity: 1, transform: "none" } },
  animation: "surveyFadeUp .32s ease both",
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
} as const;

/** Cartão de escolha: linha inteira clicável, destaca quando marcada (radio ou caixa de seleção). */
function ChoiceCard({ label, selected, multiple, onClick }: { label: string; selected: boolean; multiple: boolean; onClick: () => void }) {
  return (
    <ButtonBase
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      sx={(theme) => ({
        width: "100%",
        justifyContent: "flex-start",
        textAlign: "left",
        gap: 1.5,
        px: 2,
        py: 1.75,
        minHeight: 56,
        borderRadius: "14px",
        border: "1.5px solid",
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : "background.paper",
        transition: "border-color .15s, background-color .15s, transform .1s",
        "&:hover": { borderColor: "primary.main", bgcolor: alpha(theme.palette.primary.main, selected ? 0.1 : 0.04) },
        "&:active": { transform: "scale(0.992)" },
        "&.Mui-focusVisible": { outline: `3px solid ${alpha(theme.palette.primary.main, 0.35)}`, outlineOffset: 2 },
      })}
    >
      <Box
        aria-hidden
        sx={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: multiple ? "7px" : "50%",
          border: "2px solid",
          borderColor: selected ? "primary.main" : "text.disabled",
          bgcolor: selected ? "primary.main" : "transparent",
          color: "primary.contrastText",
          display: "grid",
          placeItems: "center",
          transition: "all .15s",
        }}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </Box>
      <Typography sx={{ fontSize: 16, lineHeight: 1.35, fontWeight: selected ? 600 : 500, color: "text.primary" }}>{label}</Typography>
    </ButtonBase>
  );
}

function QuestionField({
  question,
  value,
  onChange,
  onPick,
}: {
  question: SurveyQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  /** Escolha única/nota/sim-não: avisa que a pessoa tocou numa opção (a tela pode avançar sozinha). */
  onPick?: (value: string) => void;
}) {
  // Embaralha uma única vez por carregamento da página (não a cada re-render) — reduz viés
  // de posição sem misturar a ordem enquanto a pessoa ainda está respondendo.
  const displayOptions = useMemo(() => {
    const opts = question.options ?? [];
    return question.shuffleOptions ? shuffle(opts) : opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const pick = (v: string) => {
    onChange(v);
    onPick?.(v);
  };

  switch (question.type) {
    case "texto_curto":
      return (
        <TextField
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite aqui"
          fullWidth
          slotProps={{ htmlInput: { style: { fontSize: 16 } } }}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: "14px" } }}
        />
      );
    case "texto_longo":
      return (
        <TextField
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escreva com suas palavras"
          multiline
          minRows={4}
          fullWidth
          slotProps={{ htmlInput: { style: { fontSize: 16 } } }}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: "14px" } }}
        />
      );
    case "sim_nao":
      return (
        <Stack direction="row" spacing={1.5} role="radiogroup">
          {["Sim", "Não"].map((opt) => (
            <Box key={opt} sx={{ flex: 1 }}>
              <ChoiceCard label={opt} selected={value === opt} multiple={false} onClick={() => pick(opt)} />
            </Box>
          ))}
        </Stack>
      );
    case "escolha_unica":
      return (
        <Stack spacing={1.25} role="radiogroup">
          {displayOptions.map((opt) => (
            <ChoiceCard key={opt} label={opt} selected={value === opt} multiple={false} onClick={() => pick(opt)} />
          ))}
        </Stack>
      );
    case "multipla_escolha": {
      const selected = (value as string[]) ?? [];
      return (
        <Stack spacing={1.25}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Escolha quantas quiser
          </Typography>
          {displayOptions.map((opt) => (
            <ChoiceCard
              key={opt}
              label={opt}
              multiple
              selected={selected.includes(opt)}
              onClick={() => onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt])}
            />
          ))}
        </Stack>
      );
    }
    case "nota":
      return (
        <Box>
          <Stack direction="row" spacing={1} role="radiogroup">
            {["1", "2", "3", "4", "5"].map((n) => {
              const selected = value === n;
              return (
                <ButtonBase
                  key={n}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => pick(n)}
                  sx={(theme) => ({
                    flex: 1,
                    height: 56,
                    borderRadius: "14px",
                    border: "1.5px solid",
                    borderColor: selected ? "primary.main" : "divider",
                    bgcolor: selected ? "primary.main" : "background.paper",
                    color: selected ? "primary.contrastText" : "text.primary",
                    fontSize: 20,
                    fontWeight: 700,
                    transition: "all .15s",
                    "&:hover": { borderColor: "primary.main", bgcolor: selected ? "primary.main" : alpha(theme.palette.primary.main, 0.06) },
                    "&.Mui-focusVisible": { outline: `3px solid ${alpha(theme.palette.primary.main, 0.35)}`, outlineOffset: 2 },
                  })}
                >
                  {n}
                </ButtonBase>
              );
            })}
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.75, px: 0.5 }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>Nada bom</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>Excelente</Typography>
          </Stack>
        </Box>
      );
    default:
      return null; // "mensagem": só texto
  }
}

/** Quantas perguntas ainda faltam, no caminho mais longo a partir da atual (para a barra de progresso da árvore). */
function longestRemaining(questions: SurveyQuestion[], fromId: string): number {
  const memo = new Map<string, number>();
  const visit = (id: string, trail: Set<string>): number => {
    if (id === FIM || trail.has(id)) return 0;
    const q = questions.find((x) => x.id === id);
    if (!q) return 0;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const targets = new Set<string>();
    const answersToTry: Array<string | undefined> = [undefined, ...(q.options ?? []), "Sim", "Não", "1", "2", "3", "4", "5"];
    for (const a of answersToTry) targets.add(nextQuestionId(questions, q, a));
    trail.add(id);
    let best = 0;
    for (const t of targets) best = Math.max(best, visit(t, trail));
    trail.delete(id);
    const result = 1 + best;
    memo.set(id, result);
    return result;
  };
  return visit(fromId, new Set());
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        justifyContent: "center",
        p: { xs: 0, sm: 3 },
        background: "linear-gradient(160deg, #fdf2f8 0%, #f5f3ff 55%, #eef2ff 100%)",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 520,
          minHeight: { xs: "100dvh", sm: 0 },
          bgcolor: "background.paper",
          borderRadius: { xs: 0, sm: "28px" },
          boxShadow: { xs: "none", sm: "0 24px 60px -20px rgba(76, 29, 149, 0.25), 0 2px 8px rgba(76, 29, 149, 0.06)" },
          px: { xs: 2.5, sm: 4.5 },
          py: { xs: 3, sm: 4.5 },
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
          <Box component="img" src="/logo.png" alt="Mania de Mulher" sx={{ height: 44, width: "auto", objectFit: "contain" }} />
        </Box>
        {children}
      </Box>
    </Box>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = Math.max(6, Math.min(100, Math.round((done / Math.max(total, 1)) * 100)));
  return (
    <Box
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Progresso da pesquisa"
      sx={{ height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden", mb: 3 }}
    >
      <Box sx={{ height: "100%", width: `${pct}%`, borderRadius: 3, bgcolor: "primary.main", transition: "width .4s ease" }} />
    </Box>
  );
}

function QuestionTitle({ text }: { text: string }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography component="h1" sx={{ fontSize: { xs: 21, sm: 23 }, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.01em", whiteSpace: "pre-wrap" }}>
        {text}
      </Typography>
    </Box>
  );
}

const primaryButtonSx = {
  height: 54,
  borderRadius: "14px",
  fontSize: 16,
  fontWeight: 700,
  textTransform: "none",
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

function PublicSurveyPage() {
  const { slug } = Route.useParams();
  const { origem, nome, pedido } = Route.useSearch();
  const fill = (t: string) => fillPlaceholders(t, { nome: nome?.split(" ")[0], pedido });
  const runGetSurvey = useServerFn(getPublicSurvey);
  const runSubmit = useServerFn(submitSurveyResponse);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  // Pesquisa em árvore: uma pergunta por vez; o caminho depende das respostas.
  const [stepId, setStepId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
  }, []);

  const { data: survey, isLoading } = useQuery({
    queryKey: ["public-survey", slug],
    queryFn: () => runGetSurvey({ data: { slug } }),
  });

  const submitMut = useMutation({
    mutationFn: () => runSubmit({ data: { slug, answers, source: origem ?? null } }),
    onSuccess: (res) => {
      if (res.success) setSubmitted(true);
      else setErrorText(res.error ?? "Não foi possível enviar a resposta. Tente de novo.");
    },
    onError: (e: any) => setErrorText(e?.message ?? "Não foi possível enviar a resposta. Tente de novo."),
  });

  if (isLoading) {
    return (
      <Shell>
        <Stack sx={{ alignItems: "center", py: 8 }}>
          <CircularProgress size={28} />
        </Stack>
      </Shell>
    );
  }

  if (!survey) {
    return (
      <Shell>
        <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center", py: 6, ...fadeUp }}>
          <ClipboardList size={36} color="var(--mui-palette-text-secondary, #6f6b7d)" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Pesquisa não encontrada</Typography>
          <Typography variant="body2" color="text.secondary">Esse link não existe mais ou a pesquisa foi encerrada.</Typography>
        </Stack>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell>
        <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", py: 5, ...fadeUp }}>
          <Box sx={(theme) => ({ width: 84, height: 84, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: alpha(theme.palette.success.main, 0.12) })}>
            <CheckCircle2 size={46} color="var(--mui-palette-success-main, #28C76F)" />
          </Box>
          <Typography component="h1" sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, whiteSpace: "pre-wrap" }}>
            {fill(survey.thank_you_message)}
          </Typography>
          <Typography variant="body2" color="text.secondary">Você já pode fechar esta página.</Typography>
        </Stack>
      </Shell>
    );
  }

  const errorBox = errorText ? (
    <Typography role="alert" variant="body2" sx={{ color: "error.main", mt: 1.5, textAlign: "center" }}>
      {errorText}
    </Typography>
  ) : null;

  if (isBranching(survey.questions)) {
    const questions = survey.questions;
    const current = questions.find((x) => x.id === stepId) ?? questions[0]!;
    const value = answers[current.id];
    const nextId = nextQuestionId(questions, current, value);
    const isLast = nextId === FIM;
    const isMessage = current.type === "mensagem";
    const blocked = !isMessage && current.required && !hasAnswer(value);
    const autoAdvanceType = current.type === "escolha_unica" || current.type === "sim_nao" || current.type === "nota";
    const remaining = longestRemaining(questions, current.id);
    const total = history.length + remaining;

    const goNext = (answer?: AnswerValue) => {
      const next = answer === undefined ? nextId : nextQuestionId(questions, current, answer);
      setErrorText(null);
      if (next === FIM) {
        submitMut.mutate();
        return;
      }
      setHistory((h) => [...h, current.id]);
      setStepId(next);
    };

    return (
      <Shell>
        <ProgressBar done={history.length + 1} total={total} />
        <Box key={current.id} sx={fadeUp}>
          {isMessage ? (
            <Box
              sx={(theme) => ({
                bgcolor: alpha(theme.palette.primary.main, 0.07),
                borderRadius: "6px 20px 20px 20px",
                px: 2.5,
                py: 2,
                whiteSpace: "pre-wrap",
                mb: 3,
              })}
            >
              <Typography sx={{ fontSize: 17, lineHeight: 1.5 }}>{fill(current.label)}</Typography>
            </Box>
          ) : (
            <>
              <QuestionTitle text={fill(current.label)} />
              <QuestionField
                question={current}
                value={value}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [current.id]: v }))}
                {...(autoAdvanceType && !isLast
                  ? {
                      onPick: (v: string) => {
                        // Toque numa opção: segue sozinho depois de um instante, para a pessoa ver a escolha marcada.
                        if (autoTimer.current) clearTimeout(autoTimer.current);
                        autoTimer.current = setTimeout(() => goNext(v), 280);
                      },
                    }
                  : {})}
              />
            </>
          )}
        </Box>

        <Box sx={{ mt: "auto", pt: 3 }}>
          {(!autoAdvanceType || isLast || isMessage) && (
            <Button
              variant="contained"
              fullWidth
              onClick={() => goNext()}
              disabled={blocked || submitMut.isPending}
              sx={primaryButtonSx}
            >
              {submitMut.isPending ? "Enviando..." : isLast ? "Enviar resposta" : "Continuar"}
            </Button>
          )}
          {errorBox}
          {history.length > 0 && (
            <Button
              variant="text"
              fullWidth
              startIcon={<ArrowLeft size={16} />}
              onClick={() => {
                if (autoTimer.current) clearTimeout(autoTimer.current);
                const prev = history[history.length - 1]!;
                setHistory((h) => h.slice(0, -1));
                setStepId(prev);
                setErrorText(null);
              }}
              sx={{ mt: 1, height: 44, borderRadius: "12px", textTransform: "none", color: "text.secondary", fontWeight: 600 }}
            >
              Voltar
            </Button>
          )}
        </Box>
      </Shell>
    );
  }

  // Pesquisa simples (lista de perguntas na mesma página).
  const flatBlocked = survey.questions.some((q) => q.type !== "mensagem" && q.required && !hasAnswer(answers[q.id]));
  return (
    <Shell>
      <Box sx={fadeUp}>
        {survey.description && (
          <Typography sx={{ fontSize: 16, lineHeight: 1.5, color: "text.secondary", mb: 3, whiteSpace: "pre-wrap" }}>{survey.description}</Typography>
        )}
        <Stack spacing={4}>
          {survey.questions.map((q) => (
            <Box key={q.id}>
              <QuestionTitle text={q.label} />
              <QuestionField question={q} value={answers[q.id]} onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))} />
            </Box>
          ))}
        </Stack>
      </Box>
      <Box sx={{ mt: "auto", pt: 4 }}>
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            setErrorText(null);
            submitMut.mutate();
          }}
          disabled={flatBlocked || submitMut.isPending}
          sx={primaryButtonSx}
        >
          {submitMut.isPending ? "Enviando..." : "Enviar resposta"}
        </Button>
        {errorBox}
      </Box>
    </Shell>
  );
}
