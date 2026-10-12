/**
 * Análise das pesquisas: tabulação feita em CÓDIGO (n, %, bases, origem, semana, cruzamentos, etiquetas) — a IA só interpreta.
 * Números calculados aqui não dependem do modelo, então não são inventados. Tudo puro e testável.
 */
import type { TreeQuestion } from "./survey-tree";

export const SURVEY_TAGS_KEY = "__tags";
export const SMALL_SAMPLE = 30;

export type RawSurvey = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  questions: TreeQuestion[];
};

export type RawResponse = {
  answers: Record<string, string | string[] | undefined>;
  source: string | null;
  created_at: string;
};

export type OptionStat = { label: string; n: number; pct: number };

export type QuestionStat = {
  id: string;
  label: string;
  type: string;
  /** Quantas pessoas responderam esta pergunta (base dos percentuais). */
  base: number;
  /** Pergunta "Se…": só vale para quem se encaixa na condição; a base é quem respondeu. */
  conditional: boolean;
  smallSample: boolean;
  options?: OptionStat[];
  average?: number;
  /** Respostas abertas, já sem dados pessoais. */
  texts?: string[];
  textsTotal?: number;
};

export type Crosstab = {
  a: string;
  b: string;
  /** Respondentes que responderam as duas. */
  n: number;
  rows: string[];
  cols: string[];
  /** counts[linha][coluna] */
  counts: number[][];
};

export type SurveyDataset = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  responses: number;
  firstResponse: string | null;
  lastResponse: string | null;
  origins: { source: string; n: number }[];
  perWeek: { week: string; n: number }[];
  questions: QuestionStat[];
  tags: { tag: string; n: number }[];
  crosstabs: Crosstab[];
};

const isClosed = (t: string) => t === "escolha_unica" || t === "sim_nao" || t === "nota" || t === "multipla_escolha";
const isSingle = (t: string) => t === "escolha_unica" || t === "sim_nao" || t === "nota";

const hasValue = (v: unknown): v is string | string[] => (Array.isArray(v) ? v.some((x) => String(x).trim() !== "") : typeof v === "string" && v.trim() !== "");

/** Tira e-mail, telefone, CPF, links e @usuário de uma resposta aberta (e limita o tamanho). */
export function anonymizeText(text: string, maxLen = 280): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/@\w{2,}/g, "[usuário]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[documento]") // CPF com pontuação; 11 dígitos soltos contam como telefone
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[telefone]" : m))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Semana ISO "2026-W41" de uma data. */
export function isoWeek(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "?";
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 1000) / 10 : 0);

function tally(values: string[][], configured: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of configured) m.set(c, 0);
  for (const list of values) for (const v of new Set(list.map((x) => x.trim()).filter(Boolean))) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function questionStat(q: TreeQuestion, rows: RawResponse[]): QuestionStat {
  const answered = rows.map((r) => r.answers[q.id]).filter(hasValue);
  const base = answered.length;
  const stat: QuestionStat = {
    id: q.id,
    label: q.label,
    type: q.type,
    base,
    conditional: /^\s*se\b/i.test(q.label),
    smallSample: base < SMALL_SAMPLE,
  };
  if (isClosed(q.type)) {
    const configured = q.type === "sim_nao" ? ["Sim", "Não"] : q.type === "nota" ? ["1", "2", "3", "4", "5"] : (q.options ?? []);
    const counts = tally(
      answered.map((v) => (Array.isArray(v) ? v : [v])),
      configured,
    );
    stat.options = [...counts.entries()].map(([label, n]) => ({ label, n, pct: pct(n, base) })).sort((a, b) => b.n - a.n);
    if (q.type === "nota" && base > 0) {
      const nums = answered.map((v) => Number(Array.isArray(v) ? v[0] : v)).filter((n) => Number.isFinite(n));
      if (nums.length > 0) stat.average = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    }
  } else {
    const texts = answered.map((v) => anonymizeText(Array.isArray(v) ? v.join("; ") : v)).filter(Boolean);
    stat.textsTotal = texts.length;
    stat.texts = texts.slice(0, 150);
  }
  return stat;
}

function buildCrosstabs(questions: TreeQuestion[], rows: RawResponse[], originsVary: boolean): Crosstab[] {
  type Var = { name: string; get: (r: RawResponse) => string | null };
  const vars: Var[] = questions
    .filter((q) => isSingle(q.type))
    .map((q) => ({
      name: q.label,
      get: (r) => {
        const v = r.answers[q.id];
        return typeof v === "string" && v.trim() ? v.trim() : Array.isArray(v) && v[0] ? String(v[0]).trim() : null;
      },
    }));
  if (originsVary) vars.push({ name: "Origem", get: (r) => (r.source && r.source !== "—" ? r.source : null) });

  const out: Crosstab[] = [];
  for (let i = 0; i < vars.length; i++) {
    for (let j = i + 1; j < vars.length; j++) {
      const A = vars[i]!;
      const B = vars[j]!;
      const pairs = rows.map((r) => [A.get(r), B.get(r)] as const).filter((p): p is readonly [string, string] => p[0] !== null && p[1] !== null);
      if (pairs.length < 20) continue;
      const top = (idx: 0 | 1) => {
        const m = new Map<string, number>();
        for (const p of pairs) m.set(p[idx], (m.get(p[idx]) ?? 0) + 1);
        const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
        return sorted.length > 6 ? [...sorted.slice(0, 6), "Outras"] : sorted;
      };
      const rowsLabels = top(0);
      const colsLabels = top(1);
      const bucket = (labels: string[], v: string) => (labels.includes(v) ? v : "Outras");
      const counts = rowsLabels.map(() => colsLabels.map(() => 0));
      for (const [a, b] of pairs) counts[rowsLabels.indexOf(bucket(rowsLabels, a))]![colsLabels.indexOf(bucket(colsLabels, b))]!++;
      out.push({ a: A.name, b: B.name, n: pairs.length, rows: rowsLabels, cols: colsLabels, counts });
    }
  }
  // as mais robustas (mais respondentes) primeiro; limita para caber no prompt
  return out.sort((x, y) => y.n - x.n).slice(0, 12);
}

