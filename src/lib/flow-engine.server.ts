import type { FlowCanvasData, FlowCanvasNode, FlowNodeData, FlowTriggerKind } from "./flow.server";

const GRAPH_VERSION = "v21.0";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadFlowCredentials(): Promise<{
  pageToken: string | null;
  igId: string | null;
  messagingToken: string | null;
  messagingIgId: string | null;
  verifyToken: string | null;
  appSecret: string | null;
}> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select(
      "instagram_page_access_token, instagram_business_account_id, instagram_messaging_access_token, instagram_messaging_account_id, whatsapp_meta_verify_token, whatsapp_meta_app_secret",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as any;
  return {
    pageToken: row?.instagram_page_access_token ?? null,
    igId: row?.instagram_business_account_id ?? null,
    messagingToken: row?.instagram_messaging_access_token ?? null,
    messagingIgId: row?.instagram_messaging_account_id ?? null,
    verifyToken: row?.whatsapp_meta_verify_token ?? null,
    appSecret: row?.whatsapp_meta_app_secret ?? null,
  };
}

export async function getFlowWebhookVerifyToken(): Promise<string | null> {
  const { verifyToken } = await loadFlowCredentials();
  return verifyToken;
}

/** Assinatura do webhook da Meta é HMAC-SHA256(corpo cru) usando o App Secret — usa Web Crypto
 *  (em vez de node:crypto) porque o deploy roda em Cloudflare Workers. */
export async function verifyMetaSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const { appSecret } = await loadFlowCredentials();
  if (!appSecret) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const provided = signatureHeader.slice("sha256=".length);
  if (computed.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

async function graphPOST(path: string, body: Record<string, unknown>, accessToken: string, host = "graph.facebook.com"): Promise<any> {
  const url = `https://${host}/${GRAPH_VERSION}${path}`;
  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${separator}access_token=${encodeURIComponent(accessToken)}`;

  console.log(`[flow-engine] Enviando POST para ${host}${path} (com corpo: ${JSON.stringify(body).slice(0, 200)}...)`);

  const res = await fetch(fullUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const errorDetail = json?.error ? JSON.stringify(json.error) : `Status ${res.status}`;
    console.error(`[flow-engine] Graph API error (${path}) [Host: ${host}]:`, errorDetail);
    throw new Error(json?.error?.message ?? `Meta respondeu ${res.status}`);
  }
  return json;
}

export async function recordWebhookEvent(rawPayload: unknown, signatureValid: boolean): Promise<string> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_webhook_events" as any) as any)
    .insert({ raw_payload: rawPayload, signature_valid: signatureValid })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as any).id as string;
}

async function markWebhookProcessed(id: string, processingError?: string): Promise<void> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin.from("flow_webhook_events" as any) as any)
    .update({ processed: true, processing_error: processingError ?? null })
    .eq("id", id);
}

type DispatchContext = {
  igUserId: string;
  username: string | null;
  commentId: string | null;
  matchedKeyword: string | null;
};

async function fetchInstagramUsername(igUserId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}?fields=username&access_token=${encodeURIComponent(accessToken)}`,
    );
    const json = await res.json();
    return json?.username ?? null;
  } catch (err) {
    console.error(`[flow-engine] Erro ao buscar username para ${igUserId}:`, err);
    return null;
  }
}

async function upsertFlowContact(igUserId: string, username: string | null): Promise<string> {
  const supabaseAdmin = await admin();
  
  // Se veio sem username, tenta manter o que já existe ou buscar se for a primeira vez
  const { data: existing } = await (supabaseAdmin.from("flow_contacts" as any) as any)
    .select("username")
    .eq("ig_user_id", igUserId)
    .maybeSingle();

  const finalUsername = username || (existing as any)?.username || null;

  const { data, error } = await (supabaseAdmin.from("flow_contacts" as any) as any)
    .upsert(
      { ig_user_id: igUserId, username: finalUsername, last_seen_at: new Date().toISOString() },
      { onConflict: "ig_user_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as any).id as string;
}

async function claimDispatchSlot(automationId: string, igUserId: string): Promise<boolean> {
  const supabaseAdmin = await admin();
  const { error } = await (supabaseAdmin.from("flow_dispatch_dedup" as any) as any).insert({
    automation_id: automationId,
    ig_user_id: igUserId,
  });
  if (!error) return true;
  if ((error as any).code === "23505") return false; // já disparado antes pra esse contato
  throw new Error(error.message);
}

async function releaseDispatchSlot(automationId: string, igUserId: string): Promise<void> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin.from("flow_dispatch_dedup" as any) as any)
    .delete()
    .eq("automation_id", automationId)
    .eq("ig_user_id", igUserId);
}

