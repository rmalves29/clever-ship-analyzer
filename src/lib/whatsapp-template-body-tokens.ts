/** Extrai os tokens de variável do corpo de um template — suporta tanto o formato
 *  posicional clássico da Meta ({{1}}, {{2}}) quanto o formato com parâmetros
 *  nomeados ({{primeiro_nome}}), disponível pra templates criados direto no Meta
 *  Business Manager. Um mesmo template nunca mistura os dois formatos. */
export function extractTemplateBodyTokens(bodyText: string | null | undefined): string[] {
  if (!bodyText) return [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const match of bodyText.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    const token = match[1]!;
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

export function isNamedParameterToken(token: string | undefined): boolean {
  return Boolean(token) && !/^\d+$/.test(token!);
}

/** Monta os parâmetros de BODY no formato que a Meta espera — com "parameter_name"
 *  quando o template usa parâmetros nomeados; posicional (sem parameter_name) senão.
 *  Sem isso a Meta rejeita o envio pra templates de parâmetro nomeado (erro #132000). */
export function buildBodyParameters(
  bodyParams: string[],
  tokens: string[] | null | undefined,
): Array<{ type: "text"; text: string; parameter_name?: string }> {
  return bodyParams.map((text, i) => {
    const token = tokens?.[i];
    return isNamedParameterToken(token) ? { type: "text" as const, text, parameter_name: token! } : { type: "text" as const, text };
  });
}
