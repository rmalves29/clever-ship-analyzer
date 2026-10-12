/**
 * Análise das pesquisas (servidor): lê TODAS as pesquisas do sistema a cada rodada (pesquisa nova entra sozinha), tabula em
 * código, pede a interpretação à IA em etapas (uma chamada por etapa, para caber no tempo da função) e guarda o
 * relatório e a memória de aprendizados.
 */
import { z } from "zod";
import { loadOpenAiKey, NO_OPENAI_KEY, callOpenAiJson } from "./openai-json.server";
import {
  EMPTY_MEMORY,
  computeSurveyDataset,
  describeSurvey,
  type RawResponse,
  type RawSurvey,
  type SurveyDataset,
  type SurveyMemory,
} from "./survey-analysis-shared";
import {
  MEMORY_SYSTEM,
  SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
  buildMemoryUserPrompt,
  type AnalysisContext,
  type AnalysisMode,
} from "./survey-analysis-prompt";

const TABLE = "survey_analyses";
const REPORT_MODEL = process.env["SURVEY_ANALYSIS_MODEL"] || "gpt-4o";
const FALLBACK_MODEL = "gpt-4o-mini";

export type AnalysisStage = { key: string; label: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

// ----------------------------------------------------------------------------------------------- leitura

export async function loadAllSurveyData(): Promise<{ surveys: RawSurvey[]; datasets: SurveyDataset[] }> {
  const db = await admin();
  const { data: surveyRows, error } = await db.from("surveys").select("id, slug, title, description, questions").order("created_at", { ascending: true });
  if (error) throw new Error(`Erro ao ler as pesquisas: ${error.message}`);
  const surveys = ((surveyRows ?? []) as any[]).map((s) => ({ ...s, questions: Array.isArray(s.questions) ? s.questions : [] })) as RawSurvey[];

  const datasets: SurveyDataset[] = [];
  for (const survey of surveys) {
    const rows: RawResponse[] = [];
    for (let from = 0; from < 20_000; from += 1000) {
      const { data, error: respError } = await db
        .from("survey_responses")
        .select("answers, source, created_at")
        .eq("survey_id", survey.id)
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (respError) throw new Error(`Erro ao ler as respostas de "${survey.title}": ${respError.message}`);
      rows.push(...((data ?? []) as RawResponse[]));
      if (!data || data.length < 1000) break;
    }
    datasets.push(computeSurveyDataset(survey, rows));
  }
  return { surveys, datasets };
}

export type StoredAnalysis = {
  id: string;
  createdAt: string;
  status: string;
  mode: AnalysisMode;
  context: AnalysisContext;
  surveys: { id: string; slug: string; title: string; responses: number }[];
  parts: Record<string, string>;
  report: string | null;
  memory: SurveyMemory | null;
  error: string | null;
};

function mapRow(row: any): StoredAnalysis {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    status: String(row.status),
    mode: (row.mode ?? "AB") as AnalysisMode,
    context: (row.context ?? {}) as AnalysisContext,
    surveys: Array.isArray(row.surveys) ? row.surveys : [],
    parts: (row.parts ?? {}) as Record<string, string>,
    report: row.report ?? null,
    memory: row.memory ?? null,
    error: row.error ?? null,
  };
}

/** Última análise concluída (traz a memória acumulada). */
export async function loadLatestDoneAnalysis(): Promise<StoredAnalysis | null> {
  const db = await admin();
  const { data, error } = await db.from(TABLE).select("*").eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Erro ao ler a última análise: ${error.message}`);
  return data ? mapRow(data) : null;
}

export async function loadAnalysis(id: string): Promise<StoredAnalysis | null> {
  const db = await admin();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Erro ao abrir a análise: ${error.message}`);
  return data ? mapRow(data) : null;
}

export async function listAnalysisHistory(): Promise<{ id: string; createdAt: string; mode: AnalysisMode; surveys: number; responses: number; status: string }[]> {
  const db = await admin();
  const { data, error } = await db.from(TABLE).select("id, created_at, mode, surveys, status").order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(`Erro ao listar análises: ${error.message}`);
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    createdAt: String(r.created_at),
    mode: (r.mode ?? "AB") as AnalysisMode,
    status: String(r.status),
    surveys: Array.isArray(r.surveys) ? r.surveys.length : 0,
    responses: Array.isArray(r.surveys) ? r.surveys.reduce((s: number, x: any) => s + Number(x?.responses ?? 0), 0) : 0,
  }));
}

