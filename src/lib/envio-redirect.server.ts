async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type WaitUntil = (promise: Promise<unknown>) => void;

const NOT_FOUND_HTML = "<html><body><h1>Link inválido</h1></body></html>";
const CLOSED_HTML = "<html><body><h1>Essa campanha não está aceitando novos participantes agora.</h1></body></html>";
const FULL_HTML = "<html><body><h1>😔 Grupos lotados</h1><p>Tente novamente mais tarde.</p></body></html>";

function htmlResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`envio-ip-salt:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function pickWeighted<T extends { weight: number }>(candidates: T[]): T {
  const totalWeight = candidates.reduce((acc, c) => acc + c.weight, 0);
  if (totalWeight <= 0) {
    // Fallback: menos cheio primeiro (mesmo comportamento do original quando todos os pesos são 0).
    return candidates.reduce((min, c) => (c as any).participant_count < (min as any).participant_count ? c : min);
  }
  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return candidates[candidates.length - 1]!;
}

export async function handleEnvioCampaignRedirect(slug: string, request: Request, waitUntil: WaitUntil): Promise<Response> {
  const supabaseAdmin = await admin();

  const { data: campaign } = await (supabaseAdmin.from("envio_campaigns" as any) as any).select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (!campaign) return htmlResponse(NOT_FOUND_HTML, 404);
  const c = campaign as any;
  if (!c.is_entry_open) return htmlResponse(CLOSED_HTML, 403);

  const { data: links } = await (supabaseAdmin
    .from("envio_campaign_groups" as any) as any)
    .select("group_id, weight_percent, envio_groups!inner(id, group_name, invite_link, participant_count, max_participants, is_active, is_entry_open)")
    .eq("campaign_id", c.id);

  const allGroups = ((links ?? []) as any[]).map((l) => ({ ...l.envio_groups, weight_percent: l.weight_percent }));

  const available = allGroups.filter(
    (g) => g.is_active && g.is_entry_open && g.invite_link && (!g.max_participants || g.participant_count < g.max_participants),
  );

  if (available.length === 0) return htmlResponse(FULL_HTML, 200);

  const hasExplicitWeight = available.some((g) => g.weight_percent != null && Number.isFinite(g.weight_percent));
  const candidates = available.map((g) => ({ ...g, weight: hasExplicitWeight ? (g.weight_percent ?? 0) : 1 }));
  const selected = pickWeighted(candidates);

  if (c.auto_spawn_enabled) {
    const remainingSlots = available.reduce((acc, g) => acc + (g.max_participants ? Math.max(0, g.max_participants - g.participant_count) : 0), 0);
    if (remainingSlots <= (c.spawn_margin ?? 3)) {
      waitUntil(
        import("./envio-campaigns.server")
          .then(({ spawnGroupForCampaign }) => spawnGroupForCampaign(c.id))
          .catch((error) => console.error("Auto-spawn (fire-and-forget) falhou:", error)),
      );
    }
  }

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 500);

  waitUntil(
    (async () => {
      const ipHash = await hashIp(ip);
      await Promise.all([
        (supabaseAdmin.from("envio_link_clicks" as any) as any).insert({
          campaign_id: c.id,
          ip_hash: ipHash,
          user_agent: userAgent,
          redirected_group_id: selected.id,
        } as never),
        (supabaseAdmin
          .from("envio_groups" as any) as any)
          .update({ participant_count: selected.participant_count + 1 } as never)
          .eq("id", selected.id),
      ]);
    })().catch((error) => console.error("Registro de clique (fire-and-forget) falhou:", error)),
  );

  if (c.facebook_pixel_id) {
    waitUntil(
      fetch(
        `https://www.facebook.com/tr/?id=${encodeURIComponent(c.facebook_pixel_id)}&ev=Lead&noscript=1&cd[content_name]=${encodeURIComponent(selected.group_name)}`,
        { headers: { "user-agent": userAgent, "x-forwarded-for": ip } },
      ).catch((error) => console.error("Pixel FB (fire-and-forget) falhou:", error)),
    );
  }

  // 302 direto, sem HTML intermediário — navegadores in-app (WhatsApp/Instagram) renderizam
  // qualquer HTML de transição como texto puro em vez de seguir o redirect.
  return new Response(null, {
    status: 302,
    headers: { Location: selected.invite_link, "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
