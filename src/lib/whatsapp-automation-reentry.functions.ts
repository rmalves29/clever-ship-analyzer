import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { AUTOMATION_REENTRY_MODES } from "./whatsapp-automation-reentry";

const messageTypeSchema = z.enum(["marketing", "utility"]);
const decisionConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("novo_pedido") }),
  z.object({
    kind: z.literal("pedido_status"),
    field: z.enum(["financial_status", "fulfillment_status"]),
    value: z.string().min(1),
  }),
  z.object({
    kind: z.literal("segmento"),
    segmentType: z.string().min(1),
    segmentId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal("valor_pedido"),
    operator: z.enum(["gt", "gte", "lt", "lte"]),
    value: z.number(),
  }),
  z.object({ kind: z.literal("localizacao"), field: z.enum(["city", "province"]), value: z.string().min(1) }),
  z.object({ kind: z.literal("tag"), value: z.string().min(1) }),
]);

const sendStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("send"),
  waitMinutes: z.number().int().min(0).max(43200),
  templateName: z.string().min(1),
  templateLanguage: z.string().optional(),
  messageType: messageTypeSchema.default("marketing"),
  bodyParams: z.array(z.string()).max(10).default([]),
  couponCode: z.string().optional(),
  nextStepId: z.string().nullable().default(null),
});
const decisionStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("decision"),
  condition: decisionConditionSchema,
  yesStepId: z.string().nullable().default(null),
  noStepId: z.string().nullable().default(null),
});

const schema = z
  .object({
    id: z.string().uuid().optional(),
    nome: z.string().min(1),
    descricao: z.string().optional(),
    segmentType: z.string(),
    segmentId: z.string().uuid().optional(),
    steps: z.array(z.discriminatedUnion("type", [sendStepSchema, decisionStepSchema])).min(1),
    requerAprovacao: z.boolean().default(true),
    ativo: z.boolean().default(true),
    origem: z.string().optional(),
    reentryMode: z.enum(AUTOMATION_REENTRY_MODES).default("once"),
    reentryAfterDays: z.number().int().min(1).max(3650).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reentryMode === "after_days" && data.reentryAfterDays == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reentryAfterDays"], message: "Informe o intervalo de reentrada." });
    }
  });

export const saveAutomationWithReentry = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { upsertAutomation } = await import("./whatsapp-meta.server");
    const result = await upsertAutomation({
      ...(data.id ? { id: data.id } : {}),
      nome: data.nome,
      ...(data.descricao ? { descricao: data.descricao } : {}),
      segmentType: data.segmentType,
      ...(data.segmentId ? { segmentId: data.segmentId } : {}),
      steps: data.steps,
      requerAprovacao: data.requerAprovacao,
      ativo: data.ativo,
      ...(data.origem ? { origem: data.origem } : {}),
    });
    if (!result.success) return result;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("whatsapp_automations") as any)
      .update({
        reentry_mode: data.reentryMode,
        reentry_after_days: data.reentryMode === "after_days" ? data.reentryAfterDays : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", result.id);
    if (error) return { success: false as const, error: `Automação salva, mas a política de reentrada falhou: ${error.message}` };
    return result;
  });

export const listAutomationsWithReentry = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const [{ listAutomationsRows }, { supabaseAdmin }] = await Promise.all([
      import("./whatsapp-meta.server"),
      import("@/integrations/supabase/client.server"),
    ]);
    const [rows, meta] = await Promise.all([
      listAutomationsRows(),
      (supabaseAdmin.from("whatsapp_automations") as any).select("id, reentry_mode, reentry_after_days"),
    ]);
    const byId = new Map<string, any>((meta.data ?? []).map((row: any) => [String(row.id), row]));
    return rows.map((row: any) => {
      const reentry = byId.get(String(row.id));
      return {
        ...row,
        reentryMode: reentry?.reentry_mode ?? "once",
        reentryAfterDays: reentry?.reentry_after_days ?? null,
      };
    });
  });

export const getAutomationReentry = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin.from("whatsapp_automations") as any)
      .select("reentry_mode, reentry_after_days")
      .eq("id", data.id)
      .maybeSingle();
    if (error) return { success: false as const, error: error.message };
    return {
      success: true as const,
      reentryMode: row?.reentry_mode ?? "once",
      reentryAfterDays: row?.reentry_after_days ?? null,
    };
  });

export const updateAutomationReentry = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reentryMode: z.enum(AUTOMATION_REENTRY_MODES),
        reentryAfterDays: z.number().int().min(1).max(3650).optional(),
      })
      .superRefine((value, ctx) => {
        if (value.reentryMode === "after_days" && value.reentryAfterDays == null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reentryAfterDays"], message: "Informe o intervalo." });
        }
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("whatsapp_automations") as any)
      .update({
        reentry_mode: data.reentryMode,
        reentry_after_days: data.reentryMode === "after_days" ? data.reentryAfterDays : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });
