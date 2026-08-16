import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const segmentSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  regras: z.any(),
});

export const getSegments = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("crm_segments").select("*").order("criado_em", { ascending: false });
  if (error) throw error;
  return data ?? [];
});

export const saveSegment = createServerFn({ method: "POST" })
  .validator((data: unknown) => segmentSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("crm_segments").insert(data as never);
    if (error) throw error;
    return { success: true };
  });

export const deleteSegment = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("crm_segments").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
