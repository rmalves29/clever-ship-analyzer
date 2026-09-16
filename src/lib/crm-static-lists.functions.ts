import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

/** Listas estáticas: grupos de contatos montados manualmente (não por regra), usadas em
 *  campanhas/automações de WhatsApp da mesma forma que um segmento customizado — ver
 *  `resolveCustomSegmentCustomerIds` em `whatsapp-segment-resolver.server.ts`. */
export const getStaticLists = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: lists, error }, { data: members, error: membersError }] = await Promise.all([
      supabaseAdmin.from("crm_static_lists").select("*").order("criado_em", { ascending: false }),
      supabaseAdmin.from("crm_list_members").select("lista_id"),
    ]);
    if (error) throw new Error(error.message);
    if (membersError) throw new Error(membersError.message);

    const counts = new Map<string, number>();
    for (const row of members ?? []) counts.set(row.lista_id, (counts.get(row.lista_id) ?? 0) + 1);

    return (lists ?? []).map((list) => ({
      id: list.id as string,
      nome: list.nome as string,
      descricao: (list.descricao ?? null) as string | null,
      criadoEm: list.criado_em as string,
      memberCount: counts.get(list.id as string) ?? 0,
    }));
  });

export const createStaticList = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ nome: z.string().trim().min(1), descricao: z.string().trim().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("crm_static_lists")
      .insert({ nome: data.nome, descricao: data.descricao || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const renameStaticList = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({
    id: z.string().uuid(),
    nome: z.string().trim().min(1),
    descricao: z.string().trim().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("crm_static_lists")
      .update({ nome: data.nome, descricao: data.descricao || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true as const };
  });

export const deleteStaticList = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: membersError } = await supabaseAdmin.from("crm_list_members").delete().eq("lista_id", data.id);
    if (membersError) throw new Error(membersError.message);
    const { error } = await supabaseAdmin.from("crm_static_lists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true as const };
  });

export const addCustomersToList = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({
    listId: z.string().uuid(),
    customerIds: z.array(z.string()).min(1),
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("crm_list_members")
      .select("customer_id")
      .eq("lista_id", data.listId)
      .in("customer_id", data.customerIds);
    if (existingError) throw new Error(existingError.message);

    const already = new Set((existing ?? []).map((row) => row.customer_id));
    const toInsert = data.customerIds
      .filter((customerId) => !already.has(customerId))
      .map((customer_id) => ({ lista_id: data.listId, customer_id }));

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from("crm_list_members").insert(toInsert);
      if (error) throw new Error(error.message);
    }
    return { added: toInsert.length };
  });

export const removeCustomersFromList = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({
    listId: z.string().uuid(),
    customerIds: z.array(z.string()).min(1),
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("crm_list_members")
      .delete()
      .eq("lista_id", data.listId)
      .in("customer_id", data.customerIds);
    if (error) throw new Error(error.message);
    return { success: true as const };
  });