async function logDispatch(input: {
  automationId: string | null;
  igUserId: string | null;
  igUsername: string | null;
  commentId: string | null;
  matchedKeyword: string | null;
  status: "success" | "error" | "skipped";
  errorMessage?: string | null;
  nodeId?: string | null;
}): Promise<void> {
  const supabaseAdmin = await admin();
  
  // Log básico na tabela de histórico
  await (supabaseAdmin.from("flow_dispatch_logs" as any) as any).insert({
    automation_id: input.automationId,
    ig_user_id: input.igUserId,
    ig_username: input.igUsername,
    comment_id: input.commentId,
    matched_keyword: input.matchedKeyword,
    status: input.status,
    error_message: input.errorMessage ?? null,
    node_id: input.nodeId ?? null,
  });

  // Atualiza as estatísticas do node se for sucesso
  if (input.status === "success" && input.automationId && input.nodeId) {
    // Incrementa o contador de "enviado"
    await (supabaseAdmin.from("flow_node_stats" as any) as any).upsert(
      { 
        automation_id: input.automationId, 
        node_id: input.nodeId,
        sent_count: 1, 
        updated_at: new Date().toISOString() 
      },
      { onConflict: "automation_id, node_id" }
    ).select();
    
    // Como a API da Meta não retorna o status de entrega/leitura no mesmo POST, 
    // registramos como enviado. O webhook de status poderá atualizar entregue/aberto depois.
    // RPC increment SQL seria melhor, mas upsert resolve para MVP.
    const { data: stats } = await (supabaseAdmin.from("flow_node_stats" as any) as any)
      .select("sent_count")
      .eq("automation_id", input.automationId)
      .eq("node_id", input.nodeId)
      .single();
    
    if (stats) {
      await (supabaseAdmin.from("flow_node_stats" as any) as any)
        .update({ sent_count: (stats as any).sent_count + 1 })
        .eq("automation_id", input.automationId)
        .eq("node_id", input.nodeId);
    }
  }
}

async function bumpDispatchCount(automationId: string): Promise<void> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("flow_automations" as any) as any)
    .select("dispatch_count")
    .eq("id", automationId)
    .single();
  const current = (data as any)?.dispatch_count ?? 0;
  await (supabaseAdmin.from("flow_automations" as any) as any)
    .update({ dispatch_count: current + 1 })
    .eq("id", automationId);
}

async function findActiveAutomation(triggerKind: FlowTriggerKind, text: string): Promise<{
  id: string;
  canvas_data: FlowCanvasData;
  keywords: string[];
  match_any_comment: boolean;
} | null> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("flow_automations" as any) as any)
    .select("id, canvas_data, keywords, match_any_comment")
    .eq("status", "active")
    .contains("trigger_kinds", [triggerKind])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const lowerText = text.toLowerCase();
  for (const a of (data ?? []) as any[]) {
    if (a.match_any_comment) return a;
    const keywords: string[] = a.keywords ?? [];
    if (keywords.some((k) => lowerText.includes(String(k).toLowerCase()))) return a;
  }
  return null;
}

function findMatchedKeyword(keywords: string[], matchAny: boolean, text: string): string | null {
  if (matchAny) return null;
  const lowerText = text.toLowerCase();
  return keywords.find((k) => lowerText.includes(k.toLowerCase())) ?? null;
}

/** Anda pelo canvas a partir do node "trigger", executando os nodes conectados em sequência.
 *  V1: entende "message" (envia texto/imagem/botão) e "action" (add_tag/remove_tag). Para
 *  delay > 0 ou nodes ainda não implementados (condition/randomizer/etc.), para por ali —
 *  não falha, só encerra o percurso (é o próximo incremento natural do motor). */
type FlowCreds = { pageToken: string; igId: string; messagingToken: string | null; messagingIgId: string | null };

