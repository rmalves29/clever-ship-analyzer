import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { applyMetaStatusUpdate, applyMetaTemplateStatusUpdate, getStoredVerifyToken } from "./lib/whatsapp-meta.server";
import { matchIncomingMessage } from "./lib/conversational-flows.server";
import { getAutomationTickSecret, runAutomationsTickWithLog } from "./lib/automations-engine.server";
import { runDailyEventsAnalysis } from "./lib/events.server";
import { getFlowWebhookVerifyToken, processInstagramWebhookBody, verifyMetaSignature } from "./lib/flow-engine.server";

const WHATSAPP_WEBHOOK_PATH = "/api/whatsapp-webhook";
const INSTAGRAM_WEBHOOK_PATH = "/api/instagram-webhook";
const AUTOMATIONS_TICK_PATH = "/api/automations/tick";
const DAILY_EVENTS_ANALYSIS_PATH = "/api/events/daily-analysis";

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
    try {
      const body: any = await request.json();
      const changes: any[] = body?.entry?.flatMap((e: any) => e?.changes ?? []) ?? [];

      const statuses = changes.flatMap((c) => (c?.field === "messages" ? (c?.value?.statuses ?? []) : []));
      for (const s of statuses) {
        if (s?.id && s?.status) {
          await applyMetaStatusUpdate({ id: s.id, status: s.status, timestamp: s.timestamp, errors: s.errors });
        }
      }

      // Mensagens recebidas (cliente respondeu ou clicou num botão) — dispara fluxo conversacional.
      const messages = changes.flatMap((c) => (c?.field === "messages" ? (c?.value?.messages ?? []) : []));
      for (const m of messages) {
        if (m?.from) {
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
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Falha ao rodar a análise diária de eventos:", error);
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
