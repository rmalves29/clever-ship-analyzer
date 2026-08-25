export type TemplateVariableValidation = {
  valid: boolean;
  indexes: number[];
  error?: string;
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

/** Monta o objeto de exemplo exigido pela Meta quando o BODY possui variáveis. */
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

/** Substitui as variáveis apenas para a prévia visual do editor. */
export function renderTemplateVariablePreview(text: string, examples: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (token, rawIndex: string) => {
    const index = Number(rawIndex) - 1;
    const value = examples[index]?.trim();
    return value || token;
  });
}