export function computeSurveyDataset(survey: RawSurvey, rows: RawResponse[]): SurveyDataset {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const originMap = new Map<string, number>();
  const weekMap = new Map<string, number>();
  const tagMap = new Map<string, number>();
  for (const r of sorted) {
    const o = r.source && r.source.trim() ? r.source.trim() : "—";
    originMap.set(o, (originMap.get(o) ?? 0) + 1);
    const w = isoWeek(r.created_at);
    weekMap.set(w, (weekMap.get(w) ?? 0) + 1);
    const tags = r.answers[SURVEY_TAGS_KEY];
    if (Array.isArray(tags)) for (const t of tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
  }
  const origins = [...originMap.entries()].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n);
  const real = survey.questions.filter((q) => q.type !== "mensagem");
  return {
    id: survey.id,
    slug: survey.slug,
    title: survey.title,
    description: survey.description,
    responses: sorted.length,
    firstResponse: sorted[0]?.created_at ?? null,
    lastResponse: sorted[sorted.length - 1]?.created_at ?? null,
    origins,
    perWeek: [...weekMap.entries()].map(([week, n]) => ({ week, n })).sort((a, b) => a.week.localeCompare(b.week)),
    questions: real.map((q) => questionStat(q, sorted)),
    tags: [...tagMap.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n),
    crosstabs: buildCrosstabs(real, sorted, origins.filter((o) => o.source !== "—").length >= 2),
  };
}

/** Versão enxuta para o prompt (sem cruzamentos longos) quando muitas pesquisas vão juntas. */
export function compactDataset(d: SurveyDataset, opts: { crosstabs: number; texts: number }): SurveyDataset {
  return {
    ...d,
    crosstabs: d.crosstabs.slice(0, opts.crosstabs),
    questions: d.questions.map((q) => (q.texts ? { ...q, texts: q.texts.slice(0, opts.texts) } : q)),
  };
}

// ------------------------------------------------------------------------------------------ memória acumulada

export type Learning = {
  tema: string;
  achado: string;
  evidencia: string;
  pesquisas: string[];
  tendencia: "novo" | "confirmado" | "mudou" | "enfraqueceu";
  desde: string;
  ultimaVez: string;
};

export type SurveyMemory = {
  aprendizados: Learning[];
  /** Pontos curtos que a análise geral do dashboard recebe. */
  resumoDashboard: string[];
  alertas: string[];
};

export const EMPTY_MEMORY: SurveyMemory = { aprendizados: [], resumoDashboard: [], alertas: [] };

/** Texto da inteligência das pesquisas para entrar no prompt da análise geral do dashboard. */
export function intelligenceForDashboard(memory: SurveyMemory | null, meta: { generatedAt: string; surveys: number; responses: number } | null): string {
  if (!memory || (memory.resumoDashboard.length === 0 && memory.alertas.length === 0)) return "";
  const date = meta ? new Date(meta.generatedAt).toLocaleDateString("pt-BR") : "";
  const lines = [
    `INTELIGÊNCIA DAS PESQUISAS DE CLIENTE${meta ? ` (análise de ${date}: ${meta.surveys} pesquisas, ${meta.responses} respostas)` : ""} — use como contexto qualitativo; cite só o que está aqui e nunca invente números:`,
    ...memory.alertas.map((a) => `- ALERTA: ${a}`),
    ...memory.resumoDashboard.map((s) => `- ${s}`),
  ];
  return lines.join("\n");
}

// ------------------------------------------------------------------------------------------ pesquisas conhecidas

export type KnownSurvey = { code: string; moment: string; keyQuestion: string };

/** Pesquisas já mapeadas (por link). As novas entram sem esse mapa: usam título e descrição. */
export const KNOWN_SURVEYS: Record<string, KnownSurvey> = {
  desnfc: { code: "Não comprou", moment: "Abandonou o carrinho ou a compra", keyQuestion: "Por que a cliente desistiu antes de pagar?" },
  "pos-compra": { code: "P1 Pós-compra", moment: "1 dia depois do pedido", keyQuestion: "Para quem compra, por que comprou agora e de onde veio?" },
  "pos-entrega": { code: "P2 Pós-entrega", moment: "Dia da entrega", keyQuestion: "A entrega e a peça chegaram como prometido?" },
  "pos-uso": { code: "P3 Pós-uso", moment: "12 dias depois da entrega", keyQuestion: "A peça cumpriu a expectativa no uso (brilho, ajuste)? Qual seria a próxima compra?" },
  "quem-nao-voltou": { code: "P4 Quem não voltou", moment: "30 a 60 dias sem nova compra", keyQuestion: "O que impede a segunda compra e o que traria a cliente de volta?" },
  "pre-black-friday": { code: "P5 Pré-Black", moment: "20 a 27/10", keyQuestion: "O que ela quer comprar na Black, com que condição, quanto quer gastar e o que a faria desistir?" },
};

export function describeSurvey(d: Pick<SurveyDataset, "slug" | "title" | "description">): KnownSurvey & { known: boolean } {
  const k = KNOWN_SURVEYS[d.slug];
  if (k) return { ...k, known: true };
  return {
    code: d.title,
    moment: "não informado (pesquisa nova, ainda sem mapa de momento)",
    keyQuestion: d.description?.trim() || "não informada — deduza com cautela pelas perguntas e diga que é dedução",
    known: false,
  };
}
