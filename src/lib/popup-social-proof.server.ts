import {
  SOCIAL_PROOF_DELAY_AFTER_CAPTURE_MS,
  SOCIAL_PROOF_FALLBACK_DELAY_MS,
  SOCIAL_PROOF_INTERVAL_MS,
  SOCIAL_PROOF_VISIBLE_MS,
  buildSocialProofShopifyQuery,
  getPreviousDayRangeSaoPaulo,
  sanitizeSocialProofOrders,
  type SocialProofOrder,
} from "./popup-social-proof";
import { getShopifyCredentials, shopifyGraphQL } from "./shopify.server";

const APP_URL = "https://clever-ship-analyzer.lovable.app";
const CACHE_TTL_MS = 5 * 60_000;
const HOST_CACHE_TTL_MS = 10 * 60_000;

const SOCIAL_PROOF_ORDERS_QUERY = `#graphql
  query YesterdaySocialProofOrders($query: String!, $after: String) {
    orders(first: 100, after: $after, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes {
        createdAt
        processedAt
        cancelledAt
        displayFinancialStatus
        test
        customer { firstName }
        shippingAddress { firstName city provinceCode }
        lineItems(first: 20) {
          nodes {
            title
            quantity
            image { url }
            product {
              featuredMedia {
                preview { image { url } }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

let salesCache: { date: string; expiresAt: number; sales: ReturnType<typeof sanitizeSocialProofOrders> } | null = null;
let allowedHostsCache: { expiresAt: number; hosts: Set<string> } | null = null;

function normalizeHost(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "").split("/")[0] ?? "";
}

async function getAllowedStoreHosts(): Promise<Set<string>> {
  if (allowedHostsCache && allowedHostsCache.expiresAt > Date.now()) return allowedHostsCache.hosts;

  const hosts = new Set<string>();
  try {
    const { domain } = await getShopifyCredentials();
    const configured = normalizeHost(domain);
    if (configured) hosts.add(configured);

    const primary = await shopifyGraphQL(`query PopupPrimaryDomain { shop { primaryDomain { host } } }`);
    const primaryHost = normalizeHost(primary?.data?.shop?.primaryDomain?.host);
    if (primaryHost) {
      hosts.add(primaryHost);
      if (primaryHost.startsWith("www.")) hosts.add(primaryHost.slice(4));
      else hosts.add(`www.${primaryHost}`);
    }
  } catch (error) {
    console.error("Falha ao resolver os domínios permitidos do popup de vendas:", error);
  }

  allowedHostsCache = { hosts, expiresAt: Date.now() + HOST_CACHE_TTL_MS };
  return hosts;
}

async function allowedOrigin(request: Request): Promise<string | null> {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const host = normalizeHost(new URL(origin).hostname);
    const hosts = await getAllowedStoreHosts();
    return hosts.has(host) ? origin : null;
  } catch {
    return null;
  }
}

async function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return { "Vary": "Origin" };
  const allowed = await allowedOrigin(request);
  if (!allowed) return null;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

async function loadYesterdaySales() {
  const range = getPreviousDayRangeSaoPaulo();
  if (salesCache?.date === range.date && salesCache.expiresAt > Date.now()) {
    return { date: range.date, sales: salesCache.sales };
  }

  const orders: SocialProofOrder[] = [];
  let after: string | null = null;
  const query = buildSocialProofShopifyQuery(range.startIso, range.endIso);

  for (let pages = 0; pages < 10; pages++) {
    const result: any = await shopifyGraphQL(SOCIAL_PROOF_ORDERS_QUERY, { query, after });
    const connection = result?.data?.orders;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
    orders.push(...nodes);
    if (!connection?.pageInfo?.hasNextPage || !connection?.pageInfo?.endCursor) break;
    after = String(connection.pageInfo.endCursor);
  }

  const sales = sanitizeSocialProofOrders(orders);
  salesCache = { date: range.date, sales, expiresAt: Date.now() + CACHE_TTL_MS };
  return { date: range.date, sales };
}

export async function handleSocialProofDataRequest(request: Request): Promise<Response> {
  const headers = await corsHeaders(request);
  if (request.headers.get("origin") && !headers) return new Response("Forbidden", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers ?? {} });
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: headers ?? {} });

  try {
    const { date, sales } = await loadYesterdaySales();
    return new Response(
      JSON.stringify({
        date,
        delayAfterCaptureSeconds: SOCIAL_PROOF_DELAY_AFTER_CAPTURE_MS / 1000,
        intervalSeconds: SOCIAL_PROOF_INTERVAL_MS / 1000,
        visibleSeconds: SOCIAL_PROOF_VISIBLE_MS / 1000,
        total: sales.length,
        sales,
      }),
      {
        status: 200,
        headers: {
          ...(headers ?? {}),
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=1800",
        },
      },
    );
  } catch (error) {
    console.error("Falha ao carregar vendas para o popup de prova social:", error);
    return new Response(JSON.stringify({ date: null, total: 0, sales: [] }), {
      status: 200,
      headers: { ...(headers ?? {}), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export function renderSocialProofLoaderScript() {
  const endpoint = `${APP_URL}/api/popup/social-proof`;
  return `(() => {
  if (window.__MM_SALES_PROOF_LOADED__) return;
  window.__MM_SALES_PROOF_LOADED__ = true;

  const ENDPOINT = ${JSON.stringify(endpoint)};
  const AFTER_CAPTURE_MS = ${SOCIAL_PROOF_DELAY_AFTER_CAPTURE_MS};
  const INTERVAL_MS = ${SOCIAL_PROOF_INTERVAL_MS};
  const VISIBLE_MS = ${SOCIAL_PROOF_VISIBLE_MS};
  const FALLBACK_MS = ${SOCIAL_PROOF_FALLBACK_DELAY_MS};
  const ROOT_ID = "mm-sales-proof";
  let sales = [];
  let index = 0;
  let cycleTimer = null;
  let hideTimer = null;
  let firstTimer = null;
  let captureDetected = false;
  let started = false;

  try {
    if (sessionStorage.getItem("mmSalesProofClosed") === "1") return;
  } catch (_) {}

  const escapeUrl = (value) => {
    try {
      const url = new URL(String(value || ""), location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) { return ""; }
  };

  const locationLabel = (sale) => {
    const city = String(sale.city || "").trim();
    const state = String(sale.state || "").trim();
    if (!city) return sale.firstName;
    return sale.firstName + " de " + city + (state ? "/" + state : "");
  };

  const ensureCard = () => {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("aside");
    root.id = ROOT_ID;
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-label", "Compra recente");
    root.innerHTML = '<button class="mmsp-close" type="button" aria-label="Fechar">×</button><div class="mmsp-media"><img class="mmsp-image" alt="" loading="lazy"><div class="mmsp-placeholder">MM</div></div><div class="mmsp-copy"><div class="mmsp-buyer"></div><div class="mmsp-action">comprou</div><div class="mmsp-product"></div><div class="mmsp-extra"></div><div class="mmsp-time">ontem</div></div>';
    const style = document.createElement("style");
    style.textContent = '#'+ROOT_ID+'{position:fixed;left:18px;top:18px;width:334px;min-height:116px;box-sizing:border-box;display:flex;gap:12px;padding:10px 32px 10px 10px;background:#fff;color:#262626;border:1px solid rgba(0,0,0,.06);border-radius:9px;box-shadow:0 8px 26px rgba(0,0,0,.16);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;z-index:2147483000;opacity:0;visibility:hidden;transform:translateY(-10px);transition:opacity .25s ease,transform .25s ease,visibility .25s;pointer-events:none}#'+ROOT_ID+'.mmsp-show{opacity:1;visibility:visible;transform:translateY(0);pointer-events:auto}#'+ROOT_ID+' .mmsp-media{width:92px;height:96px;flex:0 0 92px;border-radius:5px;overflow:hidden;background:#f6f1ef;display:grid;place-items:center}#'+ROOT_ID+' .mmsp-image{width:100%;height:100%;object-fit:cover;display:none}#'+ROOT_ID+' .mmsp-placeholder{font:700 20px/1 Georgia,serif;color:#9b6f63;letter-spacing:.04em}#'+ROOT_ID+' .mmsp-copy{min-width:0;padding-top:2px;font-size:12px;line-height:1.28}#'+ROOT_ID+' .mmsp-buyer{font-weight:650;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#'+ROOT_ID+' .mmsp-action{color:#666;margin-bottom:1px}#'+ROOT_ID+' .mmsp-product{font-weight:560;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:32px}#'+ROOT_ID+' .mmsp-extra{font-size:10px;color:#777;margin-top:2px;min-height:0}#'+ROOT_ID+' .mmsp-time{font-size:10px;color:#8a8a8a;margin-top:4px}#'+ROOT_ID+' .mmsp-close{position:absolute;right:7px;top:5px;border:0;background:transparent;color:#757575;font:400 20px/1 Arial,sans-serif;cursor:pointer;padding:4px;z-index:2} @media(max-width:480px){#'+ROOT_ID+'{left:12px;right:12px;top:12px;width:auto;max-width:none;min-height:108px}#'+ROOT_ID+' .mmsp-media{width:84px;height:88px;flex-basis:84px}}';
    document.head.appendChild(style);
    document.body.appendChild(root);
    root.querySelector(".mmsp-close").addEventListener("click", () => {
      root.classList.remove("mmsp-show");
      if (cycleTimer) clearInterval(cycleTimer);
      if (hideTimer) clearTimeout(hideTimer);
      try { sessionStorage.setItem("mmSalesProofClosed", "1"); } catch (_) {}
    });
    return root;
  };

  const showSale = (sale) => {
    if (!sale) return;
    const root = ensureCard();
    const buyer = root.querySelector(".mmsp-buyer");
    const product = root.querySelector(".mmsp-product");
    const extra = root.querySelector(".mmsp-extra");
    const img = root.querySelector(".mmsp-image");
    const placeholder = root.querySelector(".mmsp-placeholder");
    buyer.textContent = locationLabel(sale);
    product.textContent = String(sale.productTitle || "");
    extra.textContent = Number(sale.itemCount || 0) > 1 ? "+ " + (Number(sale.itemCount) - 1) + " " + (Number(sale.itemCount) - 1 === 1 ? "item no pedido" : "itens no pedido") : "";
    const imageUrl = escapeUrl(sale.productImageUrl);
    if (imageUrl) {
      img.src = imageUrl;
      img.alt = String(sale.productTitle || "Produto comprado");
      img.style.display = "block";
      placeholder.style.display = "none";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
      placeholder.style.display = "grid";
    }
    root.classList.add("mmsp-show");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => root.classList.remove("mmsp-show"), VISIBLE_MS);
  };

  const advance = () => {
    if (!sales.length) return;
    showSale(sales[index % sales.length]);
    index = (index + 1) % sales.length;
  };

  const start = () => {
    if (started || !sales.length) return;
    started = true;
    advance();
    cycleTimer = setInterval(advance, INTERVAL_MS);
  };

  const scheduleAfterCapture = () => {
    if (captureDetected || started) return;
    captureDetected = true;
    if (firstTimer) clearTimeout(firstTimer);
    firstTimer = setTimeout(start, AFTER_CAPTURE_MS);
  };

  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.id === ROOT_ID || el.closest('#'+ROOT_ID)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 180 && rect.height > 80;
  };

  const looksLikeCapture = (el) => {
    if (!isVisible(el)) return false;
    const marker = ((el.id || "") + " " + (el.className || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
    const text = String(el.textContent || "").slice(0, 900).toLowerCase();
    const markerMatch = /(popup|modal|newsletter|signup|sign-up|capture|lead|discount|cupom|klaviyo|privy|wisepops)/.test(marker);
    const textMatch = /(e-mail|email|whatsapp|cupom|desconto|cadastre|cadastro|ganhe|primeira compra|receba)/.test(text);
    if (el.tagName === "DIALOG" || el.getAttribute("role") === "dialog") return markerMatch || textMatch;
    if (el.tagName === "IFRAME") {
      const src = String(el.getAttribute("src") || "").toLowerCase();
      return /(popup|klaviyo|privy|wisepops|newsletter|capture)/.test(src);
    }
    return markerMatch && textMatch;
  };

  const scanCapture = () => {
    const candidates = document.querySelectorAll('[role="dialog"],dialog[open],[class*="popup" i],[class*="modal" i],[id*="popup" i],[id*="modal" i],iframe');
    for (const el of candidates) {
      if (looksLikeCapture(el)) { scheduleAfterCapture(); return; }
    }
  };

  window.addEventListener("mm:capture-popup-shown", scheduleAfterCapture, { once: true });
  const observer = new MutationObserver(scanCapture);
  const observe = () => {
    if (!document.body) return setTimeout(observe, 50);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "open", "aria-hidden"] });
    scanCapture();
  };
  observe();

  fetch(ENDPOINT, { credentials: "omit", mode: "cors" })
    .then((res) => res.ok ? res.json() : Promise.reject(new Error("social proof unavailable")))
    .then((data) => { sales = Array.isArray(data && data.sales) ? data.sales : []; })
    .catch(() => { sales = []; });

  firstTimer = setTimeout(start, FALLBACK_MS);
  setTimeout(() => observer.disconnect(), 120000);
})();`;
}

export async function handleSocialProofLoaderRequest(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
  return new Response(request.method === "HEAD" ? null : renderSocialProofLoaderScript(), {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
      "access-control-allow-origin": "*",
    },
  });
}
