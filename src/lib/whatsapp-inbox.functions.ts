import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

export const listInboxThreads = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ search: z.string().optional() }).parse(data ?? {}))
  .handler(async ({ data: input }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const search = input.search?.trim();
    let query = supabaseAdmin
      .from("whatsapp_inbox_threads")
      .select("id, phone, contact_name, customer_id, last_message_at, last_message_preview, last_inbound_at, unread_count")
      .order("last_message_at", { ascending: false });
    // Sem busca: só as 200 conversas mais recentes (padrão de inbox). Com busca: procura em toda a
    // base por nome/telefone, não só nessas 200 — senão uma conversa mais antiga nunca aparece.
    query = search ? query.or(`contact_name.ilike.%${search}%,phone.ilike.%${search}%`).limit(100) : query.limit(200);
    const { data } = await query;
    return (data ?? []) as {
      id: string;
      phone: string;
      contact_name: string | null;
      customer_id: string | null;
      last_message_at: string;
      last_message_preview: string | null;
      last_inbound_at: string | null;
      unread_count: number;
    }[];
  });

export const listInboxMessages = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ threadId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("whatsapp_inbox_messages")
      .select("id, direction, body, message_type, status, error, sent_at")
      .eq("thread_id", data.threadId)
      .order("sent_at", { ascending: true })
      .limit(500);
    return (rows ?? []) as {
      id: string;
      direction: "inbound" | "outbound";
      body: string | null;
      message_type: string;
      status: string | null;
      error: string | null;
      sent_at: string;
    }[];
  });

export const markInboxThreadRead = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ threadId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("whatsapp_inbox_threads")
      .update({ unread_count: 0, updated_at: new Date().toISOString() } as never)
      .eq("id", data.threadId);
    return { success: true as const };
  });

export const replyInboxThread = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ threadId: z.string().uuid(), text: z.string().min(1).max(4096) }).parse(data))
  .handler(async ({ data }) => {
    const { sendInboxReply } = await import("./whatsapp-inbox.server");
    return sendInboxReply(data.threadId, data.text);
  });
