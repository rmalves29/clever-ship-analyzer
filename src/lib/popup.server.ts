import { normalizePopupDesignConfig, type PopupDesignConfig } from "./popup-designer";

/** Pop-up de captura de WhatsApp no site (menu Automações > Pop-ups). Config e leads ficam em
 *  popup_campaigns/popup_leads/site_visits (ver migração add_popup_capture). O snippet colado no
 *  theme.liquid chama os endpoints públicos em src/server.ts, que usam as funções deste arquivo. */

const APP_URL = "https://clever-ship-analyzer.lovable.app";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PopupCampaign = {
  id: string;
  name: string;
  is_active: boolean;
  collect_name: boolean;
  headline: string;
  body_text: string;
  button_text: string;
  image_url: string | null;
  trigger_time_seconds: number | null;
  trigger_exit_intent: boolean;
  reshow_mode: "once_ever" | "after_days";
  reshow_after_days: number | null;
  coupon_mode: "none" | "fixed" | "unique";
  fixed_coupon_code: string | null;
  discount_type: "percentage" | "fixed_amount" | null;
  discount_value: number | null;
  discount_expires_days: number | null;
  template_id: string | null;
  template_name: string | null;
  template_language: string | null;
  template_var_mapping: Record<string, string>;
  design_config: PopupDesignConfig;
  created_at: string;
  updated_at: string;
};

const PUBLIC_CONFIG_FIELDS =
  "id, name, collect_name, headline, body_text, button_text, image_url, trigger_time_seconds, trigger_exit_intent, reshow_mode, reshow_after_days, design_config";

/** Config pública pro snippet renderizar o pop-up — nunca inclui dados de cupom/template. */
export async function getActivePopupConfig(): Promise<Record<string, unknown> | null> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("popup_campaigns" as any) as any)
    .select(PUBLIC_CONFIG_FIELDS)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { ...data, design_config: normalizePopupDesignConfig((data as any).design_config) };
}

export async function recordSiteVisit(params: { visitorToken: string; pageUrl: string | null }): Promise<void> {
  if (!params.visitorToken) return;
  const supabaseAdmin = await admin();
  const now = new Date().toISOString();

  await (supabaseAdmin.from("site_visits" as any) as any).insert({
    visitor_token: params.visitorToken,
    page_url: params.pageUrl,
    created_at: now,
  });

  await (supabaseAdmin.from("popup_leads" as any) as any)
    .update({ last_visit_at: now, updated_at: now })
    .eq("visitor_token", params.visitorToken);
}

/** Acha ou cria a linha de shopify_customers da lead por telefone — reaproveita uma ficha já
 *  existente (cliente que já comprou antes, por exemplo) em vez de criar uma segunda. */
