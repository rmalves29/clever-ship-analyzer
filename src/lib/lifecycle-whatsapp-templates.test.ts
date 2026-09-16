import { describe, expect, it } from "vitest";
import { validateTemplateVariables } from "./whatsapp-template-variables";
import {
  LIFECYCLE_TEMPLATE_DEFINITIONS,
  rfmTemplatesForSegment,
} from "./lifecycle-whatsapp-templates";

describe("modelos de ciclo de vida para a Meta", () => {
  it("possui 13 nomes únicos e compatíveis com a API", () => {
    const names = LIFECYCLE_TEMPLATE_DEFINITIONS.map((template) => template.name);
    expect(names).toHaveLength(13);
    expect(new Set(names).size).toBe(13);
    expect(names.every((name) => /^[a-z0-9_]+$/.test(name))).toBe(true);
  });

  it("envia todos como marketing em português do Brasil", () => {
    for (const template of LIFECYCLE_TEMPLATE_DEFINITIONS) {
      expect(template.category).toBe("MARKETING");
      expect(template.language).toBe("pt_BR");
    }
  });

  it("mantém variáveis sequenciais, exemplos e parâmetros em igual quantidade", () => {
    for (const template of LIFECYCLE_TEMPLATE_DEFINITIONS) {
      const body = template.components.find((component) => component.type === "BODY")!;
      const validation = validateTemplateVariables(body.text);
      expect(validation.valid, template.name).toBe(true);
      expect(body.text.trim(), template.name).not.toMatch(/^\{\{\d+\}\}/);
      expect(body.text.trim(), template.name).not.toMatch(/\{\{\d+\}\}[.!?]?$/);
      expect(body.example.body_text[0]).toHaveLength(validation.indexes.length);
      expect(template.bodyParams).toHaveLength(validation.indexes.length);
      expect(template.bodyParamTokens).toHaveLength(validation.indexes.length);
    }
  });

  it("compartilha arquétipos sem deixar segmento comprador sem mensagem", () => {
    expect(rfmTemplatesForSegment("Campeões")[0].name).toContain("vip");
    expect(rfmTemplatesForSegment("Novos")[0].name).toContain("crescimento");
    expect(rfmTemplatesForSegment("Perdidos")[0].name).toContain("reativacao");
  });
});
