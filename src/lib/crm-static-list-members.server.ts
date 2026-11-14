const PAGE_SIZE = 1000;

type MemberRow = { customer_id: string | null };
type MemberPage = { data: MemberRow[] | null; error: { message: string } | null };

/**
 * Lê TODOS os membros de uma lista estática, página a página.
 * O PostgREST corta respostas em 1.000 linhas; sem paginar, campanhas para listas maiores
 * saíam com apenas os primeiros 1.000 destinatários.
 */
export async function fetchAllStaticListMemberIds(
  fetchPage: (from: number, to: number) => PromiseLike<MemberPage>,
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (let page = 0; ; page++) {
    const { data, error } = await fetchPage(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao carregar a lista estática: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const id = row.customer_id ? String(row.customer_id) : "";
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    if (data.length < PAGE_SIZE) break;
  }

  return ids;
}

export async function loadStaticListMemberIds(listId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return fetchAllStaticListMemberIds((from, to) =>
    supabaseAdmin
      .from("crm_list_members")
      .select("customer_id")
      .eq("lista_id", listId)
      .order("customer_id", { ascending: true })
      .range(from, to),
  );
}
