import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  applyMetaStatusUpdate,
  applyMetaTemplateStatusUpdate,
  getStoredVerifyToken,
  verifyWhatsappWebhookSignature,
} from "./lib/whatsapp-meta.server";
import { matchIncomingMessage } from "./lib/conversational-flows.server";
import { getAutomationTickSecret, runAutomationsTickWithLog } from "./lib/automations-engine.server";
import { runDailyEventsAnalysis } from "./lib/events.server";
import { getFlowWebhookVerifyToken, processInstagramWebhookBody, verifyMetaSignature } from "./lib/flow-engine.server";
import { handleEnvioCampaignRedirect, handleTrackedLinkRedirect } from "./lib/envio-redirect.server";
import { processEnvioWebhookEvent } from "./lib/envio-webhook.server";
import { processDueEnvioMessages } from "./lib/envio-messages.server";
import { dispatchDueReturnInvites } from "./lib/envio-return-automation.server";
import { runEnvioGroupEventsCleanup } from "./lib/envio-cleanup.server";
import { runAiRoutinesTick } from "./lib/ai-send-routines.server";
import { runAiPlaybookUpdate } from "./lib/ai-content-queue.server";

const WHATSAPP_WEBHOOK_PATH = "/api/whatsapp-webhook";
const INSTAGRAM_WEBHOOK_PATH = "/api/instagram-webhook";
const AUTOMATIONS_TICK_PATH = "/api/automations/tick";
const DAILY_EVENTS_ANALYSIS_PATH = "/api/events/daily-analysis";
const UAZAPI_WEBHOOK_PATH = "/api/uazapi-webhook";
const ENVIO_REDIRECT_PREFIX = "/fluxo/";
const TRACKED_LINK_PREFIX = "/r/";
const ENVIO_PROCESS_SCHEDULED_PATH = "/api/envio/process-scheduled";
const ENVIO_RETURN_DISPATCH_PATH = "/api/envio/return-dispatch";
const ENVIO_CLEANUP_EVENTS_PATH = "/api/envio/cleanup-events";
const AI_ROUTINES_TICK_PATH = "/api/ai-routines/tick";
const AI_PLAYBOOK_TICK_PATH = "/api/ai-routines/playbook-tick";
const WHATSAPP_QUEUE_TICK_PATH = "/api/whatsapp/queue-tick";
const CRM_SYNC_TICK_PATH = "/api/crm/sync-tick";
const POPUP_LOADER_JS_PATH = "/api/popup/loader.js";
const POPUP_CONFIG_PATH = "/api/popup/config";
const POPUP_VISIT_PATH = "/api/popup/visit";
const POPUP_CAPTURE_PATH = "/api/popup/capture";

