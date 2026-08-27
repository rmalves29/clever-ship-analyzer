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
  created_at: string;
  updated_at: string;
};

const PUBLIC_CONFIG_FIELDS =
  "id, name, collect_name, headline, body_text, button_text, image_url, trigger_time_seconds, trigger_exit_intent, reshow_mode, reshow_after_days";

/** Config pública pro snippet renderizar o pop-up — nunca inclui dados de cupom/template. */
export async function getActivePopupConfig(): Promise<Record<string, unknown> | null> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("popup_campaigns" as any) as any)
    .select(PUBLIC_CONFIG_FIELDS)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
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
}): Promise<{ success: boolean; couponCode?: string | null; error?: string }> {
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
  const couponCode = await issueCouponIfNeeded(campaign);
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

  return { success: true, couponCode };
}

/** Snippet auto-contido pra colar 1x no theme.liquid — sem dependências externas, CSS isolado. */
export function renderPopupLoaderScript(): string {
  return `<script>
(function () {
  var API = "${APP_URL}";
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
      body: JSON.stringify({ visitorToken: token, pageUrl: location.href }),
    }).catch(function () {});
  }

  if (localStorage.getItem("mm_popup_captured") === "1") return;
  var hideUntil = Number(localStorage.getItem("mm_popup_hide_until") || 0);
  if (Date.now() < hideUntil) return;

  fetch(API + "/api/popup/config").then(function (r) { return r.json(); }).then(function (cfg) {
    if (!cfg || !cfg.id) return;
    var shown = false;
    function show() {
      if (shown) return;
      shown = true;
      renderPopup(cfg, token);
    }
    if (cfg.trigger_time_seconds) setTimeout(show, cfg.trigger_time_seconds * 1000);
    if (cfg.trigger_exit_intent) {
      document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && e.clientY < 10) show(); });
    }
  }).catch(function () {});

  function renderPopup(cfg, visitorToken) {
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:12px;max-width:360px;width:90%;padding:28px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.2);position:relative;";
    var close = document.createElement("button");
    close.textContent = "\\u00d7";
    close.style.cssText = "position:absolute;top:8px;right:12px;border:none;background:none;font-size:22px;cursor:pointer;color:#999;";
    close.onclick = function () {
      overlay.remove();
      var mode = cfg.reshow_mode === "once_ever" ? 365 : (cfg.reshow_after_days || 7);
      try { localStorage.setItem("mm_popup_hide_until", String(Date.now() + mode * 86400000)); } catch (e) {}
    };
    var html = '<h2 style="margin:0 0 8px;font-size:20px;">' + cfg.headline + '</h2>' +
      '<p style="margin:0 0 16px;color:#555;font-size:14px;">' + cfg.body_text + '</p>' +
      (cfg.collect_name ? '<input id="mm_pu_name" placeholder="Seu nome" style="width:100%;padding:10px;margin-bottom:8px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">' : '') +
      '<input id="mm_pu_phone" placeholder="Seu WhatsApp" style="width:100%;padding:10px;margin-bottom:12px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">' +
      '<button id="mm_pu_submit" style="width:100%;padding:12px;background:#d6336c;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">' + cfg.button_text + '</button>' +
      '<div id="mm_pu_msg" style="margin-top:10px;font-size:13px;color:#555;"></div>';
    box.innerHTML = html;
    box.appendChild(close);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById("mm_pu_submit").onclick = function () {
      var phone = document.getElementById("mm_pu_phone").value.trim();
      var nameEl = document.getElementById("mm_pu_name");
      var name = nameEl ? nameEl.value.trim() : null;
      if (!phone) return;
      fetch(API + "/api/popup/capture", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone, name: name, visitorToken: visitorToken, pageUrl: location.href, popupCampaignId: cfg.id }),
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.success) {
          try { localStorage.setItem("mm_popup_captured", "1"); } catch (e) {}
          document.getElementById("mm_pu_msg").textContent = res.couponCode
            ? "Cadastro feito! Seu cupom: " + res.couponCode
            : "Cadastro feito! Você vai receber uma mensagem no WhatsApp.";
          setTimeout(function () { overlay.remove(); }, 4000);
        }
      }).catch(function () {});
    };
  }
})();
</script>`;
}
