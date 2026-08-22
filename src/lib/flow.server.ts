export type FlowAutomationStatus = "draft" | "active" | "paused";
export type FlowTriggerKind = "post_or_reel_comment" | "story_reply" | "live_comment" | "dm_message";

export type FlowNodeKind =
  | "trigger"
  | "message" // Instagram DM (mensagem completa)
  | "messenger"
  | "sms"
  | "email"
  | "channel" // canal customizado
  | "ai_step" // etapa de IA
  | "action" // ações internas (tag, atribuir, etc.)
  | "condition" // ramificação if/else
  | "randomizer" // A/B split
  | "smart_delay" // atraso inteligente
  | "start_automation" // dispara outra automação
  | "delay"; // atraso simples legado

export interface FlowNodeData {
  triggerKind?: FlowTriggerKind;
  triggerKinds?: FlowTriggerKind[];
  keywords?: string[];
  matchAny?: boolean;
  text?: string;
  publicReply?: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  delayMinutes?: number;
  label?: string;
  notes?: string;
  actionId?: string;
  actionConfig?: Record<string, string | number | boolean>;
  randomWeights?: number[];
  randomEachTime?: boolean;
  delayMode?: "duration" | "date";
  delayAmount?: number;
  delayUnit?: "minutes" | "hours" | "days";
  delayUseWindow?: boolean;
  delayWindowStart?: string;
  delayWindowEnd?: string;
  delayDate?: string;
  stats?: {
    sent_count: number;
    delivered_count: number;
    opened_count: number;
    clicked_count: number;
  };
}

export interface FlowCanvasNode {
  id: string;
  type: FlowNodeKind;
  position: { x: number; y: number };
  data: FlowNodeData;
}
export interface FlowCanvasEdge {
  id: string;
  source: string;
  target: string;
}
export interface FlowCanvasData {
  nodes: FlowCanvasNode[];
  edges: FlowCanvasEdge[];
}

export interface FlowAutomation {
  id: string;
  name: string;
  status: FlowAutomationStatus;
  trigger_kind: FlowTriggerKind;
  trigger_kinds: FlowTriggerKind[];
  media_id: string | null;
  media_thumbnail_url: string | null;
  keywords: string[];
  match_any_comment: boolean;
  canvas_data: FlowCanvasData;
  dispatch_count: number;
  created_at: string;
  updated_at: string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listFlowAutomations(): Promise<FlowAutomation[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_automations" as any) as any)
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FlowAutomation[];
}

export async function getFlowAutomation(id: string): Promise<FlowAutomation> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_automations" as any) as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Automação não encontrada");
  return data as FlowAutomation;
}

const DEFAULT_CANVAS: FlowCanvasData = {
  nodes: [
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 40, y: 120 },
      data: { triggerKind: "post_or_reel_comment", keywords: [], matchAny: false },
    },
    {
      id: "msg-1",
      type: "message",
      position: { x: 400, y: 60 },
      data: { text: "Olá! Aqui está o material que prometi 👇", publicReply: "Enviei no seu Direct! 📩" },
    },
  ],
  edges: [{ id: "e1", source: "trigger-1", target: "msg-1" }],
};

export async function createFlowAutomation(name?: string): Promise<FlowAutomation> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_automations" as any) as any)
    .insert({ name: name ?? "Nova automação", canvas_data: DEFAULT_CANVAS as unknown as never })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FlowAutomation;
}