/** Pontos da última análise para a "Análise geral" do dashboard (vazio se nunca rodou). */
export async function loadSurveyIntelligenceForDashboard(): Promise<string> {
  try {
    const latest = await loadLatestDoneAnalysis();
    if (!latest?.memory) return "";
    const { intelligenceForDashboard } = await import("./survey-analysis-shared");
    return intelligenceForDashboard(latest.memory, {
      generatedAt: latest.createdAt,
      surveys: latest.surveys.length,
      responses: latest.surveys.reduce((s, x) => s + x.responses, 0),
    });
  } catch (error) {
    console.error("Falha ao ler a inteligência das pesquisas para o dashboard:", error);
    return "";
  }
}

// ----------------------------------------------------------------------------------------------- etapas

export function stagesFor(mode: AnalysisMode, datasets: SurveyDataset[]): AnalysisStage[] {
  const withData = datasets.filter((d) => d.responses > 0);
  const stages: AnalysisStage[] = [];
  if (mode === "B" || mode === "AB") stages.push({ key: "B", label: "Jornada completa (todas as pesquisas juntas)" });
  if (mode === "A" || mode === "AB") {
    for (const d of withData) stages.push({ key: `A:${d.slug}`, label: `Análise individual: ${describeSurvey(d).code}` });
  }
  stages.push({ key: "memoria", label: "Guardar a inteligência e montar o relatório" });
  return stages;
}

export async function startAnalysis(mode: AnalysisMode, context: AnalysisContext): Promise<{ runId: string; stages: AnalysisStage[]; surveys: number; responses: number }> {
  const { datasets } = await loadAllSurveyData();
  const withData = datasets.filter((d) => d.responses > 0);
  if (withData.length === 0) throw new Error("Ainda não há respostas em nenhuma pesquisa para analisar.");
  const apiKey = await loadOpenAiKey();
  if (!apiKey) throw new Error(NO_OPENAI_KEY);

  const db = await admin();
  const surveysMeta = withData.map((d) => ({ id: d.id, slug: d.slug, title: d.title, responses: d.responses }));
  const { data, error } = await db.from(TABLE).insert({ status: "running", mode, context, surveys: surveysMeta, parts: {} }).select("id").single();
  if (error || !data) throw new Error(`Não foi possível iniciar a análise: ${error?.message ?? "sem retorno"}`);
  return { runId: String(data.id), stages: stagesFor(mode, withData), surveys: withData.length, responses: withData.reduce((s, d) => s + d.responses, 0) };
}

/** Texto livre (relatório). Se o modelo principal não existir para a chave, cai no modelo menor. */
async function callOpenAiText(apiKey: string, system: string, user: string): Promise<{ text: string; model: string }> {
  const tryModel = async (model: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110_000);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 6000, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw Object.assign(new Error(`OpenAI respondeu ${res.status}: ${body.slice(0, 300)}`), { status: res.status });
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("A OpenAI não devolveu texto.");
      return { text, model };
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new Error("A IA demorou demais para responder. Tente de novo.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    return await tryModel(REPORT_MODEL);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (REPORT_MODEL !== FALLBACK_MODEL && (status === 404 || status === 400 || status === 403)) return tryModel(FALLBACK_MODEL);
    throw error;
  }
}

const learningSchema = z.object({
  tema: z.string().min(1),
  achado: z.string().min(1),
  evidencia: z.string().default(""),
  pesquisas: z.array(z.string()).default([]),
  tendencia: z.enum(["novo", "confirmado", "mudou", "enfraqueceu"]).catch("confirmado"),
  desde: z.string().default(""),
  ultimaVez: z.string().default(""),
});
const memorySchema = z.object({
  aprendizados: z.array(learningSchema).max(60).default([]),
  resumoDashboard: z.array(z.string()).max(12).default([]),
  alertas: z.array(z.string()).max(12).default([]),
});

