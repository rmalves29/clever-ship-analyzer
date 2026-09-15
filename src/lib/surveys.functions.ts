import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

export type SurveyQuestionType =
  | "texto_curto"
  | "texto_longo"
  | "multipla_escolha"
  | "escolha_unica"
  | "nota"
  | "sim_nao";

export type SurveyQuestion = {
  id: string;
  type: SurveyQuestionType;
  label: string;
  required: boolean;
  options?: string[];
};

export type Survey = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  is_active: boolean;
  thank_you_message: string;
  created_at: string;
  updated_at: string;
};

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["texto_curto", "texto_longo", "multipla_escolha", "escolha_unica", "nota", "sim_nao"]),
  label: z.string().min(1),
  required: z.boolean(),
  options: z.array(z.string().min(1)).optional(),
});

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const surveySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).regex(SLUG_RE, "Use só letras minúsculas, números e hífen."),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  questions: z.array(questionSchema).min(1, "Adicione pelo menos uma pergunta."),
  is_active: z.boolean(),
  thank_you_message: z.string().min(1),
});

export const listSurveys = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: surveys, error }, { data: responses, error: respError }] = await Promise.all([
      supabaseAdmin.from("surveys").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("survey_responses").select("survey_id"),
    ]);
    if (error) throw error;
    if (respError) throw respError;

    const counts = new Map<string, number>();
    for (const r of (responses ?? []) as { survey_id: string }[]) {
      counts.set(r.survey_id, (counts.get(r.survey_id) ?? 0) + 1);
    }

    return ((surveys ?? []) as Survey[]).map((s) => ({ ...s, responseCount: counts.get(s.id) ?? 0 }));
  });

export const getSurvey = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: survey, error } = await supabaseAdmin
      .from("surveys")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return survey as Survey | null;
  });

export const saveSurvey = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => surveySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const payload = { ...rest, updated_at: new Date().toISOString() };

    if (id) {
      const { error } = await (supabaseAdmin.from("surveys") as any).update(payload).eq("id", id);
      if (error) {
        if ((error as any).code === "23505") throw new Error("Já existe uma pesquisa com esse link (slug).");
        throw error;
      }
      return { id };
    }
    const { data: created, error } = await (supabaseAdmin.from("surveys") as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new Error("Já existe uma pesquisa com esse link (slug).");
      throw error;
    }
    return { id: (created as { id: string }).id };
  });

export const toggleSurvey = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("surveys") as any)
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const deleteSurvey = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("surveys").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const listSurveyResponses = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ surveyId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("survey_responses")
      .select("*")
      .eq("survey_id", data.surveyId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return rows as { id: string; survey_id: string; answers: Record<string, string | string[]>; source: string | null; created_at: string }[];
  });

export const exportSurveyResponsesCsv = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ surveyId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: survey, error: surveyError }, { data: rows, error: rowsError }] = await Promise.all([
      supabaseAdmin.from("surveys").select("*").eq("id", data.surveyId).maybeSingle(),
      supabaseAdmin
        .from("survey_responses")
        .select("*")
        .eq("survey_id", data.surveyId)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);
    if (surveyError) throw surveyError;
    if (rowsError) throw rowsError;
    const s = survey as Survey | null;
    const questions = s?.questions ?? [];

    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ["Data", "Origem", ...questions.map((q) => q.label)].map(escapeCsv).join(",");
    const lines = ((rows ?? []) as { answers: Record<string, unknown>; source: string | null; created_at: string }[]).map((r) => {
      const cells = [
        new Date(r.created_at).toLocaleString("pt-BR"),
        r.source ?? "—",
        ...questions.map((q) => {
          const v = r.answers[q.id];
          return Array.isArray(v) ? v.join("; ") : String(v ?? "");
        }),
      ];
      return cells.map(escapeCsv).join(",");
    });

    return { csv: [header, ...lines].join("\n"), filename: `${s?.slug ?? "pesquisa"}-respostas.csv` };
  });

// --- Público (sem autenticação): landing page e envio de resposta ---

export const getPublicSurvey = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: survey, error } = await supabaseAdmin
      .from("surveys")
      .select("id, slug, title, description, questions, is_active, thank_you_message")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw error;
    const s = survey as Survey | null;
    if (!s || !s.is_active) return null;
    return s;
  });

export const submitSurveyResponse = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        slug: z.string().min(1),
        answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
        source: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: survey, error: surveyError } = await supabaseAdmin
      .from("surveys")
      .select("id, is_active, questions")
      .eq("slug", data.slug)
      .maybeSingle();
    if (surveyError) throw surveyError;
    const s = survey as Pick<Survey, "id" | "is_active" | "questions"> | null;
    if (!s || !s.is_active) return { success: false, error: "Pesquisa não encontrada ou encerrada." };

    for (const q of s.questions) {
      if (q.required) {
        const v = data.answers[q.id];
        const empty = v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : v.trim() === "");
        if (empty) return { success: false, error: `A pergunta "${q.label}" é obrigatória.` };
      }
    }

    const { error } = await (supabaseAdmin.from("survey_responses") as any).insert({
      survey_id: s.id,
      answers: data.answers,
      source: data.source ?? null,
    });
    if (error) throw error;
    return { success: true };
  });
