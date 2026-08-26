import { describe, expect, it } from "vitest";
import {
  appendTemplateTokenAtIndex,
  buildBodyVariableExample,
  extractTemplateVariableIndexes,
  renderTemplateVariablePreview,
  validateTemplateVariables,
} from "./whatsapp-template-variables";

describe("whatsapp template variables", () => {
  it("extrai variáveis posicionais únicas e ordenadas", () => {
    expect(extractTemplateVariableIndexes("Oi {{2}}, pedido {{1}} / {{2}}" )).toEqual([1, 2]);
  });

  it("exige numeração sequencial a partir de 1", () => {
    expect(validateTemplateVariables("Oi {{1}} {{3}}" )).toMatchObject({ valid: false, indexes: [1, 3] });
    expect(validateTemplateVariables("Oi {{1}} {{2}}" )).toEqual({ valid: true, indexes: [1, 2] });
  });

  it("gera body_text com uma linha de exemplos na ordem das variáveis", () => {
    expect(buildBodyVariableExample("Oi {{1}}, pedido {{2}}", ["Maria", "#1548"])).toEqual({
      success: true,
      example: { body_text: [["Maria", "#1548"]] },
    });
  });

  it("bloqueia template com variável sem exemplo", () => {
    expect(buildBodyVariableExample("Oi {{1}}, pedido {{2}}", ["Maria", ""])).toMatchObject({ success: false });
  });

  it("renderiza a prévia com os exemplos sem alterar placeholders sem exemplo", () => {
    expect(renderTemplateVariablePreview("Oi {{1}}, pedido {{2}}", ["Maria", ""])).toBe("Oi Maria, pedido {{2}}");
  });

  it("insere token somente no índice que está sendo editado", () => {
    expect(appendTemplateTokenAtIndex(["{{NOME_CLIENTE}}", "Pedido "], 1, "{{NUMERO_PEDIDO}}")).toEqual([
      "{{NOME_CLIENTE}}",
      "Pedido {{NUMERO_PEDIDO}}",
    ]);
  });

  it("preenche índices intermediários quando necessário", () => {
    expect(appendTemplateTokenAtIndex([], 2, "{{VALOR_TOTAL}}")).toEqual(["", "", "{{VALOR_TOTAL}}"]);
  });
});
