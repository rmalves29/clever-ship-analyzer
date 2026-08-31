import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { buildImportedContactId } from "./contacts-import-shared";

const rowSchema = z.object({
  line: z.number().int().positive(),
  nome: z.string().max(200).nullable(),
  email: z.string().email().max(255).nullable(),
  phone: z.string().max(20).nullable(),
  tags: z.array(z.string().max(60)).max(20),
  lastPurchaseAt: z.string().datetime().nullable(),
});

const inputSchema = z.object({
  rows: z.array(rowSchema).min(1).max(2000),
});

export type ContactsImportSummary = {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: { line: number; reason: string }[];
};

export const importContacts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ContactsImportSummary> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const summary: ContactsImportSummary = {
      total: data.rows.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Separa nome em first/last e monta registros válidos.
    const records: {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      tags: string[];
      last_purchase_at: string | null;
    }[] = [];

    for (const row of data.rows) {
      const id = buildImportedContactId(row);
      if (!id) {
        summary.skipped++;
        summary.errors.push({ line: row.line, reason: "sem e-mail e sem telefone" });
        continue;
      }
      const parts = (row.nome ?? "").trim().split(/\s+/).filter(Boolean);
      records.push({
        id,
        email: row.email,
        first_name: parts[0] ?? null,
        last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
        phone: row.phone,
        tags: row.tags,
        last_purchase_at: row.lastPurchaseAt,
      });
    }

    if (records.length === 0) return summary;

    // Busca existentes em lotes para distinguir insert de update e mesclar tags.
    const ids = records.map((r) => r.id);
    const existing = new Map<string, { tags_custom: string[] | null; last_purchase_at: string | null }>();
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: found, error } = await supabaseAdmin
        .from("shopify_customers")
        .select("id, tags_custom, last_purchase_at")
        .in("id", ids.slice(i, i + CHUNK));
      if (error) throw new Error(`Falha ao consultar contatos: ${error.message}`);
      for (const row of found ?? []) {
        existing.set(row.id, {
          tags_custom: (row as { tags_custom?: string[] | null }).tags_custom ?? null,
          last_purchase_at: (row as { last_purchase_at?: string | null }).last_purchase_at ?? null,
        });
      }
    }

    const now = new Date().toISOString();
    const upserts = records.map((r) => {
      const prev = existing.get(r.id);
      if (prev) summary.updated++;
      else summary.imported++;

      const mergedTags = Array.from(new Set([...(prev?.tags_custom ?? []), ...r.tags]));
      // Mantém a data mais recente conhecida.
      const prevDate = prev?.last_purchase_at ?? null;
      const lastPurchase =
        r.last_purchase_at && (!prevDate || new Date(r.last_purchase_at) > new Date(prevDate))
          ? r.last_purchase_at
          : prevDate;

      return {
        id: r.id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        phone: r.phone,
        tags_custom: mergedTags,
        last_purchase_at: lastPurchase,
        updated_at: now,
      };
    });

    for (let i = 0; i < upserts.length; i += CHUNK) {
      const { error } = await (supabaseAdmin.from("shopify_customers") as any).upsert(upserts.slice(i, i + CHUNK));
      if (error) throw new Error(`Falha ao importar contatos: ${error.message}`);
    }

    return summary;
  });
