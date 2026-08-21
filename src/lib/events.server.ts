const GRAPH_VERSION = "v21.0";

export type EventCategory =
  | "preco"
  | "campanha"
  | "criativo"
  | "estoque"
  | "feriado"
  | "concorrencia"
  | "conteudo"
  | "outro";

export type CrmEvent = {
  id: string;
  eventDate: string;
  title: string;
  description: string | null;
  category: EventCategory;
  canais: string[];
  createdAt: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function mapEvent(row: any): CrmEvent {
  return {
    id: row.id,
    eventDate: row.event_date,
    title: row.title,
    description: row.description,
    category: row.category,
    canais: row.canais ?? [],
    createdAt: row.created_at,
  };
}

export async function listEvents(range?: { from: string; to: string }): Promise<CrmEvent[]> {
  const supabaseAdmin = await admin();
  let query = (supabaseAdmin.from("crm_events" as any) as any).select("*").order("event_date", { ascending: true });
  if (range) query = query.gte("event_date", range.from).lte("event_date", range.to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEvent);
}

export async function createEvent(input: {
  eventDate: string;
  title: string;
  description?: string | undefined;
  category: EventCategory;
  canais: string[];
}): Promise<CrmEvent> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("crm_events" as any) as any)
    .insert({
      event_date: input.eventDate,
      title: input.title,
      description: input.description || null,
      category: input.category,
      canais: input.canais,
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapEvent(data);
}

export async function updateEvent(input: {
  id: string;
  eventDate: string;
  title: string;
  description?: string | undefined;
  category: EventCategory;
  canais: string[];
}): Promise<CrmEvent> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("crm_events" as any) as any)
    .update({
      event_date: input.eventDate,
      title: input.title,
      description: input.description || null,
      category: input.category,
      canais: input.canais,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapEvent(data);
}

export async function deleteEvent(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const { error } = await (supabaseAdmin.from("crm_events" as any) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true };
}

export type DayMetric = {
  date: string;
  faturamento: number;
  pedidos: number;
  metaSpend: number | null;
  metaRoas: number | null;
  metaPurchases: number | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const PURCHASE_TYPES = ["omni_purchase", "purchase"];

function pickAction(actions: Array<{ action_type: string; value: string }> | undefined, typesByPriority: string[]): number {
  if (!actions) return 0;
  for (const type of typesByPriority) {
    const match = actions.find((a) => a.action_type === type);
    if (match) return num(match.value);
  }
  return 0;
}

/** Série diária de faturamento/pedidos (Shopify) cruzada com gasto/ROAS do Meta Ads (quando conectado),
 *  no mesmo intervalo — é a base do cruzamento causal da tela de Eventos. */
export async function getEventsTimeline(range: { from: string; to: string }): Promise<{
  days: DayMetric[];
  events: CrmEvent[];
  metaConnected: boolean;
}> {
  const supabaseAdmin = await admin();

  const fromISO = new Date(`${range.from}T00:00:00-03:00`).toISOString();
  const toISO = new Date(`${range.to}T23:59:59-03:00`).toISOString();

  const { data: orders } = await supabaseAdmin
    .from("shopify_orders")
    .select("total_price, processed_at")
    .gte("processed_at", fromISO)
    .lte("processed_at", toISO)
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const byDate = new Map<string, { faturamento: number; pedidos: number }>();
  for (const o of orders ?? []) {
    if (!o.processed_at) continue;
    const day = new Date(o.processed_at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const slot = byDate.get(day) ?? { faturamento: 0, pedidos: 0 };
    slot.faturamento += num(o.total_price);
    slot.pedidos += 1;
    byDate.set(day, slot);
  }

  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("meta_ads_access_token, meta_ads_account_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const accessToken = (settings as any)?.meta_ads_access_token ?? null;
  const accountId = (settings as any)?.meta_ads_account_id ?? null;
  const metaByDate = new Map<string, { spend: number; roas: number | null; purchases: number }>();
  let metaConnected = false;

  if (accessToken && accountId) {
    metaConnected = true;
    try {
      const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/insights`);
      url.searchParams.set("level", "account");
      url.searchParams.set("time_increment", "1");
      url.searchParams.set("time_range", JSON.stringify({ since: range.from, until: range.to }));
      url.searchParams.set("fields", "spend,actions,action_values");
      url.searchParams.set("limit", "500");
      url.searchParams.set("access_token", accessToken);

      const res = await fetch(url.toString());
      const json: any = await res.json().catch(() => ({}));
      if (res.ok && !json?.error) {
        for (const raw of (json.data ?? []) as any[]) {
          const spend = num(raw.spend);
          const purchases = pickAction(raw.actions, PURCHASE_TYPES);
          const revenue = pickAction(raw.action_values, PURCHASE_TYPES);
          metaByDate.set(raw.date_start, {
            spend,
            purchases,
            roas: spend > 0 ? revenue / spend : null,
          });
        }
      }
    } catch {
      // Meta indisponível não deve quebrar a timeline — segue só com Shopify.
    }
  }

  const days: DayMetric[] = [];
  const cursor = new Date(`${range.from}T12:00:00Z`);
  const end = new Date(`${range.to}T12:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const shopify = byDate.get(key) ?? { faturamento: 0, pedidos: 0 };
    const meta = metaByDate.get(key);
    days.push({
      date: key,
      faturamento: Number(shopify.faturamento.toFixed(2)),
      pedidos: shopify.pedidos,
      metaSpend: meta ? Number(meta.spend.toFixed(2)) : null,
      metaRoas: meta?.roas != null ? Number(meta.roas.toFixed(2)) : null,
      metaPurchases: meta ? meta.purchases : null,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const events = await listEvents(range);

  return { days, events, metaConnected };
}
