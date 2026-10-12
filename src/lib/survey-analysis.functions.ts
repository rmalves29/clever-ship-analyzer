import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const contextSchema = z.object({
  periodo: z.string().max(200).optional(),
  recebidos: z.record(z.string(), z.number().nonnegative().optional()).optional(),
  naoComprouRecebidos: z.number().nonnegative().optional(),
  pedidos: z.number().nonnegative().optional(),
  ticketMedio: z.number().nonnegative().optional(),
  recompra: z.number().min(0).max(100).optional(),
});

/** Tela de análise: pesquisas atuais (as novas aparecem sozinhas), última análise, histórico e números do sistema para o contexto. */
export const getSurveyAnalysisOverview = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const [{ loadAllSurveyData, loadLatestDoneAnalysis, listAnalysisHistory }, { describeSurvey }, { loadOpenAiKey }] = await Promise.all([
      import("./survey-analysis.server"),
      import("./survey-analysis-shared"),
      import("./openai-json.server"),
    ]);
    const [{ datasets }, latest, history, apiKey] = await Promise.all([loadAllSurveyData(), loadLatestDoneAnalysis(), listAnalysisHistory(), loadOpenAiKey()]);

    const previousIds = new Set((latest?.surveys ?? []).map((s) => s.id));
    const surveys = datasets.map((d) => {
      const k = describeSurvey(d);
      return {
        id: d.id,
        slug: d.slug,
        title: d.title,
        code: k.code,
        known: k.known,
        responses: d.responses,
        firstResponse: d.firstResponse,
        lastResponse: d.lastResponse,
        isNew: latest ? !previousIds.has(d.id) : false,
      };
    });

    // Números do sistema para preencher o contexto (o usuário pode editar): pedidos e ticket do período das respostas; recompra de toda a base.
    let suggested: { periodo: string; pedidos: number | null; ticketMedio: number | null; recompra: number | null } = { periodo: "", pedidos: null, ticketMedio: null, recompra: null };
    try {
      const firsts = datasets.map((d) => d.firstResponse).filter((x): x is string => Boolean(x)).sort();
      const lasts = datasets.map((d) => d.lastResponse).filter((x): x is string => Boolean(x)).sort();
      if (firsts[0] && lasts.at(-1)) {
        const { computeShopifyDashboardData } = await import("./shopify-dashboard.functions");
        const range = { from: firsts[0], to: lasts.at(-1) as string };
        const [period, all] = await Promise.all([
          computeShopifyDashboardData({ period: "personalizado", range }),
          computeShopifyDashboardData({ period: "tudo" }),
        ]);
        suggested = {
          periodo: `${firsts[0].slice(0, 10)} a ${(lasts.at(-1) as string).slice(0, 10)}`,
          pedidos: period.numPedidos ?? null,
          ticketMedio: period.ticketMedio != null ? Math.round(period.ticketMedio * 100) / 100 : null,
          recompra: all.taxaRecompra != null ? Math.round(all.taxaRecompra * 100) / 100 : null,
        };
      }
    } catch (error) {
      console.error("Falha ao sugerir o contexto da análise das pesquisas:", error);
    }

    return {
      hasApiKey: Boolean(apiKey),
      surveys,
      suggested,
      latest,
      history,
    };
  });

export const getSurveyAnalysis = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { loadAnalysis } = await import("./survey-analysis.server");
    return loadAnalysis(data.id);
  });

/** Passo 1: cria a rodada e devolve a lista de etapas (uma chamada à IA por etapa, para caber no tempo da função). */
export const startSurveyAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ mode: z.enum(["A", "B", "AB"]), context: contextSchema }).parse(data))
  .handler(async ({ data }) => {
    const { startAnalysis } = await import("./survey-analysis.server");
    try {
      return { success: true as const, ...(await startAnalysis(data.mode, data.context)) };
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : "Não foi possível iniciar a análise." };
    }
  });

/** Passo 2..n: roda uma etapa. A última ("memoria") fecha o relatório e guarda a inteligência. */
export const runSurveyAnalysisStage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ runId: z.string().uuid(), stage: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const { runStage } = await import("./survey-analysis.server");
    try {
      return { success: true as const, ...(await runStage(data.runId, data.stage)) };
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : "Falha na etapa da análise." };
    }
  });
