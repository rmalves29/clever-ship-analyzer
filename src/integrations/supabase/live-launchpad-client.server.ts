// Server-side Supabase client for the live-launchpad-79 project (OrderZaps) — usado só pelo
// módulo Fluxo de Envio, que passou a ler/escrever os mesmos grupos/campanhas de lá em vez de
// manter sua própria cópia. Ver nota do vault "Fluxo de Envio vs SendFlow" pro histórico.
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

function createLiveLaunchpadAdminClient() {
  const URL = process.env["LIVE_LAUNCHPAD_SUPABASE_URL"];
  const SERVICE_ROLE_KEY = process.env["LIVE_LAUNCHPAD_SUPABASE_SERVICE_ROLE_KEY"];

  if (!URL || !SERVICE_ROLE_KEY) {
    const missing = [
      ...(!URL ? ["LIVE_LAUNCHPAD_SUPABASE_URL"] : []),
      ...(!SERVICE_ROLE_KEY ? ["LIVE_LAUNCHPAD_SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(`Missing secret(s): ${missing.join(", ")}. Adicione em Configurações do projeto no Lovable.`);
  }

  return createClient<LiveLaunchpadDatabase>(URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let _liveLaunchpadAdmin: ReturnType<typeof createLiveLaunchpadAdminClient> | undefined;

// Load inside server handlers: const { liveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
export const liveLaunchpadAdmin = new Proxy({} as ReturnType<typeof createLiveLaunchpadAdminClient>, {
  get(_, prop, receiver) {
    if (!_liveLaunchpadAdmin) _liveLaunchpadAdmin = createLiveLaunchpadAdminClient();
    return Reflect.get(_liveLaunchpadAdmin, prop, receiver);
  },
});
