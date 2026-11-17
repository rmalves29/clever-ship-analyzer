import {
  addToTotals,
  classifyAffiliateOrder,
  emptyTotals,
  isValidAffiliateCode,
  pickAffiliateCode,
  round2,
  type ClassifiedOrder,
  type CommissionStatus,
} from "./affiliate-commission";

/** Programa de afiliadas (cadastro, cupom exclusivo, comissão por pedido, pagamentos e painel da afiliada). */

async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Configuração

export type AffiliateSettings = {
  commissionPct: number;
  discountPct: number;
  holdDays: number;
  windowStart: string | null;
  windowEnd: string | null;
};

export async function getAffiliateSettings(): Promise<AffiliateSettings> {
  const supabase = await db();
  const { data, error } = await supabase.from("affiliate_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  return {
    commissionPct: Number(data?.commission_pct ?? 15),
    discountPct: Number(data?.discount_pct ?? 5),
    holdDays: Number(data?.hold_days ?? 10),
    windowStart: data?.window_start ?? null,
    windowEnd: data?.window_end ?? null,
  };
}

export async function saveAffiliateSettings(input: AffiliateSettings): Promise<AffiliateSettings> {
  const supabase = await db();
  const { error } = await supabase.from("affiliate_settings").upsert({
    id: true,
    commission_pct: input.commissionPct,
    discount_pct: input.discountPct,
    hold_days: input.holdDays,
    window_start: input.windowStart,
    window_end: input.windowEnd,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return getAffiliateSettings();
}

// ---------------------------------------------------------------------------------------------
// Dados base

export type AffiliateStatus = "pending" | "approved" | "rejected" | "blocked";

export type AffiliateRow = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  instagram: string | null;
  tiktok: string | null;
  pixKey: string | null;
  code: string | null;
  status: AffiliateStatus;
  commissionPct: number;
  discountPct: number;
  shopifyDiscountId: string | null;
  shopifyError: string | null;
  notes: string | null;
  accessToken: string;
  createdAt: string;
  approvedAt: string | null;
};

function mapAffiliate(row: any): AffiliateRow {
  return {
    id: row.id,
    name: row.name,
    whatsapp: row.whatsapp,
    email: row.email,
    instagram: row.instagram,
    tiktok: row.tiktok,
    pixKey: row.pix_key,
    code: row.code,
    status: row.status,
    commissionPct: Number(row.commission_pct),
    discountPct: Number(row.discount_pct),
    shopifyDiscountId: row.shopify_discount_id,
    shopifyError: row.shopify_error,
    notes: row.notes,
    accessToken: row.access_token,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

async function loadAffiliates(): Promise<AffiliateRow[]> {
  const supabase = await db();
  const rows = await fetchAll<any>((from, to) => supabase.from("affiliates").select("*").order("created_at", { ascending: false }).order("id").range(from, to));
  return rows.map(mapAffiliate);
}

type OrderRow = {
  order_id: string;
  order_number: string | null;
  created_at: string;
  financial_status: string | null;
  cancelled_at: string | null;
  subtotal_price: number | null;
  email: string | null;
  phone: string | null;
  affiliate_id: string;
  code: string;
};

async function loadAffiliateOrders(affiliateId?: string): Promise<OrderRow[]> {
  const supabase = await db();
  return fetchAll<OrderRow>((from, to) => {
    let q = supabase.from("affiliate_orders").select("*");
    if (affiliateId) q = q.eq("affiliate_id", affiliateId);
    return q.order("created_at", { ascending: false }).order("order_id").range(from, to);
  });
}

async function loadPaidOrderIds(): Promise<Set<string>> {
  const supabase = await db();
  const rows = await fetchAll<{ order_id: string }>((from, to) => supabase.from("affiliate_payout_orders").select("order_id").order("order_id").range(from, to));
  return new Set(rows.map((r) => r.order_id));
}

export type AffiliateSaleRow = {
  orderId: string;
  orderNumber: string | null;
  createdAt: string;
  affiliateId: string;
  affiliateName: string;
  code: string;
  financialStatus: string | null;
  base: number;
  commission: number;
  status: CommissionStatus;
  needsReview: boolean;
};

async function classifyAll(affiliates: AffiliateRow[], orders: OrderRow[], settings: AffiliateSettings) {
  const paid = await loadPaidOrderIds();
  const byId = new Map(affiliates.map((a) => [a.id, a]));
  const rules = { holdDays: settings.holdDays, windowStart: settings.windowStart, windowEnd: settings.windowEnd };
  const sales: AffiliateSaleRow[] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    const affiliate = byId.get(o.affiliate_id);
    if (!affiliate) continue;
    const key = `${o.order_id}|${o.affiliate_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const classified: ClassifiedOrder = classifyAffiliateOrder(
      {
        orderId: o.order_id,
        createdAt: o.created_at,
        financialStatus: o.financial_status,
        cancelledAt: o.cancelled_at,
        subtotal: Number(o.subtotal_price ?? 0),
        customerEmail: o.email,
        customerPhone: o.phone,
      },
      { commissionPct: affiliate.commissionPct, whatsapp: affiliate.whatsapp, email: affiliate.email },
      rules,
      paid.has(o.order_id),
    );
    sales.push({
      orderId: o.order_id,
      orderNumber: o.order_number,
      createdAt: o.created_at,
      affiliateId: affiliate.id,
      affiliateName: affiliate.name,
      code: o.code,
      financialStatus: o.financial_status,
      base: classified.base,
      commission: classified.commission,
      status: classified.status,
      needsReview: classified.needsReview,
    });
  }
  return sales;
}

function totalsOf(sales: AffiliateSaleRow[]) {
  const totals = emptyTotals();
  for (const s of sales) addToTotals(totals, { status: s.status, base: s.base, commission: s.commission, needsReview: s.needsReview });
  const counted = sales.filter((s) => s.status === "pending" || s.status === "approved" || s.status === "paid");
  return {
    totals,
    orders: counted.length,
    revenue: round2(counted.reduce((sum, s) => sum + s.base, 0)),
  };
}

// ---------------------------------------------------------------------------------------------
// Admin

export async function listAffiliates() {
  const [affiliates, settings] = await Promise.all([loadAffiliates(), getAffiliateSettings()]);
  const orders = await loadAffiliateOrders();
  const sales = await classifyAll(affiliates, orders, settings);
  const byAffiliate = new Map<string, AffiliateSaleRow[]>();
  for (const s of sales) {
    const list = byAffiliate.get(s.affiliateId) ?? [];
    list.push(s);
    byAffiliate.set(s.affiliateId, list);
  }
  const rows = affiliates.map((a) => {
    const summary = totalsOf(byAffiliate.get(a.id) ?? []);
    return {
      ...a,
      orders: summary.orders,
      revenue: summary.revenue,
      commissionPending: summary.totals.pending.commission,
      commissionApproved: summary.totals.approved.commission,
      commissionPaid: summary.totals.paid.commission,
    };
  });
  const overall = totalsOf(sales);
  const { getShopifyStoreUrl } = await import("./shopify.server");
  return {
    affiliates: rows,
    storeUrl: await getShopifyStoreUrl(),
    summary: {
      affiliates: affiliates.length,
      approved: affiliates.filter((a) => a.status === "approved").length,
      pending: affiliates.filter((a) => a.status === "pending").length,
      orders: overall.orders,
      revenue: overall.revenue,
      commissionPending: overall.totals.pending.commission,
      commissionApproved: overall.totals.approved.commission,
      commissionPaid: overall.totals.paid.commission,
    },
  };
}

export async function getAffiliateSales(input: { affiliateId?: string | null; status?: CommissionStatus | null }) {
  const [affiliates, settings] = await Promise.all([loadAffiliates(), getAffiliateSettings()]);
  const orders = await loadAffiliateOrders(input.affiliateId ?? undefined);
  let sales = await classifyAll(affiliates, orders, settings);
  if (input.status) sales = sales.filter((s) => s.status === input.status);
  return { sales: sales.slice(0, 2000), total: sales.length };
}

export async function updateAffiliate(
  id: string,
  input: { name: string; email: string | null; instagram: string | null; tiktok: string | null; pixKey: string | null; commissionPct: number; notes: string | null },
) {
  const supabase = await db();
  const { error } = await supabase
    .from("affiliates")
    .update({
      name: input.name.trim(),
      email: input.email?.trim() || null,
      instagram: input.instagram?.trim() || null,
      tiktok: input.tiktok?.trim() || null,
      pix_key: input.pixKey?.trim() || null,
      commission_pct: input.commissionPct,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true as const };
}

export async function setAffiliateStatus(id: string, status: "pending" | "rejected" | "blocked") {
  const supabase = await db();
  const { error } = await supabase.from("affiliates").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  return { success: true as const };
}

const TAKEN_PATTERN = /unique|taken|already|exist|j[aá] (est[aá]|foi|existe)|em uso/i;

async function createCoupon(code: string, name: string, discountPct: number, settings: AffiliateSettings) {
  const { createShopifyDiscountCodeBasic } = await import("./shopify.server");
  const now = new Date();
  const endsAt = settings.windowEnd ? new Date(settings.windowEnd) : new Date(now.getTime() + 365 * 86_400_000);
  return createShopifyDiscountCodeBasic({
    title: `Afiliada ${name} (${code})`,
    code,
    percentageFraction: discountPct / 100,
    startsAt: now.toISOString(),
    endsAt: (endsAt.getTime() > now.getTime() ? endsAt : new Date(now.getTime() + 365 * 86_400_000)).toISOString(),
    appliesOncePerCustomer: false,
  });
}

/** Aprova a afiliada: gera o cupom exclusivo, cria na Shopify (se falhar, guarda o motivo para tentar de novo). */
export async function approveAffiliate(id: string, opts: { commissionPct?: number | undefined; discountPct?: number | undefined; code?: string | null | undefined }) {
  const supabase = await db();
  const settings = await getAffiliateSettings();
  const { data: row, error } = await supabase.from("affiliates").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Afiliada não encontrada.");
  const affiliate = mapAffiliate(row);

  const commissionPct = opts.commissionPct ?? affiliate.commissionPct ?? settings.commissionPct;
  const discountPct = opts.discountPct ?? (affiliate.code ? affiliate.discountPct : settings.discountPct);

  const { data: codes } = await supabase.from("affiliates").select("code").not("code", "is", null).neq("id", id);
  const taken = new Set<string>(((codes ?? []) as { code: string }[]).map((c) => c.code.toUpperCase()));

  let code = affiliate.code;
  let discountId = affiliate.shopifyDiscountId;
  let shopifyError: string | null = null;

  if (code && discountId) {
    // Já aprovada antes e com cupom na Shopify: só atualiza comissão (o desconto do cupom não muda).
  } else {
    const wanted = opts.code?.trim().toUpperCase() || null;
    if (wanted && !isValidAffiliateCode(wanted)) throw new Error("Código inválido: use de 3 a 20 letras ou números, sem espaço.");
    if (wanted && taken.has(wanted)) throw new Error(`O código ${wanted} já pertence a outra afiliada.`);
    code = code ?? wanted ?? pickAffiliateCode(affiliate.name, taken);

    for (let attempt = 0; attempt < 6; attempt++) {
      const result = await createCoupon(code, affiliate.name, discountPct, settings);
      if (result.success) {
        discountId = result.discountId;
        shopifyError = null;
        break;
      }
      shopifyError = result.error;
      // Código já usado na loja (por outro cupom): com código automático, tenta o próximo.
      if (wanted || !TAKEN_PATTERN.test(result.error)) break;
      taken.add(code);
      code = pickAffiliateCode(affiliate.name, taken);
    }
  }

  const { error: updateError } = await supabase
    .from("affiliates")
    .update({
      status: "approved",
      code,
      commission_pct: commissionPct,
      discount_pct: discountPct,
      shopify_discount_id: discountId,
      shopify_error: shopifyError,
      approved_at: affiliate.approvedAt ?? new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);
  return { code: code as string, couponCreated: Boolean(discountId), shopifyError };
}

export async function retryAffiliateCoupon(id: string) {
  const supabase = await db();
  const settings = await getAffiliateSettings();
  const { data: row, error } = await supabase.from("affiliates").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.code) throw new Error("Aprove a afiliada antes de criar o cupom.");
  const affiliate = mapAffiliate(row);
  const result = await createCoupon(affiliate.code as string, affiliate.name, affiliate.discountPct, settings);
  const { error: updateError } = await supabase
    .from("affiliates")
    .update({ shopify_discount_id: result.success ? result.discountId : null, shopify_error: result.success ? null : result.error })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);
  return result.success ? { success: true as const } : { success: false as const, error: result.error };
}

// ---------------------------------------------------------------------------------------------
// Pagamentos

export async function getPayoutsOverview() {
  const supabase = await db();
  const [affiliates, settings] = await Promise.all([loadAffiliates(), getAffiliateSettings()]);
  const orders = await loadAffiliateOrders();
  const sales = await classifyAll(affiliates, orders, settings);
  const toPay = affiliates
    .map((a) => {
      const approved = sales.filter((s) => s.affiliateId === a.id && s.status === "approved");
      return {
        affiliateId: a.id,
        name: a.name,
        whatsapp: a.whatsapp,
        pixKey: a.pixKey,
        status: a.status,
        orders: approved.length,
        amount: round2(approved.reduce((sum, s) => sum + s.commission, 0)),
        needsReview: approved.some((s) => s.needsReview),
      };
    })
    .filter((r) => r.orders > 0)
    .sort((a, b) => b.amount - a.amount);

  const { data: history, error } = await supabase.from("affiliate_payouts").select("id, affiliate_id, amount, note, paid_at").order("paid_at", { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  const nameById = new Map(affiliates.map((a) => [a.id, a.name]));
  return {
    toPay,
    history: ((history ?? []) as any[]).map((h) => ({
      id: h.id as string,
      affiliateName: nameById.get(h.affiliate_id) ?? "—",
      amount: Number(h.amount),
      note: (h.note as string | null) ?? null,
      paidAt: h.paid_at as string,
    })),
  };
}

/** Marca como paga toda a comissão aprovada da afiliada (cada pedido só pode ser pago uma vez). */
export async function registerAffiliatePayout(affiliateId: string, note: string | null) {
  const supabase = await db();
  const [affiliates, settings] = await Promise.all([loadAffiliates(), getAffiliateSettings()]);
  const affiliate = affiliates.find((a) => a.id === affiliateId);
  if (!affiliate) throw new Error("Afiliada não encontrada.");
  if (affiliate.status !== "approved") throw new Error("Só é possível pagar afiliadas aprovadas.");

  const orders = await loadAffiliateOrders(affiliateId);
  const sales = (await classifyAll([affiliate], orders, settings)).filter((s) => s.status === "approved");
  if (sales.length === 0) throw new Error("Não há comissão aprovada a pagar para essa afiliada.");
  const amount = round2(sales.reduce((sum, s) => sum + s.commission, 0));
  if (amount <= 0) throw new Error("O valor a pagar é zero.");

  const { data: payout, error } = await supabase.from("affiliate_payouts").insert({ affiliate_id: affiliateId, amount, note: note?.trim() || null }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: linkError } = await supabase.from("affiliate_payout_orders").insert(
    sales.map((s) => ({ order_id: s.orderId, payout_id: payout.id, affiliate_id: affiliateId, commission: s.commission })),
  );
  if (linkError) {
    await supabase.from("affiliate_payouts").delete().eq("id", payout.id);
    throw new Error(`Não foi possível registrar o pagamento (algum pedido já foi pago): ${linkError.message}`);
  }
  return { amount, orders: sales.length };
}

// ---------------------------------------------------------------------------------------------
// Cadastro público

function cleanHandle(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const fromUrl = raw.replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\//i, "").replace(/[/?#].*$/, "");
  const handle = fromUrl.replace(/^@+/, "").trim();
  return /^[A-Za-z0-9._]{2,40}$/.test(handle) ? handle : null;
}

export function normalizeAffiliatePhone(value: string): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  return `55${digits}`;
}

export type AffiliateSignupInput = {
  name: string;
  whatsapp: string;
  email: string | null;
  instagram: string | null;
  tiktok: string | null;
  pixKey: string | null;
};

export async function registerAffiliate(input: AffiliateSignupInput): Promise<{ success: true } | { success: false; error: string }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { success: false, error: "Informe seu nome." };
  const whatsapp = normalizeAffiliatePhone(input.whatsapp);
  if (!whatsapp) return { success: false, error: "Informe um WhatsApp válido com DDD." };
  const instagram = cleanHandle(input.instagram);
  const tiktok = cleanHandle(input.tiktok);
  if (input.instagram?.trim() && !instagram) return { success: false, error: "O @ do Instagram parece inválido." };
  if (input.tiktok?.trim() && !tiktok) return { success: false, error: "O @ do TikTok parece inválido." };
  if (!instagram && !tiktok) return { success: false, error: "Informe pelo menos o seu Instagram ou TikTok." };
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: "E-mail inválido." };

  const supabase = await db();
  const settings = await getAffiliateSettings();
  const { error } = await supabase.from("affiliates").insert({
    name,
    whatsapp,
    email,
    instagram,
    tiktok,
    pix_key: input.pixKey?.trim().slice(0, 120) || null,
    commission_pct: settings.commissionPct,
    discount_pct: settings.discountPct,
  });
  // Já cadastrada (mesmo WhatsApp): responde igual, sem revelar quem já está na base.
  if (error && error.code !== "23505") throw new Error(error.message);
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Painel da afiliada (link privado)

export async function getAffiliatePortal(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const supabase = await db();
  const { data: row, error } = await supabase.from("affiliates").select("*").eq("access_token", token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const affiliate = mapAffiliate(row);
  const settings = await getAffiliateSettings();
  const { getShopifyStoreUrl } = await import("./shopify.server");
  const storeUrl = await getShopifyStoreUrl();

  const base = { name: affiliate.name.split(" ")[0] ?? affiliate.name, status: affiliate.status, storeUrl };
  if (affiliate.status !== "approved" || !affiliate.code) return { ...base, approved: false as const };

  const sales = await classifyAll([affiliate], await loadAffiliateOrders(affiliate.id), settings);
  const summary = totalsOf(sales);
  const { data: posts } = await supabase.from("affiliate_posts").select("id, url, created_at").eq("affiliate_id", affiliate.id).order("created_at", { ascending: false }).limit(50);
  return {
    ...base,
    approved: true as const,
    code: affiliate.code,
    commissionPct: affiliate.commissionPct,
    discountPct: affiliate.discountPct,
    holdDays: settings.holdDays,
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    orders: summary.orders,
    revenue: summary.revenue,
    commissionPending: summary.totals.pending.commission,
    commissionApproved: summary.totals.approved.commission,
    commissionPaid: summary.totals.paid.commission,
    // Só dados do pedido, nunca do cliente.
    sales: sales
      .filter((s) => s.status !== "outside_window" && s.status !== "self_purchase")
      .slice(0, 100)
      .map((s) => ({ orderNumber: s.orderNumber, createdAt: s.createdAt, base: s.base, commission: s.commission, status: s.status })),
    posts: ((posts ?? []) as any[]).map((p) => ({ id: p.id as string, url: p.url as string, createdAt: p.created_at as string })),
  };
}

export async function addAffiliatePost(token: string, url: string): Promise<{ success: true } | { success: false; error: string }> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { success: false, error: "Link inválido." };
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { success: false, error: "Cole o link completo da postagem (começando com https://)." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { success: false, error: "Link inválido." };
  const supabase = await db();
  const { data: row } = await supabase.from("affiliates").select("id, status").eq("access_token", token).maybeSingle();
  if (!row || row.status !== "approved") return { success: false, error: "Link inválido." };
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase.from("affiliate_posts").select("id", { count: "exact", head: true }).eq("affiliate_id", row.id).gte("created_at", since);
  if ((count ?? 0) >= 20) return { success: false, error: "Limite de 20 postagens por dia." };
  const { error } = await supabase.from("affiliate_posts").insert({ affiliate_id: row.id, url: parsed.toString().slice(0, 500) });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function listAffiliatePosts(affiliateId: string) {
  const supabase = await db();
  const { data, error } = await supabase.from("affiliate_posts").select("id, url, created_at").eq("affiliate_id", affiliateId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((p) => ({ id: p.id as string, url: p.url as string, createdAt: p.created_at as string }));
}