async function walkCanvasAndDispatch(
  canvas: FlowCanvasData & { id: string },
  ctx: DispatchContext,
  contactId: string,
  creds: FlowCreds,
): Promise<void> {
  const nodeById = new Map(canvas.nodes.map((n) => [n.id, n] as const));
  const nextEdgeFrom = (nodeId: string) => canvas.edges.find((e) => e.source === nodeId);

  const trigger = canvas.nodes.find((n) => n.type === "trigger");
  if (!trigger) return;

  let currentEdge = nextEdgeFrom(trigger.id);
  while (currentEdge) {
    const node: FlowCanvasNode | undefined = nodeById.get(currentEdge.target);
    if (!node) break;

    if (node.type === "message") {
      await sendFlowMessage(node.data, ctx, creds);
      // Registra o envio para este node específico
      await logDispatch({
        automationId: canvas.id,
        igUserId: ctx.igUserId,
        igUsername: ctx.username,
        commentId: ctx.commentId,
        matchedKeyword: ctx.matchedKeyword,
        status: "success",
        nodeId: node.id
      });
    } else if (node.type === "action") {
      await runFlowAction(node.data, contactId);
    } else if ((node.type === "delay" || node.type === "smart_delay") && isZeroDelay(node.data)) {
      // segue direto pro próximo node
    } else {
      break; // node ainda não suportado pelo motor (condition/randomizer/delay>0/etc.)
    }

    currentEdge = nextEdgeFrom(node.id);
  }
}

function isZeroDelay(data: FlowNodeData): boolean {
  const minutes = data.delayMinutes ?? (data.delayMode === "duration" ? data.delayAmount : undefined);
  return !minutes || minutes <= 0;
}

async function runFlowAction(data: FlowNodeData, contactId: string): Promise<void> {
  if (data.actionId === "add_tag" || data.actionId === "remove_tag") {
    const tag = String(data.actionConfig?.["tag"] ?? "").trim();
    if (!tag) return;
    const { addFlowContactTag, removeFlowContactTag } = await import("./flow.server");
    if (data.actionId === "add_tag") await addFlowContactTag(contactId, tag);
    else await removeFlowContactTag(contactId, tag);
  }
  // Demais ações do catálogo (subscribe_sequence, external_request, etc.) ainda não têm efeito real.
}

function normalizeUrl(url?: string): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function sendFlowMessage(data: FlowNodeData, ctx: DispatchContext, creds: FlowCreds): Promise<void> {
  const useMessagingApi = !ctx.commentId && creds.messagingToken && creds.messagingIgId;
  const host = useMessagingApi ? "graph.instagram.com" : "graph.facebook.com";
  const token = useMessagingApi ? creds.messagingToken! : creds.pageToken;
  const igId = useMessagingApi ? creds.messagingIgId! : creds.igId;
  const recipient = ctx.commentId ? { comment_id: ctx.commentId } : { id: ctx.igUserId };

  // Mídia primeiro, texto por último — ordem pedida: imagem/vídeo/áudio chegam antes da explicação em texto.
  for (const [kind, url] of [
    ["image", data.imageUrl],
    ["video", data.videoUrl],
    ["audio", data.audioUrl],
  ] as const) {
    if (url?.trim()) {
      await graphPOST(
        `/${igId}/messages`,
        { recipient, message: { attachment: { type: kind, payload: { url: url.trim() } } } },
        token,
        host,
      );
    }
  }

  const text = (data.text ?? "").trim();
  const buttonUrl = normalizeUrl(data.buttonUrl);
  const buttonLabel = (data.buttonLabel?.trim() || "Saiba mais").slice(0, 20);

  // Botão nativo (template "button") em vez de colar o link dentro do texto — só assim vira um botão
  // clicável de verdade no Direct. A API de resposta privada a comentário (recipient: comment_id) não
  // aceita templates estruturados, então nesse caso caímos pro texto simples com o link colado.
  if (text && buttonUrl && !ctx.commentId) {
    await graphPOST(
      `/${igId}/messages`,
      {
        recipient,
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text,
              buttons: [{ type: "web_url", url: buttonUrl, title: buttonLabel }],
            },
          },
        },
      },
      token,
      host,
    );
  } else {
    const finalText = buttonUrl ? `${text}\n\n${buttonLabel}: ${buttonUrl}` : text;
    if (finalText) {
      await graphPOST(`/${igId}/messages`, { recipient, message: { text: finalText } }, token, host);
    }
  }

  if (ctx.commentId && data.publicReply?.trim()) {
    await graphPOST(
      `/${ctx.commentId}/replies?message=${encodeURIComponent(data.publicReply.trim())}`,
      {},
      creds.pageToken,
    );
  }
}

