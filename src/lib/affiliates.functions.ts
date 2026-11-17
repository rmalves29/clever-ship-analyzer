import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const idSchema = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------------------------
// Admin (exige login quando o login do CRM está ligado)

export const getAffiliateSettingsFn = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getAffiliateSettings } = await import("./affiliates.server");
    return getAffiliateSettings();
  });

export const saveAffiliateSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        holdDays: z.number().int().min(0).max(90),
        adsAuthorizationDays: z.number().int().min(1).max(90),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { saveAffiliateSettings } = await import("./affiliates.server");
    return saveAffiliateSettings(data);
  });

export const listAffiliateCampaignsFn = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { listAffiliateCampaigns } = await import("./affiliates.server");
    return listAffiliateCampaigns();
  });

export const saveAffiliateCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(80),
        commissionPct: z.number().min(0).max(100),
        discountPct: z.number().min(1).max(100),
        salesStart: z.string().datetime().nullable(),
        salesEnd: z.string().datetime().nullable(),
        isActive: z.boolean(),
      })
      .refine((v) => !v.salesStart || !v.salesEnd || v.salesStart < v.salesEnd, "A data final das vendas precisa ser depois da inicial.")
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { saveAffiliateCampaign } = await import("./affiliates.server");
    return saveAffiliateCampaign(data);
  });

export const listAffiliatesFn = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { listAffiliates } = await import("./affiliates.server");
    return listAffiliates();
  });

export const getAffiliateSalesFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        affiliateId: z.string().uuid().nullish(),
        status: z.enum(["approved", "pending", "paid", "void", "unpaid", "outside_window", "self_purchase"]).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getAffiliateSales } = await import("./affiliates.server");
    return getAffiliateSales({ affiliateId: data.affiliateId ?? null, status: data.status ?? null });
  });

export const approveAffiliateFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    idSchema
      .extend({
        commissionPct: z.number().min(0).max(100).optional(),
        discountPct: z.number().min(1).max(100).optional(),
        code: z.string().max(20).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { approveAffiliate } = await import("./affiliates.server");
    return approveAffiliate(data.id, { commissionPct: data.commissionPct, discountPct: data.discountPct, code: data.code ?? null });
  });

export const retryAffiliateCouponFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { retryAffiliateCoupon } = await import("./affiliates.server");
    return retryAffiliateCoupon(data.id);
  });

export const setAffiliateStatusFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => idSchema.extend({ status: z.enum(["pending", "rejected", "blocked"]) }).parse(data))
  .handler(async ({ data }) => {
    const { setAffiliateStatus } = await import("./affiliates.server");
    return setAffiliateStatus(data.id, data.status);
  });

export const updateAffiliateFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    idSchema
      .extend({
        name: z.string().min(2).max(80),
        email: z.string().email().nullable(),
        instagram: z.string().max(60).nullable(),
        tiktok: z.string().max(60).nullable(),
        pixKey: z.string().max(120).nullable(),
        commissionPct: z.number().min(0).max(100),
        notes: z.string().max(1000).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { updateAffiliate } = await import("./affiliates.server");
    const { id, ...rest } = data;
    return updateAffiliate(id, rest);
  });

export const listAffiliatePostsFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { listAffiliatePosts } = await import("./affiliates.server");
    return listAffiliatePosts(data.id);
  });

export const getPayoutsOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getPayoutsOverview } = await import("./affiliates.server");
    return getPayoutsOverview();
  });

export const registerAffiliatePayoutFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ affiliateId: z.string().uuid(), note: z.string().max(300).nullable() }).parse(data))
  .handler(async ({ data }) => {
    const { registerAffiliatePayout } = await import("./affiliates.server");
    return registerAffiliatePayout(data.affiliateId, data.note);
  });

// ---------------------------------------------------------------------------------------------
// Públicas (cadastro e painel da afiliada): limite por IP, sem login

async function limitByIp(bucket: string, limit: number, windowSec: number) {
  const { clientIp, rateLimit } = await import("./rate-limit.server");
  const ip = clientIp(getRequest());
  const result = await rateLimit({ key: `${bucket}:${ip}`, limit, windowSec });
  if (!result.allowed) throw new Error("Muitas tentativas. Tente de novo em alguns minutos.");
}

export const submitAffiliateSignupFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().min(2).max(80),
        whatsapp: z.string().min(8).max(25),
        email: z.string().max(120).nullable(),
        instagram: z.string().max(80).nullable(),
        tiktok: z.string().max(80).nullable(),
        pixKey: z.string().max(120).nullable(),
        acceptTerms: z.literal(true),
        acceptAds: z.literal(true),
        // Campo escondido: robô preenche, pessoa não.
        website: z.string().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // Robô: finge sucesso e não grava nada.
    if (data.website && data.website.trim()) return { success: true as const };
    await limitByIp("affiliate-signup", 5, 3600);
    const { registerAffiliate } = await import("./affiliates.server");
    const { acceptTerms: _terms, website: _website, ...input } = data;
    return registerAffiliate(input);
  });

export const getAffiliatePortalFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().min(10).max(100) }).parse(data))
  .handler(async ({ data }) => {
    await limitByIp("affiliate-portal", 60, 600);
    const { getAffiliatePortal } = await import("./affiliates.server");
    return getAffiliatePortal(data.token);
  });

export const addAffiliatePostFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().min(10).max(100), url: z.string().min(8).max(500) }).parse(data))
  .handler(async ({ data }) => {
    await limitByIp("affiliate-post", 30, 600);
    const { addAffiliatePost } = await import("./affiliates.server");
    return addAffiliatePost(data.token, data.url);
  });

/** Regras que aparecem na página pública de cadastro (sem dados de ninguém). */
export const getAffiliateProgramFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getAffiliateProgram } = await import("./affiliates.server");
  return getAffiliateProgram();
});