// Webhook da Meta é chamado diretamente por eles, fora do protocolo de RPC do
// createServerFn — por isso é tratado aqui, antes do handler SSR do TanStack Start.
async function handleWhatsappWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const storedToken = await getStoredVerifyToken();

    if (mode === "subscribe" && storedToken && token === storedToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "POST") {
    const rawBody = await request.text();

    // Assinatura HMAC-SHA256 do corpo cru com o App Secret — rejeita antes de processar.
    const signature = await verifyWhatsappWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"));
    if (signature.configured && !signature.valid) {
      console.warn("Webhook do WhatsApp rejeitado: assinatura X-Hub-Signature-256 inválida ou ausente.");
      return new Response("Invalid signature", { status: 401 });
    }
    if (!signature.configured) {
      console.warn(
        "Webhook do WhatsApp processado SEM validação de assinatura: App Secret da Meta não configurado em Configurações.",
      );
    }

    try {
      const body: any = JSON.parse(rawBody);
      const changes: any[] = body?.entry?.flatMap((e: any) => e?.changes ?? []) ?? [];

      const statuses = changes.flatMap((c) => (c?.field === "messages" ? (c?.value?.statuses ?? []) : []));
      for (const s of statuses) {
        if (s?.id && s?.status) {
          await applyMetaStatusUpdate({ id: s.id, status: s.status, timestamp: s.timestamp, errors: s.errors });
        }
      }

      // Mensagens recebidas (cliente respondeu ou clicou num botão) — grava na caixa de entrada
      // e dispara fluxo conversacional.
      const messageChanges = changes.filter((c) => c?.field === "messages");
      const { recordInboundMessage } = await import("./lib/whatsapp-inbox.server");
      for (const change of messageChanges) {
        const contacts: any[] = change?.value?.contacts ?? [];
        for (const m of change?.value?.messages ?? []) {
          if (!m?.from) continue;
          const contactName = contacts.find((c: any) => c?.wa_id === m.from)?.profile?.name ?? null;
          await recordInboundMessage(m, contactName).catch((error) =>
            console.error("Falha ao gravar mensagem recebida na caixa de entrada:", error),
          );
          await matchIncomingMessage(m).catch((error) => console.error("Falha ao casar mensagem recebida com fluxo:", error));
        }
      }

      // Aprovação/rejeição de template — Meta manda isso separado do campo "messages" acima.
      const templateUpdates = changes.filter((c) => c?.field === "message_template_status_update");
      for (const c of templateUpdates) {
        const v = c?.value;
        if (v?.message_template_name && v?.event) {
          await applyMetaTemplateStatusUpdate({
            templateId: v.message_template_id != null ? String(v.message_template_id) : undefined,
            name: v.message_template_name,
            language: v.message_template_language,
            category: v.message_template_category,
            event: v.event,
            reason: v.reason ?? null,
          });
        }
      }
    } catch (error) {
      console.error("Falha ao processar webhook do WhatsApp:", error);
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

// Webhook do Instagram (comentários em post/reel/live e mensagens diretas) — motor do menu
// ManyChat. Mesmo padrão do webhook do WhatsApp acima, mas valida a assinatura HMAC do corpo
// cru (a Meta assina com o App Secret) antes de processar.
async function handleInstagramWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const storedToken = await getFlowWebhookVerifyToken();

    if (mode === "subscribe" && storedToken && token === storedToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "POST") {
    const rawBody = await request.text();
    const signatureValid = await verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"));
    await processInstagramWebhookBody(rawBody, signatureValid).catch((error) =>
      console.error("Falha ao processar webhook do Instagram:", error),
    );
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

// Chamado periodicamente pelo pg_cron+pg_net (ver migração do motor de automação) — fora do
// protocolo de RPC do createServerFn pelo mesmo motivo do webhook acima: precisa responder a uma
// chamada HTTP crua vinda de fora da aplicação, autenticada por um segredo compartilhado.
async function handleAutomationsTick(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const provided = request.headers.get("X-Automation-Secret");
  const storedSecret = await getAutomationTickSecret();
  if (!storedSecret || !provided || provided !== storedSecret) {
    return new Response("Forbidden", { status: 401 });
  }

  try {
    const result = await runAutomationsTickWithLog();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Falha ao rodar o tick de automações:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// Chamado 1x por dia às 8h (America/Sao_Paulo) pelo pg_cron+pg_net — mesmo padrão e mesmo
// segredo compartilhado do tick de automações acima, só que numa agenda diária própria.
async function handleDailyEventsAnalysis(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const provided = request.headers.get("X-Automation-Secret");
  const storedSecret = await getAutomationTickSecret();
  if (!storedSecret || !provided || provided !== storedSecret) {
    return new Response("Forbidden", { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const result = await runDailyEventsAnalysis(undefined, force);

    // Recalculo diário do RFM — reaproveita este mesmo tick para não criar execução redundante.
    let rfm: unknown = null;
    try {
      const { recalculateRFM } = await import("./lib/crm-rfm.server");
      rfm = await recalculateRFM();
    } catch (rfmError) {
      console.error("Falha ao recalcular o RFM na rotina diária:", rfmError);
      rfm = { success: false, error: String(rfmError) };
    }

    return new Response(JSON.stringify({ ...result, rfm }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (error) {
    console.error("Falha ao rodar a análise diária de eventos:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// Webhook da UazAPI (módulo Fluxo de Envio) — mesmo padrão dos webhooks acima, mas sem verificação
// de assinatura (a UazAPI não assina o corpo do webhook, diferente da Meta).
async function handleUazapiWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const body = await request.json();
    await processEnvioWebhookEvent(body);
  } catch (error) {
    console.error("Falha ao processar webhook da UazAPI:", error);
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}

type WaitUntilCtx = { waitUntil?: (promise: Promise<unknown>) => void };

async function handleEnvioRedirect(request: Request, ctx: unknown): Promise<Response> {
  const url = new URL(request.url);
  const slug = url.pathname.slice(ENVIO_REDIRECT_PREFIX.length);
  if (!slug) return new Response("Not Found", { status: 404 });
  const waitUntil = (ctx as WaitUntilCtx | null)?.waitUntil ?? ((p: Promise<unknown>) => void p.catch(() => {}));
  try {
    return await handleEnvioCampaignRedirect(slug, request, waitUntil);
  } catch (error) {
    console.error("Falha ao processar redirect de campanha do Fluxo de Envio:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function handleTrackedLink(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const messageId = url.pathname.slice(TRACKED_LINK_PREFIX.length);
  if (!messageId) return new Response("Not Found", { status: 404 });
  try {
    return await handleTrackedLinkRedirect(messageId, request);
  } catch (error) {
    console.error("Falha ao processar redirect rastreado:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function checkAutomationSecret(request: Request): Promise<boolean> {
  const provided = request.headers.get("X-Automation-Secret");
  const storedSecret = await getAutomationTickSecret();
  return Boolean(storedSecret && provided && provided === storedSecret);
}

async function handleEnvioProcessScheduled(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!(await checkAutomationSecret(request))) return new Response("Forbidden", { status: 401 });
  try {
    const result = await processDueEnvioMessages();
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Falha ao processar mensagens agendadas do Fluxo de Envio:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function handleEnvioReturnDispatch(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!(await checkAutomationSecret(request))) return new Response("Forbidden", { status: 401 });
  try {
    const result = await dispatchDueReturnInvites();
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Falha ao despachar convites de retorno do Fluxo de Envio:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function handleAiRoutinesTick(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!(await checkAutomationSecret(request))) return new Response("Forbidden", { status: 401 });
  try {
    const result = await runAiRoutinesTick();
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Falha ao rodar o tick de rotinas de envio por IA:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function handleAiPlaybookTick(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!(await checkAutomationSecret(request))) return new Response("Forbidden", { status: 401 });
  try {
    const result = await runAiPlaybookUpdate();
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Falha ao rodar a atualização do playbook de IA:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// Worker da fila do WhatsApp — único caminho de envio real. Chamado periodicamente por
// pg_cron+pg_net (agendamento a criar junto da migration da fila), autenticado pelo mesmo segredo.
async function handleWhatsappQueueTick(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!(await checkAutomationSecret(request))) return new Response("Forbidden", { status: 401 });
  try {
    const { processWhatsappQueueBatch } = await import("./lib/whatsapp-queue.server");
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    // `?dryRun=1` e `?provider=mock` são modos de TESTE — bloqueados em produção.
    const testModesAllowed =
      process.env["NODE_ENV"] !== "production" || process.env["ALLOW_QUEUE_TEST_MODES"] === "true";
    const dryRunRequested = url.searchParams.get("dryRun") === "1";
    const mockRequested = url.searchParams.get("provider") === "mock";
    if (!testModesAllowed && (dryRunRequested || mockRequested)) {
      return new Response("Test modes disabled in production", { status: 403 });
    }
    const dryRun = testModesAllowed && dryRunRequested;
    const useMock = testModesAllowed && mockRequested;
    const result = await processWhatsappQueueBatch({
      ...(Number.isFinite(limitParam) && limitParam > 0 ? { limit: limitParam } : {}),
      ...(dryRun ? { dryRun: true } : {}),
      ...(useMock ? { provider: "mock" as const } : {}),
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });

  } catch (error) {
    console.error("Falha ao processar a fila do WhatsApp:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}


// Sincronização periódica com a Shopify (clientes, pedidos, checkouts abandonados) — sem isso,
// pedidos novos só entram no CRM quando alguém clica em "Sincronizar Shopify" manualmente, e
// automações baseadas em "novo pedido" nunca enxergam o pedido a tempo. Mesmo padrão de segredo
// compartilhado dos outros ticks acima.
async function handleCrmSyncTick(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!(await checkAutomationSecret(request))) return new Response("Forbidden", { status: 401 });
  try {
    const { runShopifySync } = await import("./lib/crm-sync.server");
    const result = await runShopifySync(false);
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Falha ao sincronizar dados da Shopify:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// O pop-up roda no domínio da loja (Shopify), fora deste app — chamadas via fetch() cross-origin
// exigem CORS, ao contrário de todo o resto das rotas cruas (webhooks são server-to-server).
// `shopify_store_domain` é o domínio administrativo (*.myshopify.com, usado pra autenticar na
// Admin API) — quase nunca é o domínio que o visitante vê no navegador. Por isso também aceita
// `storefront_domain` (o domínio público de verdade, ex.: maniadmulher.com), comparando sem
// "www." dos dois lados pra não travar por causa desse prefixo.
function normalizeDomainHost(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "").replace(/^www\./i, "").toLowerCase();
}

async function getAllowedPopupOrigin(origin: string | null): Promise<string | null> {
  if (!origin) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin.from("store_settings") as any)
      .select("shopify_store_domain, storefront_domain")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = data as { shopify_store_domain: string | null; storefront_domain: string | null } | null;
    const candidates = [row?.shopify_store_domain, row?.storefront_domain]
      .filter((value): value is string => Boolean(value))
      .map(normalizeDomainHost);
    if (!candidates.length) return null;
    const originHost = normalizeDomainHost(new URL(origin).host);
    return candidates.includes(originHost) ? origin : null;
  } catch {
    return null;
  }
}

function popupCorsHeaders(allowedOrigin: string | null): HeadersInit {
  if (!allowedOrigin) return {};
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function popupCorsPreflight(request: Request): Promise<Response> {
  const allowed = await getAllowedPopupOrigin(request.headers.get("Origin"));
  return new Response(null, { status: 204, headers: popupCorsHeaders(allowed) });
}

// Servido como <script src>, não fetch() — carregamento de script cross-origin não passa por
// CORS (diferente das 3 rotas abaixo), então não precisa checar Origin aqui.
async function handlePopupLoaderJs(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  try {
    const { renderPopupLoaderJs } = await import("./lib/popup.server");
    return new Response(renderPopupLoaderJs(), {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Falha ao servir o loader do pop-up:", error);
    return new Response("", { status: 500, headers: { "content-type": "application/javascript; charset=utf-8" } });
  }
}

async function handlePopupConfig(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return popupCorsPreflight(request);
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  const allowed = await getAllowedPopupOrigin(request.headers.get("Origin"));
  try {
    const { getActivePopupConfig } = await import("./lib/popup.server");
    const config = await getActivePopupConfig();
    return new Response(JSON.stringify(config ?? {}), {
      status: 200,
      headers: { "content-type": "application/json", ...popupCorsHeaders(allowed) },
    });
  } catch (error) {
    console.error("Falha ao buscar config do pop-up:", error);
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json", ...popupCorsHeaders(allowed) } });
  }
}

async function handlePopupVisit(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return popupCorsPreflight(request);
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const allowed = await getAllowedPopupOrigin(request.headers.get("Origin"));
  try {
    const body = await request.json();
    const { recordSiteVisit } = await import("./lib/popup.server");
    await recordSiteVisit({ visitorToken: String(body?.visitorToken ?? ""), pageUrl: body?.pageUrl ? String(body.pageUrl) : null });
  } catch (error) {
    console.error("Falha ao registrar visita do pop-up:", error);
  }
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "content-type": "application/json", ...popupCorsHeaders(allowed) },
  });
}

async function handlePopupCapture(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return popupCorsPreflight(request);
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const allowed = await getAllowedPopupOrigin(request.headers.get("Origin"));
  try {
    const body = await request.json();
    const { capturePopupLead } = await import("./lib/popup.server");
    const result = await capturePopupLead({
      phone: String(body?.phone ?? ""),
      name: body?.name ? String(body.name) : null,
      visitorToken: body?.visitorToken ? String(body.visitorToken) : null,
      pageUrl: body?.pageUrl ? String(body.pageUrl) : null,
      popupCampaignId: String(body?.popupCampaignId ?? ""),
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json", ...popupCorsHeaders(allowed) },
    });
  } catch (error) {
    console.error("Falha ao capturar lead do pop-up:", error);
    return new Response(JSON.stringify({ success: false, error: "Erro interno." }), {
      status: 500,
      headers: { "content-type": "application/json", ...popupCorsHeaders(allowed) },
    });
  }
}

async function handleEnvioCleanupEvents(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!(await checkAutomationSecret(request))) return new Response("Forbidden", { status: 401 });
  try {
    const result = await runEnvioGroupEventsCleanup();
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Falha na limpeza de eventos do Fluxo de Envio:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const pathname = new URL(request.url).pathname;
    if (pathname === WHATSAPP_WEBHOOK_PATH) {
      return handleWhatsappWebhook(request);
    }
    if (pathname === INSTAGRAM_WEBHOOK_PATH) {
      return handleInstagramWebhook(request);
    }
    if (pathname === AUTOMATIONS_TICK_PATH) {
      return handleAutomationsTick(request);
    }
    if (pathname === DAILY_EVENTS_ANALYSIS_PATH) {
      return handleDailyEventsAnalysis(request);
    }
    if (pathname === UAZAPI_WEBHOOK_PATH) {
      return handleUazapiWebhook(request);
    }
    if (pathname.startsWith(ENVIO_REDIRECT_PREFIX)) {
      return handleEnvioRedirect(request, ctx);
    }
    if (pathname.startsWith(TRACKED_LINK_PREFIX)) {
      return handleTrackedLink(request);
    }
    if (pathname === ENVIO_PROCESS_SCHEDULED_PATH) {
      return handleEnvioProcessScheduled(request);
    }
    if (pathname === ENVIO_RETURN_DISPATCH_PATH) {
      return handleEnvioReturnDispatch(request);
    }
    if (pathname === ENVIO_CLEANUP_EVENTS_PATH) {
      return handleEnvioCleanupEvents(request);
    }
    if (pathname === AI_ROUTINES_TICK_PATH) {
      return handleAiRoutinesTick(request);
    }
    if (pathname === AI_PLAYBOOK_TICK_PATH) {
      return handleAiPlaybookTick(request);
    }
    if (pathname === WHATSAPP_QUEUE_TICK_PATH) {
      return handleWhatsappQueueTick(request);
    }
    if (pathname === CRM_SYNC_TICK_PATH) {
      return handleCrmSyncTick(request);
    }
    if (pathname === POPUP_LOADER_JS_PATH) {
      return handlePopupLoaderJs(request);
    }
    if (pathname === POPUP_CONFIG_PATH) {
      return handlePopupConfig(request);
    }
    if (pathname === POPUP_VISIT_PATH) {
      return handlePopupVisit(request);
    }
    if (pathname === POPUP_CAPTURE_PATH) {
      return handlePopupCapture(request);
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