async function upsertPopupCustomer(phone: string, name: string | null): Promise<string> {
  const supabaseAdmin = await admin();
  const { data: existing } = await supabaseAdmin
    .from("shopify_customers")
    .select("id, tags_custom, first_name")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; tags_custom: string[] | null; first_name: string | null };
    const tags = Array.from(new Set([...(row.tags_custom ?? []), "Pop-up Site"]));
    await supabaseAdmin
      .from("shopify_customers")
      .update({
        tags_custom: tags,
        first_name: row.first_name ?? name,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id);
    return row.id;
  }

  const id = `phone:${phone}`;
  await supabaseAdmin.from("shopify_customers").upsert({
    id,
    phone,
    first_name: name,
    tags_custom: ["Pop-up Site"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as never);
  return id;
}

function generatePopupCouponCode(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${suffix}`;
}

async function issueCouponIfNeeded(campaign: PopupCampaign): Promise<string | null> {
  if (campaign.coupon_mode === "none") return null;
  if (campaign.coupon_mode === "fixed") return campaign.fixed_coupon_code ?? null;

  const { createShopifyDiscountCodeBasic } = await import("./shopify.server");
  const code = generatePopupCouponCode("BEMVINDA");
  const days = campaign.discount_expires_days ?? 7;
  const startsAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const result = await createShopifyDiscountCodeBasic({
    title: `Pop-up: ${campaign.name}`,
    code,
    startsAt,
    endsAt,
    appliesOncePerCustomer: true,
    ...(campaign.discount_type === "fixed_amount"
      ? { fixedAmount: campaign.discount_value ?? 10 }
      : { percentageFraction: (campaign.discount_value ?? 10) / 100 }),
  });

  if (!result.success) {
    console.error("popup.server: falha ao criar cupom único:", result.error);
    return null;
  }
  return code;
}

/** Roleta: o benefício de verdade sai do prêmio sorteado (peso configurado por segmento), não
 *  mais do cupom único da campanha — cada segmento pode ter seu próprio código já existente na
 *  Shopify. Pop-ups sem roleta continuam usando o cupom único/fixo da campanha, como antes. */
async function resolveCouponForCapture(campaign: PopupCampaign): Promise<{ couponCode: string | null; prizeLabel: string | null }> {
  const design = campaign.design_config;
  if (design?.interaction === "wheel" && design.wheelPrizes?.length) {
    const { pickWeightedWheelPrize } = await import("./popup-designer");
    const prize = pickWeightedWheelPrize(design.wheelPrizes);
    if (!prize) return { couponCode: null, prizeLabel: null };
    return { couponCode: prize.type === "coupon" && prize.couponCode ? prize.couponCode : null, prizeLabel: prize.label };
  }
  return { couponCode: await issueCouponIfNeeded(campaign), prizeLabel: null };
}

async function sendWelcomeMessage(params: { campaign: PopupCampaign; phone: string; name: string | null; couponCode: string | null }): Promise<void> {
  const { campaign, phone, name, couponCode } = params;
  if (!campaign.template_name || !campaign.template_language) return;

  const { loadSettings, listMetaTemplates, sendTemplateMessage, toE164 } = await import("./whatsapp-meta.server");
  const { extractTemplateBodyTokens } = await import("./whatsapp-template-body-tokens");
  const { recordOutboundQueueMessage } = await import("./whatsapp-inbox.server");

  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) return;

  const templatesResult = await listMetaTemplates();
  if (!templatesResult.success) return;
  const template = templatesResult.templates.find(
    (t: { name: string; language: string }) => t.name === campaign.template_name && t.language === campaign.template_language,
  );
  if (!template) return;

  const bodyComponent = template.components.find((c: { type: string; text?: string }) => c.type === "BODY");
  const tokens = extractTemplateBodyTokens(bodyComponent?.text);
  const mapping = campaign.template_var_mapping ?? {};

  const bodyParams = tokens.map((token) => {
    const source = mapping[token];
    if (source === "name") return name ?? "";
    if (source === "coupon_code") return couponCode ?? "";
    if (source?.startsWith("static:")) return source.slice("static:".length);
    return "";
  });

  const to = toE164(phone);
  if (!to) return;

  const sendResult = await sendTemplateMessage({
    accessToken: settings.accessToken,
    phoneNumberId: settings.phoneNumberId,
    to,
    templateName: campaign.template_name,
    templateLanguage: campaign.template_language,
    bodyParams,
    bodyParamTokens: tokens,
  });

  if (sendResult.ok) {
    const renderedBody = bodyComponent?.text
      ? tokens.reduce((text, token, i) => text.replaceAll(`{{${token}}}`, bodyParams[i] ?? ""), bodyComponent.text)
      : `Template: ${campaign.template_name}`;
    await recordOutboundQueueMessage({ phone: to, body: renderedBody, waMessageId: sendResult.waMessageId ?? null }).catch(() => {});
  } else {
    console.error("popup.server: envio de boas-vindas falhou:", sendResult.error);
  }
}

export async function capturePopupLead(params: {
  phone: string;
  name: string | null;
  visitorToken: string | null;
  pageUrl: string | null;
  popupCampaignId: string;
}): Promise<{ success: boolean; couponCode?: string | null; prizeLabel?: string | null; error?: string }> {
  const { toE164 } = await import("./whatsapp-meta.server");
  const phone = toE164(params.phone);
  if (!phone) return { success: false, error: "Telefone inválido." };

  const supabaseAdmin = await admin();

  const { data: campaignRow } = await (supabaseAdmin.from("popup_campaigns" as any) as any)
    .select("*")
    .eq("id", params.popupCampaignId)
    .maybeSingle();
  const campaign = campaignRow as PopupCampaign | null;
  if (!campaign) return { success: false, error: "Pop-up não encontrado." };

  const { data: existingLead } = await (supabaseAdmin.from("popup_leads" as any) as any)
    .select("id, coupon_code, last_captured_at")
    .eq("phone", phone)
    .maybeSingle();

  if (existingLead) {
    const last = new Date(existingLead.last_captured_at).getTime();
    if (Date.now() - last < 24 * 60 * 60 * 1000) {
      return { success: true, couponCode: existingLead.coupon_code };
    }
  }

  const customerRowId = await upsertPopupCustomer(phone, params.name);
  const { couponCode, prizeLabel } = await resolveCouponForCapture(campaign);
  const now = new Date().toISOString();

  await (supabaseAdmin.from("popup_leads" as any) as any).upsert(
    {
      phone,
      name: params.name,
      visitor_token: params.visitorToken,
      popup_campaign_id: campaign.id,
      coupon_code: couponCode,
      customer_row_id: customerRowId,
      last_captured_at: now,
      updated_at: now,
      ...(existingLead ? {} : { first_captured_at: now }),
    } as never,
    { onConflict: "phone" },
  );

  await sendWelcomeMessage({ campaign, phone, name: params.name, couponCode }).catch((error) => {
    console.error("popup.server: falha ao enviar mensagem de boas-vindas:", error);
  });

  return { success: true, couponCode, prizeLabel };
}

/** Snippet auto-contido pra colar 1x no theme.liquid — sem dependências externas, CSS isolado. */
export function renderPopupLoaderScript(): string {
  return `<script>
(function () {
  var API = "${APP_URL}";
  var STORAGE_CAPTURED = "mm_popup_captured";
  var STORAGE_HIDE_UNTIL = "mm_popup_hide_until";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getVisitorToken() {
    try {
      var t = localStorage.getItem("mm_visitor_token");
      if (!t) { t = "v" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("mm_visitor_token", t); }
      return t;
    } catch (e) { return null; }
  }

  var token = getVisitorToken();
  if (token) {
    fetch(API + "/api/popup/visit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorToken: token, pageUrl: location.href })
    }).catch(function () {});
  }

  try {
    if (localStorage.getItem(STORAGE_CAPTURED) === "1") return;
    var hideUntil = Number(localStorage.getItem(STORAGE_HIDE_UNTIL) || 0);
    if (Date.now() < hideUntil) return;
  } catch (e) {}

  fetch(API + "/api/popup/config").then(function (r) { return r.json(); }).then(function (cfg) {
    if (!cfg || !cfg.id) return;
    var shown = false;
    function show() {
      if (shown) return;
      shown = true;
      renderPopup(cfg, token);
    }
    if (typeof cfg.trigger_time_seconds === "number") setTimeout(show, Math.max(0, cfg.trigger_time_seconds) * 1000);
    if (cfg.trigger_exit_intent) {
      document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && e.clientY < 10) show(); });
    }
    if (typeof cfg.trigger_time_seconds !== "number" && !cfg.trigger_exit_intent) show();
  }).catch(function () {});

  function renderPopup(cfg, visitorToken) {
    var d = cfg.design_config || {};
    var state = { name: "", phone: "", coupon: null, busy: false };
    var isMobile = window.innerWidth < 640;
    var progressive = d.journey === "progressive";
    var wheel = d.interaction === "wheel";
    var firstStage = progressive ? (cfg.collect_name ? "name" : "phone") : "capture";

    var overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:rgba(0,0,0," + (Number(d.overlayOpacity) || .52) + ");";

    var box = document.createElement("div");
    var width = Math.min(Number(d.width) || 430, window.innerWidth - 28);
    box.style.cssText = "position:relative;overflow:hidden;width:" + width + "px;max-width:100%;max-height:92vh;overflow-y:auto;background:" + (d.backgroundColor || "#fffdf9") + ";color:" + (d.textColor || "#111827") + ";border-radius:" + (Number(d.borderRadius) || 24) + "px;border:1px solid " + (d.accentColor || "#d7ff52") + ";box-shadow:0 25px 80px rgba(0,0,0,.28);";

    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Fechar");
    close.textContent = "×";
    close.style.cssText = "position:absolute;z-index:20;top:12px;right:12px;width:34px;height:34px;border:none;border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 2px 12px rgba(0,0,0,.12);font-size:22px;line-height:32px;cursor:pointer;color:#475467;";
    close.onclick = closePopup;
    box.appendChild(close);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function closePopup() {
      overlay.remove();
      var days = cfg.reshow_mode === "once_ever" ? 3650 : (cfg.reshow_after_days || 7);
      try { localStorage.setItem(STORAGE_HIDE_UNTIL, String(Date.now() + days * 86400000)); } catch (e) {}
    }

    function field(id, placeholder, value) {
      return '<input id="' + id + '" value="' + esc(value || "") + '" placeholder="' + esc(placeholder) + '" style="width:100%;height:46px;padding:0 14px;margin:0 0 9px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;box-sizing:border-box;font-size:14px;outline:none;">';
    }

    function mainButton(text, id) {
      return '<button id="' + (id || "mm_pu_submit") + '" type="button" style="width:100%;min-height:46px;padding:11px 16px;border:none;border-radius:10px;background:' + (d.buttonColor || "#111827") + ';color:' + (d.buttonTextColor || "#fff") + ';font-size:12px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;cursor:pointer;box-shadow:0 5px 14px rgba(0,0,0,.12);">' + esc(text) + '</button>';
    }

    function contentShell(inner) {
      return '<div style="display:flex;min-height:320px;flex-direction:column;justify-content:center;padding:' + (isMobile ? "30px 24px" : "38px 42px") + ';box-sizing:border-box;text-align:center;">' + inner + '</div>';
    }

    function headingBlock() {
      var badge = d.badgeText ? '<div style="display:inline-block;margin:0 auto 12px;padding:5px 10px;border:1px solid rgba(17,24,39,.15);border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">' + esc(d.badgeText) + '</div>' : '';
      return badge + '<h2 style="margin:0;font-size:' + (isMobile ? "24px" : "29px") + ';line-height:1.05;font-weight:900;letter-spacing:-.035em;color:' + (d.textColor || "#111827") + ';">' + esc(cfg.headline) + '</h2>' +
        '<p style="margin:12px auto 20px;max-width:420px;font-size:14px;line-height:1.55;color:' + (d.mutedColor || "#667085") + ';">' + esc(cfg.body_text) + '</p>';
    }

    function imageBlock() {
      if (!cfg.image_url || d.imagePosition === "none" || wheel) return "";
      return '<div style="min-height:260px;background-image:url(&quot;' + esc(cfg.image_url) + '&quot;);background-size:cover;background-position:center;"></div>';
    }

    function wheelBlock() {
      var defaultPrizes = [{ label: "10% OFF" }, { label: "15% OFF" }, { label: "20% OFF" }, { label: "SURPRESA" }];
      var prizes = Array.isArray(d.wheelPrizes) && d.wheelPrizes.length >= 2 ? d.wheelPrizes.slice(0, 8) : defaultPrizes;
      var palette = ["#f1b93b", "#183b56", "#f0f3f4", "#cf7b53", "#8fb9a8", "#edd7ad", "#d7ff52", "#ef9cad"];
      var step = 360 / prizes.length;
      var gradient = prizes.map(function (p, i) { return (p.color || palette[i % palette.length]) + " " + (i * step) + "deg " + ((i + 1) * step) + "deg"; }).join(",");
      var labels = prizes.map(function (p, i) {
        var angle = i * step + step / 2;
        var rad = (angle - 90) * Math.PI / 180;
        var x = 50 + Math.cos(rad) * 34;
        var y = 50 + Math.sin(rad) * 34;
        return '<span style="position:absolute;left:' + x + '%;top:' + y + '%;transform:translate(-50%,-50%) rotate(' + angle + 'deg);max-width:62px;text-align:center;font-size:9px;font-weight:900;line-height:1.05;color:#111827;">' + esc(p.label) + '</span>';
      }).join("");
      return '<div style="display:flex;align-items:center;justify-content:center;padding:28px 18px;min-height:300px;"><div id="mm_pu_wheel" style="position:relative;width:min(250px,72vw);aspect-ratio:1;border-radius:50%;border:10px solid #fff;box-shadow:0 14px 35px rgba(0,0,0,.18);background:conic-gradient(' + gradient + ');transition:transform .9s cubic-bezier(.2,.8,.2,1);"><div style="position:absolute;left:50%;top:50%;width:54px;height:54px;transform:translate(-50%,-50%);border-radius:50%;border:4px solid #fff;background:#101828;"></div>' + labels + '</div></div>';
    }

    function buildCapture(stage) {
      var inputs = "";
      if (!progressive || stage === "capture") {
        if (cfg.collect_name) inputs += field("mm_pu_name", d.namePlaceholder || "Como podemos te chamar?", state.name);
        inputs += field("mm_pu_phone", d.inputPlaceholder || "Seu melhor WhatsApp", state.phone);
      } else if (stage === "name") {
        inputs = field("mm_pu_name", d.namePlaceholder || "Como podemos te chamar?", state.name);
      } else {
        inputs = field("mm_pu_phone", d.inputPlaceholder || "Seu melhor WhatsApp", state.phone);
      }
      var buttonText = progressive && stage === "name" ? "CONTINUAR" : cfg.button_text;
      return contentShell(headingBlock() + inputs + mainButton(buttonText) + '<div id="mm_pu_msg" style="min-height:16px;margin-top:9px;font-size:12px;color:' + (d.mutedColor || "#667085") + ';"></div>');
    }

    function render(stage) {
      var main = "";
      if (stage === "result") {
        main = buildResult();
      } else if (wheel) {
        var capture = buildCapture(stage);
        main = !isMobile ? '<div style="display:grid;grid-template-columns:.9fr 1.1fr;min-height:360px;">' + wheelBlock() + capture + '</div>' : wheelBlock() + capture;
      } else {
        var captureHtml = buildCapture(stage);
        var image = imageBlock();
        var split = !isMobile && d.layout === "split" && d.imagePosition !== "top" && image;
        if (split && d.imagePosition === "left") main = '<div style="display:grid;grid-template-columns:1fr 1fr;">' + image + captureHtml + '</div>';
        else if (split && d.imagePosition === "right") main = '<div style="display:grid;grid-template-columns:1fr 1fr;">' + captureHtml + image + '</div>';
        else main = (image && d.imagePosition === "top" ? image : "") + captureHtml;
      }
      Array.prototype.slice.call(box.children).forEach(function (child) { if (child !== close) child.remove(); });
      var holder = document.createElement("div");
      holder.innerHTML = main;
      box.insertBefore(holder, close);
      bind(stage);
    }

    function bind(stage) {
      var btn = document.getElementById("mm_pu_submit");
      if (!btn) return;
      btn.onclick = function () {
        if (state.busy) return;
        var nameEl = document.getElementById("mm_pu_name");
        var phoneEl = document.getElementById("mm_pu_phone");
        if (nameEl) state.name = nameEl.value.trim();
        if (phoneEl) state.phone = phoneEl.value.trim();
        if (progressive && stage === "name") {
          if (!state.name) return showMessage("Informe seu nome para continuar.");
          return render("phone");
        }
        if (!state.phone) return showMessage("Informe seu WhatsApp para continuar.");
        submitLead();
      };
    }

    function showMessage(message) {
      var el = document.getElementById("mm_pu_msg");
      if (el) el.textContent = message;
    }

    function submitLead() {
      state.busy = true;
      showMessage(wheel ? "Girando e liberando seu benefício..." : "Liberando seu benefício...");
      var wheelEl = document.getElementById("mm_pu_wheel");
      if (wheelEl) wheelEl.style.transform = "rotate(1080deg)";
      var wait = wheelEl ? 900 : 0;
      setTimeout(function () {
        fetch(API + "/api/popup/capture", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: state.phone, name: state.name || null, visitorToken: visitorToken, pageUrl: location.href, popupCampaignId: cfg.id })
        }).then(function (r) { return r.json(); }).then(function (res) {
          state.busy = false;
          if (!res.success) return showMessage(res.error || "Não foi possível concluir. Confira seu WhatsApp.");
          state.coupon = res.couponCode || null;
          try { localStorage.setItem(STORAGE_CAPTURED, "1"); } catch (e) {}
          render("result");
        }).catch(function () {
          state.busy = false;
          showMessage("Não foi possível concluir agora. Tente novamente.");
        });
      }, wait);
    }

    function buildResult() {
      var coupon = state.coupon ? '<div style="margin:20px 0 10px;padding:14px 18px;border:2px dashed ' + (d.accentColor || "#d7ff52") + ';border-radius:12px;"><div style="font-size:9px;text-transform:uppercase;letter-spacing:.15em;color:' + (d.mutedColor || "#667085") + ';">Seu cupom</div><div id="mm_pu_coupon" style="margin-top:4px;font-size:21px;font-weight:900;letter-spacing:.08em;color:' + (d.textColor || "#111827") + ';">' + esc(state.coupon) + '</div></div>' : '';
      return contentShell('<div style="display:flex;width:48px;height:48px;margin:0 auto 14px;align-items:center;justify-content:center;border-radius:50%;background:' + (d.accentColor || "#d7ff52") + '55;font-size:22px;">✦</div><h2 style="margin:0;font-size:26px;line-height:1.08;font-weight:900;color:' + (d.textColor || "#111827") + ';">' + esc(d.resultHeadline || "Seu benefício está liberado!") + '</h2><p style="margin:12px auto 0;max-width:390px;font-size:14px;line-height:1.55;color:' + (d.mutedColor || "#667085") + ';">' + esc(d.resultBody || "Aproveite seu benefício na sua compra.") + '</p>' + coupon + mainButton(d.resultButtonText || (state.coupon ? "COPIAR CUPOM" : "CONTINUAR"), "mm_pu_result_btn"));
    }

    function bindResult() {
      var btn = document.getElementById("mm_pu_result_btn");
      if (!btn) return;
      btn.onclick = function () {
        if (state.coupon && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(state.coupon).then(function () { btn.textContent = "CUPOM COPIADO ✓"; }).catch(function () { closePopup(); });
        } else closePopup();
      };
    }

    var originalRender = render;
    render = function (stage) { originalRender(stage); if (stage === "result") bindResult(); };
    render(firstStage);
  }
})();
</script>`;
}
