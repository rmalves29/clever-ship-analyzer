import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const listPopupCampaigns = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("popup_campaigns" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

const popupCampaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  is_active: z.boolean(),
  collect_name: z.boolean(),
  headline: z.string().min(1),
  body_text: z.string().min(1),
  button_text: z.string().min(1),
  image_url: z.string().url().nullable().optional(),
  trigger_time_seconds: z.number().int().positive().nullable(),
  trigger_exit_intent: z.boolean(),
  reshow_mode: z.enum(["once_ever", "after_days"]),
  reshow_after_days: z.number().int().positive().nullable(),
  coupon_mode: z.enum(["none", "fixed", "unique"]),
  fixed_coupon_code: z.string().nullable().optional(),
  discount_type: z.enum(["percentage", "fixed_amount"]).nullable().optional(),
  discount_value: z.number().positive().nullable().optional(),
  discount_expires_days: z.number().int().positive().nullable().optional(),
  template_id: z.string().nullable().optional(),
  template_name: z.string().nullable().optional(),
  template_language: z.string().nullable().optional(),
  template_var_mapping: z.record(z.string(), z.string()).optional(),
});

export const savePopupCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => popupCampaignSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const payload = { ...rest, updated_at: new Date().toISOString() };

    if (id) {
      const { error } = await (supabaseAdmin.from("popup_campaigns" as any) as any).update(payload).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: created, error } = await (supabaseAdmin.from("popup_campaigns" as any) as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (created as { id: string }).id };
  });

export const togglePopupCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("popup_campaigns" as any) as any)
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const deletePopupCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("popup_campaigns" as any).delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const listPopupLeads = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.from("popup_leads" as any) as any)
      .select("id, phone, name, coupon_code, first_captured_at, last_captured_at, last_visit_at, popup_campaign_id, popup_campaigns(name)")
      .order("last_captured_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data;
  });

/** Snippet pronto pra colar no theme.liquid + quando foi a última visita registrada, pra o
 *  usuário confirmar sozinho que o snippet está ativo no site. */
export const getPopupInstallInfo = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderPopupLoaderScript } = await import("./popup.server");

    const { data: lastVisit } = await supabaseAdmin
      .from("site_visits" as any)
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      script: renderPopupLoaderScript(),
      lastVisitAt: (lastVisit as { created_at: string } | null)?.created_at ?? null,
    };
  });
