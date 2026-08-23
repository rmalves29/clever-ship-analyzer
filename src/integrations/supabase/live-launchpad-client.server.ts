// Server-side Supabase client para o projeto live-launchpad-79 (OrderZaps) — usado só pelo
// módulo Fluxo de Envio, que passou a ler/escrever os mesmos grupos/campanhas de lá em vez de
// manter sua própria cópia. Ver nota do vault "Fluxo de Envio vs SendFlow" pro histórico.
//
// A conexão (URL + service role key) fica em store_settings, não como secret de build — este
// projeto está no plano Pro do Lovable, sem acesso a "Segredos de compilação" (Enterprise).
// Configurável em Configurações → Live Launchpad (Fluxo de Envio).
// SECURITY: nunca importar isso fora de arquivos *.server.ts — nunca expor ao client bundle.
import { createClient } from "@supabase/supabase-js";

export const MANIA_DE_MULHER_TENANT_ID = "08f2b1b9-3988-489e-8186-c60f0c0b0622";

type LiveLaunchpadDatabase = {
  public: {
    Tables: {
      fe_groups: {
        Row: {
          id: string;
          tenant_id: string;
          group_jid: string;
          group_name: string;
          invite_link: string | null;
          participant_count: number;
          max_participants: number;
          is_entry_open: boolean;
          is_active: boolean;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<LiveLaunchpadDatabase["public"]["Tables"]["fe_groups"]["Row"]>;
        Update: Partial<LiveLaunchpadDatabase["public"]["Tables"]["fe_groups"]["Row"]>;
      };
      fe_campaigns: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          slug: string;
          description: string | null;
          is_entry_open: boolean;
          is_active: boolean;
          facebook_pixel_id: string | null;
          auto_spawn_enabled: boolean;
          spawn_margin: number;
          group_template: unknown;
          last_spawn_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<LiveLaunchpadDatabase["public"]["Tables"]["fe_campaigns"]["Row"]>;
        Update: Partial<LiveLaunchpadDatabase["public"]["Tables"]["fe_campaigns"]["Row"]>;
      };
      fe_campaign_groups: {
        Row: {
          id: string;
          campaign_id: string;
          group_id: string;
          sort_order: number;
          weight_percent: number | null;
          created_at: string;
        };
        Insert: Partial<LiveLaunchpadDatabase["public"]["Tables"]["fe_campaign_groups"]["Row"]>;
        Update: Partial<LiveLaunchpadDatabase["public"]["Tables"]["fe_campaign_groups"]["Row"]>;
      };
    };
  };
};

/** Carrega a conexão salva em store_settings e cria um client novo — é uma tabela local pequena,
 *  então o custo de reconsultar a cada chamada é desprezível, e evita cache de credencial velha
 *  logo depois que o usuário salva uma nova chave em Configurações. */
export async function getLiveLaunchpadAdmin() {
  const { supabaseAdmin } = await import("./client.server");
  const { data } = await (supabaseAdmin.from("store_settings") as any)
    .select("live_launchpad_supabase_url, live_launchpad_supabase_service_role_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const url = (data as any)?.live_launchpad_supabase_url as string | undefined;
  const key = (data as any)?.live_launchpad_supabase_service_role_key as string | undefined;

  if (!url || !key) {
    throw new Error("Conexão com o live-launchpad-79 não configurada. Adicione em Configurações → Live Launchpad (Fluxo de Envio).");
  }

  return createClient<LiveLaunchpadDatabase>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
