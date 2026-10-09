import type { z } from "zod";

export const NO_OPENAI_KEY = "Nenhuma API key da OpenAI configurada em Configurações.";

/** Chave da OpenAI salva em Configurações (mesma usada pelas análises de IA do CRM). */
export async function loadOpenAiKey(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("openai_api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { openai_api_key?: string | null } | null)?.openai_api_key ?? null;
}

export type OpenAiJsonOptions<T> = {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  temperature?: number;
  maxTokens?: number;
  /** Tentativas extras quando a resposta não é um JSON válido para o esquema. */
  retries?: number;
};

/** Chama o Chat Completions pedindo JSON e valida a resposta com o esquema. */
export async function callOpenAiJson<T>(options: OpenAiJsonOptions<T>): Promise<T> {
  const { apiKey, model = "gpt-4o-mini", system, user, schema, temperature = 0.2, maxTokens, retries = 1 } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const error = new Error(`OpenAI respondeu ${res.status}: ${body.slice(0, 300)}`);
        // Erros de credencial, cota ou pedido inválido não melhoram tentando de novo.
        if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) throw Object.assign(error, { fatal: true });
        throw error;
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI não retornou conteúdo.");
      return schema.parse(JSON.parse(content));
    } catch (error) {
      lastError = error;
      if ((error as { fatal?: boolean })?.fatal) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha ao chamar a OpenAI.");
}