async function dispatch(automation: { id: string; canvas_data: FlowCanvasData }, ctx: DispatchContext): Promise<void> {
  const { pageToken, igId, messagingToken, messagingIgId } = await loadFlowCredentials();
  if (!pageToken || !igId) {
    await logDispatch({
      automationId: automation.id,
      igUserId: ctx.igUserId,
      igUsername: ctx.username,
      commentId: ctx.commentId,
      matchedKeyword: ctx.matchedKeyword,
      status: "error",
      errorMessage: "Instagram não está conectado (token/conta ausente em Configurações).",
    });
    return;
  }

  let finalUsername = ctx.username;
  if (!finalUsername) {
    finalUsername = await fetchInstagramUsername(ctx.igUserId, pageToken);
  }

  const contactId = await upsertFlowContact(ctx.igUserId, finalUsername);
  const claimed = await claimDispatchSlot(automation.id, ctx.igUserId);
  if (!claimed) {
    await logDispatch({
      automationId: automation.id,
      igUserId: ctx.igUserId,
      igUsername: ctx.username,
      commentId: ctx.commentId,
      matchedKeyword: ctx.matchedKeyword,
      status: "skipped",
      errorMessage: "Esse contato já recebeu esta automação antes.",
    });
    return;
  }

  try {
    await walkCanvasAndDispatch(
      { ...automation.canvas_data, id: automation.id }, 
      ctx, 
      contactId, 
      { 
        pageToken, 
        igId, 
        messagingToken: messagingToken || pageToken,
        messagingIgId: messagingIgId || igId 
      }
    );
    await bumpDispatchCount(automation.id);
    // Log global de sucesso já foi registrado se necessário, ou walkCanvas registrou por node
  } catch (error) {
    // Libera a trava anti-duplicado nesse erro — uma falha de envio (ex: token sem permissão)
    // não deve bloquear esse contato de receber a automação para sempre.
    await releaseDispatchSlot(automation.id, ctx.igUserId);
    await logDispatch({
      automationId: automation.id,
      igUserId: ctx.igUserId,
      igUsername: ctx.username,
      commentId: ctx.commentId,
      matchedKeyword: ctx.matchedKeyword,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCommentChange(value: any): Promise<void> {
  const igUserId: string | undefined = value?.from?.id;
  const text: string = value?.text ?? "";
  if (!igUserId) return;

  const triggerKind: FlowTriggerKind = value?.media?.media_product_type === "LIVE" ? "live_comment" : "post_or_reel_comment";
  const automation = await findActiveAutomation(triggerKind, text);
  if (!automation) return;

  await dispatch(automation, {
    igUserId,
    username: value?.from?.username ?? null,
    commentId: value?.id ?? null,
    matchedKeyword: findMatchedKeyword(automation.keywords ?? [], automation.match_any_comment, text),
  });
}

async function handleMessagingEvent(pageId: string, m: any): Promise<void> {
  if (m?.message?.is_echo) return; // eco da nossa própria mensagem enviada
  const igUserId: string | undefined = m?.sender?.id;
  if (!igUserId || igUserId === pageId) return;

  const text: string = m?.message?.text ?? "";
  const triggerKind: FlowTriggerKind = m?.message?.reply_to?.story ? "story_reply" : "dm_message";
  const automation = await findActiveAutomation(triggerKind, text);
  if (!automation) return;

  await dispatch(automation, {
    igUserId,
    username: null,
    commentId: null,
    matchedKeyword: findMatchedKeyword(automation.keywords ?? [], automation.match_any_comment, text),
  });
}

export async function processInstagramWebhookBody(rawBody: string, signatureValid: boolean): Promise<void> {
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return;
  }

  const eventId = await recordWebhookEvent(body, signatureValid);
  try {
    const entries: any[] = body?.entry ?? [];
    for (const entry of entries) {
      const changes: any[] = entry?.changes ?? [];
      for (const c of changes) {
        if (c?.field === "comments") {
          await handleCommentChange(c.value).catch((error) => console.error("[flow-engine] Falha ao processar comentário:", error));
        }
      }

      const messaging: any[] = entry?.messaging ?? [];
      for (const m of messaging) {
        await handleMessagingEvent(entry?.id, m).catch((error) => console.error("[flow-engine] Falha ao processar mensagem:", error));
      }
    }
    await markWebhookProcessed(eventId);
  } catch (error) {
    await markWebhookProcessed(eventId, error instanceof Error ? error.message : String(error));
  }
}
