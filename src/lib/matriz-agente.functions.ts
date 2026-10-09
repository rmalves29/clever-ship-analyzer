import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import {
  AGENT_MODELS,
  AWARENESS,
  CELL_STATUS,
  PHASES,
  PILLARS,
  ROLES,
  briefSchema,
  briefingSchema,
  motiveSchema,
  scoresSchema,
} from "./matriz-agente-shared";

const agentInputSchema = z.object({
  url: z.string().trim().min(3).max(500),
  objetivo: z.string().trim().max(300),
  fase: z.enum(PHASES),
  oferta: z.string().max(4000),
  publico: z.string().max(4000),
  materiais: z.string().max(24000),
  cpaMax: z.number().min(0).max(1_000_000).nullable(),
  roasEquilibrio: z.number().min(0).max(1000).nullable(),
  modelo: z.enum(AGENT_MODELS),
});

const cellSchema = z.object({
  id: z.string().max(40),
  motivoId: z.string().max(20),
  pilar: z.enum(PILLARS),
  sementes: z.array(z.string().max(600)).max(3),
  consciencia: z.enum(AWARENESS),
  scores: scoresSchema,
  statusSugerido: z.enum(CELL_STATUS),
  papelPossivel: z.enum(ROLES),
  observacao: z.string().max(1200),
  vozPendente: z.boolean(),
});

const savedBriefingSchema = briefingSchema.extend({
  id: z.string().max(20),
  cellId: z.string().max(40),
  papel: z.enum(ROLES),
  avisos: z.array(z.string().max(300)),
});

const requestSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("fontes"), input: agentInputSchema }),
  z.object({ stage: z.literal("motivos"), input: agentInputSchema, brief: briefSchema }),
  z.object({ stage: z.literal("matriz"), input: agentInputSchema, brief: briefSchema, motivos: z.array(motiveSchema).min(1).max(6) }),
  z.object({
    stage: z.literal("briefings"),
    input: agentInputSchema,
    brief: briefSchema,
    motivos: z.array(motiveSchema).max(6),
    itens: z.array(z.object({ cell: cellSchema, papel: z.enum(ROLES), index: z.number().int().min(0).max(20) })).min(1).max(4),
    imagemDisponivel: z.boolean(),
  }),
  z.object({ stage: z.literal("revisao"), input: agentInputSchema, brief: briefSchema, briefings: z.array(savedBriefingSchema).min(1).max(12) }),
  z.object({
    stage: z.literal("plano"),
    input: agentInputSchema,
    brief: briefSchema,
    motivos: z.array(motiveSchema).max(6),
    briefings: z.array(savedBriefingSchema).min(1).max(12),
    totalCelulas: z.number().int().min(0).max(60),
    pendentesOuBloqueadas: z.number().int().min(0).max(60),
  }),
]);

/**
 * Agente Arquiteto da Matriz Criativa. Roda uma etapa por chamada (fontes, motivos, matriz,
 * briefings, plano) para caber no tempo de uma função do servidor; a tela encadeia as etapas.
 * Nada é gravado no banco.
 */
export const runMatrizAgenteStage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => requestSchema.parse(data))
  .handler(async ({ data }) => {
    const { runStage } = await import("./matriz-agente.server");
    return runStage(data as Parameters<typeof runStage>[0]);
  });
