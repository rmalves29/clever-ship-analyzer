import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { FIM, buildTreeLayout, optionKeys, routesByOption, type TreeEdge, type TreeQuestion } from "@/lib/survey-tree";

type Props = {
  questions: TreeQuestion[];
  /** Texto exibido no nó final. */
  thankYou?: string;
  /** Clique no título/número de uma pergunta (ex.: abrir no editor). */
  onOpenQuestion?: (id: string) => void;
};

type NodeKind = "botoes" | "lista" | "texto" | "acao" | "fim";

const KIND_LABEL: Record<NodeKind, string> = {
  botoes: "Botões",
  lista: "Lista",
  texto: "Texto livre",
  acao: "Mensagem",
  fim: "Fim",
};

function kindOf(q: TreeQuestion): NodeKind {
  if (q.type === "mensagem") return "acao";
  if (q.type === "texto_curto" || q.type === "texto_longo") return "texto";
  if (q.type === "sim_nao") return "botoes";
  if (q.type === "escolha_unica") return (q.options?.length ?? 0) <= 3 ? "botoes" : "lista";
  return "lista"; // múltipla escolha, nota
}

function typeText(q: TreeQuestion): string {
  switch (q.type) {
    case "sim_nao":
      return "Sim / Não";
    case "nota":
      return "Nota de 1 a 5";
    case "multipla_escolha":
      return "Múltipla escolha";
    case "escolha_unica":
      return "Escolha única";
    case "texto_longo":
      return "Texto longo";
    case "texto_curto":
      return "Texto curto";
    default:
      return "Mensagem";
  }
}

type Wire = { key: string; d: string; back: boolean };

/**
 * Pesquisa desenhada como árvore: colunas por etapa, um cartão por pergunta (com os botões/respostas), setas ligando cada
 * resposta ao próximo passo e as etiquetas gravadas. Passe o mouse (ou toque) numa resposta para destacar o caminho.
 */
export function SurveyTree({ questions, thankYou, onOpenQuestion }: Props) {
  const theme = useTheme();
  const layout = useMemo(() => buildTreeLayout(questions), [questions]);
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const position = useMemo(() => new Map(questions.map((q, i) => [q.id, i + 1])), [questions]);
  const edgesByNode = useMemo(() => {
    const m = new Map<string, TreeEdge[]>();
    for (const e of layout.edges) m.set(e.from, [...(m.get(e.from) ?? []), e]);
    return m;
  }, [layout]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hot, setHot] = useState<string | null>(null);

  const kindColor = useCallback(
    (kind: NodeKind) =>
      ({
        botoes: theme.palette.info.main,
        lista: theme.palette.success.main,
        texto: theme.palette.secondary.main,
        acao: theme.palette.warning.main,
        fim: theme.palette.text.disabled,
      })[kind],
    [theme],
  );

  const columns = useMemo(() => {
    // O nó FIM fica sozinho numa coluna depois da última etapa (a busca em largura o colocaria na etapa mais rasa).
    const cols = layout.columns.map((c) => c.filter((id) => id !== FIM)).filter((c) => c.length > 0);
    if (layout.hasEnd) cols.push([FIM]);
    return cols;
  }, [layout]);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const hb = host.getBoundingClientRect();
    const next: Wire[] = [];
    host.querySelectorAll<HTMLElement>("[data-edge]").forEach((el) => {
      const [from, key] = (el.dataset["edge"] ?? "").split("|");
      const edge = layout.edges.find((e) => e.from === from && e.key === key);
      if (!edge) return;
      const target = host.querySelector<HTMLElement>(`[data-node="${CSS.escape(edge.to)}"]`);
      if (!target) return;
      const a = el.getBoundingClientRect();
      const z = target.getBoundingClientRect();
      const back = z.left < a.left;
      const x1 = a.right - hb.left;
      const y1 = a.top + a.height / 2 - hb.top;
      const x2 = back ? z.left - hb.left + 20 : z.left - hb.left;
      const y2 = z.top - hb.top + (back ? 0 : 22);
      const d = back
        ? `M${x1},${y1} C${x1 + 40},${y1} ${x2},${y2 - 60} ${x2},${y2}`
        : `M${x1},${y1} C${x1 + 36},${y1} ${x2 - 36},${y2} ${x2},${y2}`;
      next.push({ key: `${edge.from}|${edge.key}`, d, back });
    });
    setWires(next);
    setSize({ w: host.scrollWidth, h: host.scrollHeight });
  }, [layout]);

  useLayoutEffect(() => {
    measure();
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    return () => ro.disconnect();
  }, [measure, columns]);

  const hotTarget = useMemo(() => {
    if (!hot) return null;
    const [from, key] = hot.split("|");
    return layout.edges.find((e) => e.from === from && e.key === key)?.to ?? null;
  }, [hot, layout]);

  const focusTarget = (to: string) => {
    const el = hostRef.current?.querySelector<HTMLElement>(`[data-node="${CSS.escape(to)}"]`);
    el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "center" });
  };

  const label = (id: string) => (id === FIM ? "Fim" : `#${position.get(id) ?? "?"}`);

  const renderEdge = (e: TreeEdge, display: string) => {
    const k = `${e.from}|${e.key}`;
    return (
      <Box
        key={k}
        component="button"
        type="button"
        data-edge={k}
        onMouseEnter={() => setHot(k)}
        onMouseLeave={() => setHot(null)}
        onFocus={() => setHot(k)}
        onBlur={() => setHot(null)}
        onClick={() => {
          setHot(k);
          focusTarget(e.to);
        }}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.4,
          textAlign: "left",
          font: "inherit",
          color: "text.primary",
          bgcolor: "transparent",
          border: "1px solid",
          borderColor: hot === k ? "primary.main" : "divider",
          borderRadius: 2,
          px: 1.1,
          py: 0.8,
          cursor: "pointer",
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center" }}>
          <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
            {display}
          </Typography>
          <Typography component="span" variant="caption" sx={{ color: "text.secondary", whiteSpace: "nowrap", fontFamily: "monospace" }}>
            → {label(e.to)}
          </Typography>
        </Box>
        {e.tags.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
            {e.tags.map((t) => (
              <Box key={t} component="span" sx={{ fontFamily: "monospace", fontSize: 11, color: "text.secondary", bgcolor: "action.hover", borderRadius: 1, px: 0.6 }}>
                {t}
              </Box>
            ))}
          </Box>
        )}
        {e.action && (
          <Typography variant="caption" sx={{ color: "warning.main", display: "flex", gap: 0.5 }}>
            <span aria-hidden="true">⚑</span>
            {e.action}
          </Typography>
        )}
      </Box>
    );
  };

  const renderNode = (id: string) => {
    if (id === FIM) {
      const c = kindColor("fim");
      return (
        <Box key={id} data-node={id} sx={cardSx(c, hotTarget === id, theme)}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Fim</Typography>
            <Typography variant="overline" sx={{ color: c, lineHeight: 1 }}>{KIND_LABEL.fim}</Typography>
          </Box>
          <Bubble>{thankYou || "Obrigado por participar!"}</Bubble>
        </Box>
      );
    }
    const q = byId.get(id);
    if (!q) return null;
    const kind = kindOf(q);
    const c = kindColor(kind);
    const edges = edgesByNode.get(id) ?? [];
    const perOption = routesByOption(q);
    return (
      <Box key={id} data-node={id} sx={cardSx(c, hotTarget === id, theme)}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
          <Typography
            component={onOpenQuestion ? "button" : "span"}
            type={onOpenQuestion ? "button" : undefined}
            onClick={onOpenQuestion ? () => onOpenQuestion(id) : undefined}
            variant="caption"
            sx={{ fontFamily: "monospace", color: "text.secondary", background: "none", border: 0, p: 0, cursor: onOpenQuestion ? "pointer" : "default", textDecoration: onOpenQuestion ? "underline dotted" : "none" }}
          >
            Pergunta #{position.get(id)}
          </Typography>
          <Typography variant="overline" sx={{ color: c, lineHeight: 1 }}>
            {KIND_LABEL[kind]} · {typeText(q)}
          </Typography>
        </Box>
        <Bubble>{q.label}</Bubble>
        {perOption && edges.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            {edges.map((e) => renderEdge(e, e.label))}
          </Box>
        )}
        {q.action && (
          <Typography variant="caption" sx={{ color: "warning.main", display: "flex", gap: 0.5 }}>
            <span aria-hidden="true">⚑</span>
            {q.action}
          </Typography>
        )}
        {(q.tags?.length ?? 0) > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
            {q.tags!.map((t) => (
              <Box key={t} component="span" sx={{ fontFamily: "monospace", fontSize: 11, color: "text.secondary", bgcolor: "action.hover", borderRadius: 1, px: 0.6 }}>
                {t}
              </Box>
            ))}
          </Box>
        )}
        {!perOption && edges.length > 0 && (
          <Box sx={{ borderTop: "1px dashed", borderColor: "divider", pt: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
            {q.type === "multipla_escolha" && optionKeys(q).length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Opções: {optionKeys(q).join(" · ")}
              </Typography>
            )}
            {edges.map((e) => renderEdge(e, e.label))}
          </Box>
        )}
      </Box>
    );
  };

  if (questions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
        Esta pesquisa ainda não tem perguntas.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        position: "relative",
        overflowX: "auto",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        bgcolor: "background.default",
        backgroundImage: `radial-gradient(circle at 1px 1px, ${alpha(theme.palette.text.primary, 0.12)} 1px, transparent 1.5px)`,
        backgroundSize: "22px 22px",
      }}
    >
      <Box ref={hostRef} sx={{ position: "relative", display: "flex", gap: 8, p: 3.5, width: "max-content", alignItems: "flex-start" }}>
        {columns.map((col, i) => (
          <Box key={i} sx={{ display: "flex", flexDirection: "column", gap: 2.75, width: 290 }}>
            <Typography variant="overline" sx={{ color: "text.secondary", lineHeight: 1 }}>
              {i === 0 ? "Início" : `Etapa ${i + 1}`}
            </Typography>
            {col.map(renderNode)}
          </Box>
        ))}
        <Box
          component="svg"
          aria-hidden="true"
          width={size.w}
          height={size.h}
          sx={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          {wires.map((w) => {
            const isHot = hot === w.key;
            return (
              <path
                key={w.key}
                d={w.d}
                fill="none"
                stroke={isHot ? theme.palette.primary.main : theme.palette.divider}
                strokeWidth={isHot ? 2.5 : 1.5}
                strokeDasharray={w.back ? "5 4" : undefined}
                opacity={w.back && !isHot ? 0 : 1}
              />
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={(t) => ({
        bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.18 : 0.12),
        borderRadius: "4px 12px 12px 12px",
        px: 1.4,
        py: 1.1,
        fontSize: 14,
        lineHeight: 1.45,
        overflowWrap: "anywhere",
      })}
    >
      {children}
    </Box>
  );
}

function cardSx(color: string, hot: boolean, theme: Theme) {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 1.25,
    p: 1.5,
    bgcolor: "background.paper",
    border: "1px solid",
    borderColor: "divider",
    borderTop: `4px solid ${color}`,
    borderRadius: 3,
    boxShadow: hot ? `0 0 0 2px ${theme.palette.primary.main}` : "none",
    transition: "box-shadow .15s",
  } as const;
}
