export type TemplateVariableValidation = {
  valid: boolean;
  indexes: number[];
  error?: string;
};

export type WhatsappTemplateParameterFormat = "NAMED" | "POSITIONAL";

export type WhatsappTemplateComponent = {
  type: string;
  text?: string;
  format?: string;
};

export type WhatsappTemplateVariable = {
  key: string;
  label: string;
  parameterName?: string;
  position: number;
};

/** Extrai os placeholders posicionais aceitos pela Meta ({{1}}, {{2}}, ...). */
export function extractTemplateVariableIndexes(text: string): number[] {
  const indexes = new Set<number>();
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    const index = Number(match[1]);
    if (Number.isInteger(index) && index > 0) indexes.add(index);
  }
  return [...indexes].sort((a, b) => a - b);
}

/**
 * A Meta espera variáveis posicionais sequenciais a partir de {{1}}.
 * Ex.: {{1}}, {{2}}, {{3}}. Não aceitamos começar em {{2}} nem deixar lacunas.
 */
export function validateTemplateVariables(text: string): TemplateVariableValidation {
  const indexes = extractTemplateVariableIndexes(text);
  for (let i = 0; i < indexes.length; i++) {
    const expected = i + 1;
    if (indexes[i] !== expected) {
      return {
        valid: false,
        indexes,
        error: `As variáveis precisam ser sequenciais. Use {{1}}, {{2}}, {{3}}... sem pular números.`,
      };
    }
  }
  return { valid: true, indexes };
}

/** Monta o objeto de exemplo exigido pela Meta quando o BODY possui variáveis posicionais. */
export function buildBodyVariableExample(text: string, examples: string[]) {
  const validation = validateTemplateVariables(text);
  if (!validation.valid) return { success: false as const, error: validation.error ?? "Variáveis inválidas." };
  if (validation.indexes.length === 0) return { success: true as const, example: undefined };

  const normalized = validation.indexes.map((_, i) => examples[i]?.trim() ?? "");
  const missing = normalized.findIndex((value) => !value);
  if (missing >= 0) {
    return {
      success: false as const,
      error: `Informe um exemplo para a variável {{${missing + 1}}}. A Meta usa esses exemplos apenas na aprovação do template.`,
    };
  }

  return {
    success: true as const,
    example: { body_text: [normalized] },
  };
}

/** Substitui variáveis posicionais apenas para a prévia visual do editor de criação. */
export function renderTemplateVariablePreview(text: string, examples: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (token, rawIndex: string) => {
    const index = Number(rawIndex) - 1;
    const value = examples[index]?.trim();
    return value || token;
  });
}

/** Insere um token dinâmico exatamente no parâmetro que está sendo editado. */
export function appendTemplateTokenAtIndex(params: string[], index: number, token: string): string[] {
  const safeIndex = Math.max(0, Number.isInteger(index) ? index : 0);
  const next = [...params];
  while (next.length <= safeIndex) next.push("");
  next[safeIndex] = `${next[safeIndex] ?? ""}${token}`;
  return next;
}

function getBodyText(components: WhatsappTemplateComponent[] | undefined): string {
  return components?.find((component) => component.type === "BODY")?.text ?? "";
}

/**
 * Extrai variáveis do BODY tanto no formato antigo/posicional ({{1}}) quanto no formato
 * nomeado da Meta ({{primeiro_nome}}, {{id_pedido}}, ...), preservando a ordem visual.
 */
export function extractWhatsappBodyVariables(
  components: WhatsappTemplateComponent[] | undefined,
): WhatsappTemplateVariable[] {
  const text = getBodyText(components);
  if (!text) return [];

  const tokens = Array.from(text.matchAll(/\{\{([^{}]+)\}\}/g)).map((match) => String(match[1] ?? "").trim());
  const unique = Array.from(new Set(tokens)).filter(Boolean);
  const positional = unique.length > 0 && unique.every((token) => /^\d+$/.test(token));

  if (positional) {
    return unique
      .map((key) => ({ key, label: `{{${key}}}`, position: Number(key) - 1 }))
      .sort((a, b) => a.position - b.position);
  }

  return unique.map((key, index) => ({
    key,
    label: `{{${key}}}`,
    parameterName: key,
    position: index,
  }));
}

export function inferWhatsappTemplateParameterFormat(
  components: WhatsappTemplateComponent[] | undefined,
): WhatsappTemplateParameterFormat {
  const variables = extractWhatsappBodyVariables(components);
  if (variables.length === 0) return "POSITIONAL";
  return variables.every((variable) => /^\d+$/.test(variable.key)) ? "POSITIONAL" : "NAMED";
}

export function missingWhatsappTemplateVariableIndexes(
  variables: WhatsappTemplateVariable[],
  values: string[],
): number[] {
  return variables
    .map((_, index) => index)
    .filter((index) => !String(values[index] ?? "").trim());
}

/** Monta os parâmetros exatamente no formato esperado pelo endpoint /messages da Meta. */
export function buildMetaWhatsappBodyParameters(
  components: WhatsappTemplateComponent[] | undefined,
  values: string[],
): Array<{ type: "text"; text: string; parameter_name?: string }> {
  const variables = extractWhatsappBodyVariables(components);
  const format = inferWhatsappTemplateParameterFormat(components);

  return variables.map((variable, index) => ({
    type: "text" as const,
    text: String(values[index] ?? ""),
    ...(format === "NAMED" ? { parameter_name: variable.parameterName ?? variable.key } : {}),
  }));
}

export function renderWhatsappTemplateBodyPreview(
  components: WhatsappTemplateComponent[] | undefined,
  values: string[],
): string {
  const text = getBodyText(components);
  const variables = extractWhatsappBodyVariables(components);
  const byKey = new Map(variables.map((variable, index) => [variable.key, values[index] ?? variable.label]));
  return text.replace(/\{\{([^{}]+)\}\}/g, (token, rawKey) => byKey.get(String(rawKey).trim()) ?? token);
}

/** Sugestão automática de token do CRM baseada no nome que o template recebeu na Meta. */
export function suggestedWhatsappDynamicToken(variableKey: string): string | null {
  const key = variableKey.trim().toLowerCase();
  if (["primeiro_nome", "nome", "nome_cliente", "cliente"].includes(key)) return "{{NOME_CLIENTE}}";
  if (["id_pedido", "numero_pedido", "pedido", "order_id"].includes(key)) return "{{NUMERO_PEDIDO}}";
  if (["codigo_rastreio", "rastreio", "tracking_code"].includes(key)) return "{{RASTREIO}}";
  if (["produtos_no_pedido", "itens_comprados", "produtos", "itens"].includes(key)) return "{{ITENS_COMPRADOS}}";
  if (["valor_total", "valor_pedido", "total_pedido"].includes(key)) return "{{VALOR_TOTAL}}";
  if (["cupom", "cupom_desconto", "codigo_cupom"].includes(key)) return "{{CUPOM_DESCONTO}}";
  if (["frete", "forma_frete", "frete_escolhido"].includes(key)) return "{{FRETE_ESCOLHIDO}}";
  if (["link_checkout", "checkout_url"].includes(key)) return "{{LINK_CHECKOUT}}";
  return null;
}