function assembleReport(run: StoredAnalysis, datasets: SurveyDataset[], newSlugs: Set<string>): string {
  const when = new Date(run.createdAt).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  const total = run.surveys.reduce((s, x) => s + x.responses, 0);
  const lines = [`# Análise das pesquisas — ${when}`, ""];
  lines.push(`**Pesquisas incluídas:** ${run.surveys.map((s) => `${s.title} (${s.responses})`).join(" · ")} — **${total} respostas**.`);
  if (newSlugs.size > 0) {
    lines.push("", `**Novas desde a última análise:** ${datasets.filter((d) => newSlugs.has(d.slug)).map((d) => d.title).join(", ")}.`);
  }
  lines.push("");
  if (run.parts["B"]) lines.push("## Jornada completa (todas as pesquisas)", "", run.parts["B"], "");
  const individual = run.surveys.filter((s) => run.parts[`A:${s.slug}`]);
  if (individual.length > 0) {
    lines.push("## Análises individuais", "");
    for (const s of individual) {
      const d = datasets.find((x) => x.slug === s.slug);
      lines.push(`### ${d ? describeSurvey(d).code : s.title}`, "", run.parts[`A:${s.slug}`] as string, "");
    }
  }
  return lines.join("\n").trim();
}

export async function runStage(runId: string, stage: string): Promise<{ done: boolean; text?: string }> {
  const db = await admin();
  const run = await loadAnalysis(runId);
  if (!run) throw new Error("Análise não encontrada.");
  if (run.status !== "running") throw new Error("Esta análise já foi encerrada.");
  const apiKey = await loadOpenAiKey();
  if (!apiKey) throw new Error(NO_OPENAI_KEY);

  const { datasets: allDatasets } = await loadAllSurveyData();
  // Só as pesquisas que entraram nesta rodada (as respostas podem ter crescido durante a execução; o conjunto é o do início).
  const datasets = allDatasets.filter((d) => run.surveys.some((s) => s.id === d.id));
  const previous = await loadLatestDoneAnalysis();
  const previousIds = new Set((previous?.surveys ?? []).map((s) => s.id));
  const newSlugs = new Set(previous ? datasets.filter((d) => !previousIds.has(d.id)).map((d) => d.slug) : []);

  try {
    if (stage === "memoria") {
      const report = assembleReport(run, datasets, newSlugs);
      const today = new Date().toISOString().slice(0, 10);
      const memory = await callOpenAiJson({
        apiKey,
        model: FALLBACK_MODEL,
        system: MEMORY_SYSTEM,
        user: buildMemoryUserPrompt({ report, previous: previous?.memory ?? null, today, surveys: run.surveys }),
        schema: memorySchema,
        temperature: 0.1,
        maxTokens: 5000,
        retries: 1,
      }).catch((error) => {
        console.error("Falha ao consolidar a memória das pesquisas:", error);
        return null;
      });
      const finalMemory: SurveyMemory = memory ?? previous?.memory ?? EMPTY_MEMORY;
      await db
        .from(TABLE)
        .update({ status: "done", report, memory: finalMemory, updated_at: new Date().toISOString(), error: memory ? null : "A memória não pôde ser atualizada nesta rodada (mantida a anterior)." })
        .eq("id", runId);
      return { done: true, text: report };
    }

    const kind = stage === "B" ? "B" : "A";
    const target = kind === "A" ? datasets.filter((d) => `A:${d.slug}` === stage) : datasets;
    if (target.length === 0) throw new Error("Pesquisa dessa etapa não encontrada.");
    const user = buildAnalysisUserPrompt({ kind, datasets: target, context: run.context, memory: previous?.memory ?? null, newSlugs });
    const { text, model } = await callOpenAiText(apiKey, SYSTEM_PROMPT, user);
    await db
      .from(TABLE)
      .update({ parts: { ...run.parts, [stage]: text }, model, updated_at: new Date().toISOString() })
      .eq("id", runId);
    return { done: false, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na análise.";
    await db.from(TABLE).update({ status: "error", error: message, updated_at: new Date().toISOString() }).eq("id", runId);
    throw error;
  }
}
