/** Rascunhos de campanha de WhatsApp: salvar o formulário, listar, abrir e apagar. Nada é enviado nem enfileirado aqui. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { campaignDraftFormSchema, saveDraftInputSchema, type CampaignDraftRow } from "./wa-campaign-drafts-shared";

const TABLE = "wa_campaign_drafts";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

function mapRow(row: any): CampaignDraftRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    form: campaignDraftFormSchema.parse(row.form ?? {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const listCampaignDrafts = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async (): Promise<CampaignDraftRow[]> => {
    const db = await admin();
    const { data, error } = await db.from(TABLE).select("*").order("updated_at", { ascending: false }).limit(100);
    if (error) throw new Error(`Erro ao listar rascunhos: ${error.message}`);
    return ((data ?? []) as any[]).map(mapRow);
  });

export const getCampaignDraft = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<CampaignDraftRow | null> => {
    const db = await admin();
    const { data: row, error } = await db.from(TABLE).select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(`Erro ao abrir o rascunho: ${error.message}`);
    return row ? mapRow(row) : null;
  });

/** Cria o rascunho (sem id) ou atualiza o existente (com id). */
export const saveCampaignDraft = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => saveDraftInputSchema.parse(data))
  .handler(async ({ data }): Promise<{ success: true; id: string } | { success: false; error: string }> => {
    const db = await admin();
    const name = data.name || "Rascunho sem nome";
    if (data.id) {
      const { data: row, error } = await db
        .from(TABLE)
        .update({ name, form: data.form, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .select("id")
        .maybeSingle();
      if (error) return { success: false, error: error.message };
      if (!row) return { success: false, error: "Rascunho não encontrado (talvez já tenha sido enviado ou apagado)." };
      return { success: true, id: String(row.id) };
    }
    const { data: row, error } = await db.from(TABLE).insert({ name, form: data.form }).select("id").single();
    if (error || !row) return { success: false, error: error?.message ?? "Não foi possível salvar o rascunho." };
    return { success: true, id: String(row.id) };
  });

export const deleteCampaignDraft = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from(TABLE).delete().eq("id", data.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });
