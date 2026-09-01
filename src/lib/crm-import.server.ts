/** Importação manual de lista de contatos (CSV) — botão "Importar CSV" em Contatos. Cada linha
 *  vira (ou reaproveita) uma ficha em shopify_customers com uma tag da importação, pra poder ser
 *  usada como público de campanha em WhatsApp API (Segmentos > tags_custom contém "..."). */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Acha ou cria a linha de shopify_customers do contato importado, por telefone — reaproveita uma
 *  ficha já existente (cliente que já comprou antes, por exemplo) em vez de criar uma segunda,
 *  mesmo padrão de upsertPopupCustomer em popup.server.ts. */
async function upsertImportedCustomer(
  phone: string,
  name: string | null,
  email: string | null,
  tags: string[],
): Promise<"created" | "updated"> {
  const supabaseAdmin = await admin();
  const { data: existing } = await supabaseAdmin
    .from("shopify_customers")
    .select("id, tags_custom, first_name, email")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; tags_custom: string[] | null; first_name: string | null; email: string | null };
    const mergedTags = Array.from(new Set([...(row.tags_custom ?? []), ...tags]));
    await supabaseAdmin
      .from("shopify_customers")
      .update({
        tags_custom: mergedTags,
        ...(row.first_name ? {} : name ? { first_name: name } : {}),
        ...(row.email ? {} : email ? { email } : {}),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id);
    return "updated";
  }

  await supabaseAdmin.from("shopify_customers").upsert({
    id: `phone:${phone}`,
    phone,
    first_name: name,
    email,
    tags_custom: tags,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as never);
  return "created";
}

export type ImportContactRow = { name: string | null; phone: string; email?: string | null; tag?: string | null };

export type ImportContactsResult = {
  created: number;
  updated: number;
  rows: { phone: string; name: string | null; status: "created" | "updated" | "error"; error?: string }[];
};

export async function importContacts(rows: ImportContactRow[], tag: string): Promise<ImportContactsResult> {
  const { toE164 } = await import("./whatsapp-meta.server");
  const cleanTag = tag.trim() || "Importado";
  const result: ImportContactsResult = { created: 0, updated: 0, rows: [] };

  // Sequencial de propósito: telefones repetidos na mesma lista precisam enxergar o upsert
  // anterior (senão a 2ª ocorrência do mesmo telefone criaria uma ficha duplicada em paralelo).
  for (const row of rows) {
    const phone = toE164(row.phone);
    if (!phone) {
      result.rows.push({ phone: row.phone, name: row.name, status: "error", error: "Telefone inválido" });
      continue;
    }
    try {
      const rowTag = row.tag?.trim();
      const tags = rowTag ? [cleanTag, rowTag] : [cleanTag];
      const status = await upsertImportedCustomer(phone, row.name?.trim() || null, row.email?.trim() || null, tags);
      if (status === "created") result.created++;
      else result.updated++;
      result.rows.push({ phone, name: row.name, status });
    } catch (error) {
      result.rows.push({ phone, name: row.name, status: "error", error: error instanceof Error ? error.message : "Falha ao importar" });
    }
  }

  return result;
}
