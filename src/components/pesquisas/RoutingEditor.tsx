import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FIM, optionKeys, parseTags, routesByOption, type SurveyBranch, type TreeQuestion } from "@/lib/survey-tree";

type Props = {
  question: TreeQuestion;
  index: number;
  questions: TreeQuestion[];
  onChange: (patch: Partial<TreeQuestion>) => void;
};

/** Campo de etiquetas separadas por vírgula; só normaliza e grava ao sair do campo (não mexe no texto enquanto digita). */
function TagsField({ tags, onCommit, label }: { tags: string[]; onCommit: (tags: string[]) => void; label: string }) {
  const [text, setText] = useState(tags.join(", "));
  useEffect(() => setText(tags.join(", ")), [tags.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TextField
      size="small"
      label={label}
      placeholder="ex.: uso_proprio, evento_7d"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = parseTags(text);
        setText(parsed.join(", "));
        onCommit(parsed);
      }}
      fullWidth
    />
  );
}

/**
 * Destinos e etiquetas de uma pergunta: o que acontece depois de cada resposta (ir para outra pergunta, encerrar ou seguir
 * a ordem) e quais etiquetas ela grava. É isso que desenha a árvore na página de Pesquisas.
 */
export function RoutingEditor({ question: q, index, questions, onChange }: Props) {
  const perOption = routesByOption(q);
  const keys = optionKeys(q);
  const followLabel = questions[index + 1] ? `Seguir a ordem (#${index + 2})` : "Seguir a ordem (encerra)";

  const destinationSelect = (value: string | null | undefined, onPick: (next: string | null) => void, label: string) => (
    <TextField
      select
      size="small"
      label={label}
      value={value && (value === FIM || questions.some((x) => x.id === value)) ? value : ""}
      onChange={(e) => onPick(e.target.value === "" ? null : e.target.value)}
      sx={{ minWidth: 240 }}
    >
      <MenuItem value="">{followLabel}</MenuItem>
      {questions.map((other, i) =>
        other.id === q.id ? null : (
          <MenuItem key={other.id} value={other.id}>
            {`Ir para #${i + 1} — ${other.label.length > 48 ? `${other.label.slice(0, 48)}…` : other.label}`}
          </MenuItem>
        ),
      )}
      <MenuItem value={FIM}>Encerrar a pesquisa</MenuItem>
    </TextField>
  );

  const setBranch = (key: string, patch: Partial<SurveyBranch>) =>
    onChange({ branches: { ...(q.branches ?? {}), [key]: { ...(q.branches?.[key] ?? {}), ...patch } } });

  return (
    <Box sx={{ borderTop: "1px dashed", borderColor: "divider", pt: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
        Caminho e etiquetas
      </Typography>

      {perOption && keys.length > 0 ? (
        <Stack spacing={1}>
          {keys.map((key) => (
            <Stack key={key} direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 140, overflowWrap: "anywhere" }}>
                {key}
              </Typography>
              {destinationSelect(q.branches?.[key]?.next, (next) => setBranch(key, { next }), "Depois desta resposta")}
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TagsField label="Etiquetas desta resposta" tags={q.branches?.[key]?.tags ?? []} onCommit={(tags) => setBranch(key, { tags })} />
              </Box>
              <TextField
                size="small"
                label="Ação interna (opcional)"
                value={q.branches?.[key]?.action ?? ""}
                onChange={(e) => setBranch(key, { action: e.target.value })}
                sx={{ minWidth: 220, flex: 1 }}
              />
            </Stack>
          ))}
          <Typography variant="caption" color="text.secondary">
            Respostas sem destino próprio seguem a ordem das perguntas (ou o destino padrão abaixo).
          </Typography>
          {destinationSelect(q.next, (next) => onChange({ next }), "Destino padrão da pergunta")}
        </Stack>
      ) : (
        <Stack spacing={1}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            {destinationSelect(q.next, (next) => onChange({ next }), q.type === "mensagem" ? "Depois desta mensagem" : "Depois desta pergunta")}
          </Stack>
          {q.type === "multipla_escolha" && keys.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Na múltipla escolha cada opção marcada grava as suas etiquetas (o destino é um só).
              </Typography>
              {keys.map((key) => (
                <Stack key={key} direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" } }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 140, overflowWrap: "anywhere" }}>
                    {key}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <TagsField label="Etiquetas desta opção" tags={q.branches?.[key]?.tags ?? []} onCommit={(tags) => setBranch(key, { tags })} />
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      )}

      <TagsField label="Etiquetas gravadas em qualquer resposta desta pergunta" tags={q.tags ?? []} onCommit={(tags) => onChange({ tags })} />
      <TextField
        size="small"
        label="Ação interna da equipe nesta pergunta (opcional)"
        value={q.action ?? ""}
        onChange={(e) => onChange({ action: e.target.value })}
        fullWidth
      />
    </Box>
  );
}