export async function duplicateFlowAutomation(id: string): Promise<FlowAutomation> {
  const original = await getFlowAutomation(id);
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_automations" as any) as any)
    .insert({
      name: `${original.name} (cópia)`,
      status: "draft",
      trigger_kind: original.trigger_kind,
      trigger_kinds: original.trigger_kinds,
      keywords: original.keywords,
      match_any_comment: original.match_any_comment,
      media_id: original.media_id,
      canvas_data: original.canvas_data as unknown as never,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FlowAutomation;
}

export async function updateFlowAutomation(input: {
  id: string;
  name?: string;
  status?: FlowAutomationStatus;
  trigger_kind?: FlowTriggerKind;
  trigger_kinds?: FlowTriggerKind[];
  keywords?: string[];
  match_any_comment?: boolean;
  media_id?: string | null;
  canvas_data?: FlowCanvasData;
}): Promise<FlowAutomation> {
  const supabaseAdmin = await admin();
  const { id, ...patch } = input;
  const { data, error } = await (supabaseAdmin.from("flow_automations" as any) as any)
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FlowAutomation;
}

export async function deleteFlowAutomation(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const { error } = await (supabaseAdmin.from("flow_automations" as any) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true };
}

export type FlowContact = {
  id: string;
  ig_user_id: string;
  username: string | null;
  tags: string[];
  first_seen_at: string;
  last_seen_at: string;
};

export async function listFlowContacts(): Promise<FlowContact[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_contacts" as any) as any)
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((c) => ({ ...c, tags: c.tags ?? [] })) as FlowContact[];
}

async function getFlowContactTags(supabaseAdmin: Awaited<ReturnType<typeof admin>>, contactId: string): Promise<string[]> {
  const { data, error } = await (supabaseAdmin.from("flow_contacts" as any) as any)
    .select("tags")
    .eq("id", contactId)
    .single();
  if (error) throw new Error(error.message);
  return (data as any)?.tags ?? [];
}

export async function addFlowContactTag(contactId: string, tag: string): Promise<FlowContact> {
  const supabaseAdmin = await admin();
  const current = await getFlowContactTags(supabaseAdmin, contactId);
  const tags = Array.from(new Set([...current, tag.trim()])).filter(Boolean);
  const { data, error } = await (supabaseAdmin.from("flow_contacts" as any) as any)
    .update({ tags })
    .eq("id", contactId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as any), tags: (data as any).tags ?? [] } as FlowContact;
}

export async function removeFlowContactTag(contactId: string, tag: string): Promise<FlowContact> {
  const supabaseAdmin = await admin();
  const current = await getFlowContactTags(supabaseAdmin, contactId);
  const tags = current.filter((t) => t !== tag);
  const { data, error } = await (supabaseAdmin.from("flow_contacts" as any) as any)
    .update({ tags })
    .eq("id", contactId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as any), tags: (data as any).tags ?? [] } as FlowContact;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Upload de imagem pro node "Enviar Mensagem" — bucket público (a Meta precisa buscar a URL da
 *  imagem de fora pra mandar no Direct, então não dá pra ser um bucket privado). */
export async function uploadFlowImage(input: { fileName: string; base64Data: string; contentType: string }): Promise<{ url: string }> {
  const supabaseAdmin = await admin();
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}-${safeName}`;
  const bytes = base64ToUint8Array(input.base64Data);
  const { error } = await supabaseAdmin.storage.from("flow-uploads").upload(path, bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabaseAdmin.storage.from("flow-uploads").getPublicUrl(path);
  return { url: data.publicUrl };
}

export type FlowDispatchLog = {
  id: string;
  automation_id: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
  comment_id: string | null;
  matched_keyword: string | null;
  status: "success" | "error" | "skipped";
  error_message: string | null;
  created_at: string;
  flow_automations: { name: string } | null;
};

export async function listFlowLogs(): Promise<FlowDispatchLog[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_dispatch_logs" as any) as any)
    .select("*, flow_automations(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as FlowDispatchLog[];
}

export async function getFlowNodeStats(automationId: string): Promise<any[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_node_stats" as any) as any)
    .select("*")
    .eq("automation_id", automationId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type FlowAutomationStats = { sent: number; delivered: number; opened: number; clicked: number };

/** Soma os contadores de todos os nodes de cada automação, pra mostrar no card da listagem
 *  (sem precisar abrir o editor). */
export async function getFlowAutomationsStats(): Promise<Record<string, FlowAutomationStats>> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_node_stats" as any) as any).select(
    "automation_id, sent_count, delivered_count, opened_count, clicked_count",
  );
  if (error) throw new Error(error.message);

  const stats: Record<string, FlowAutomationStats> = {};
  for (const row of (data ?? []) as any[]) {
    const key = row.automation_id as string;
    const acc = stats[key] ?? { sent: 0, delivered: 0, opened: 0, clicked: 0 };
    acc.sent += row.sent_count ?? 0;
    acc.delivered += row.delivered_count ?? 0;
    acc.opened += row.opened_count ?? 0;
    acc.clicked += row.clicked_count ?? 0;
    stats[key] = acc;
  }
  return stats;
}
