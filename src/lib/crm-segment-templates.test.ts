import { describe, expect, it } from "vitest";
import { CRM_RFM_SEGMENT_TEMPLATES, CRM_SEGMENT_TEMPLATES, buildPersistedRulesFromTemplate } from "./crm-segment-templates";
import { RFM_SEGMENTS_CONFIG } from "./crm-rfm-shared";
import { getCRMFilterField, validateCRMFilterCondition, validateSegmentRulesPayload } from "./crm-filter-catalog";

describe("modelos prontos de segmentos", () => {
  it("mantém IDs únicos e modelos com nome e descrição", () => {
    expect(CRM_SEGMENT_TEMPLATES.length).toBe(25);
    expect(new Set(CRM_SEGMENT_TEMPLATES.map((template) => template.id)).size).toBe(CRM_SEGMENT_TEMPLATES.length);
    for (const template of CRM_SEGMENT_TEMPLATES) {
      expect(template.name.trim()).not.toBe("");
      expect(template.description.trim()).not.toBe("");
      expect(template.conditions.length).toBeGreaterThan(0);
    }
  });

  it.each(CRM_SEGMENT_TEMPLATES)("$name usa somente filtros implementados e valores válidos", (template) => {
    for (const condition of template.conditions) {
      expect(getCRMFilterField(condition.field)).toBeDefined();
      expect(validateCRMFilterCondition(condition)).toBeNull();
    }
    expect(validateSegmentRulesPayload({ groups: [{ conditions: template.conditions }] })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("não usa placeholders vazios que gerariam segmentos ambíguos", () => {
    for (const template of CRM_SEGMENT_TEMPLATES) {
      for (const condition of template.conditions) {
        expect(condition.value).not.toBe("");
        if (condition.value && typeof condition.value === "object" && !Array.isArray(condition.value)) {
          for (const value of Object.values(condition.value)) expect(value).not.toBe("");
        }
      }
    }
  });

  it("inclui os principais públicos comerciais para conversão, recompra, valor e fidelização", () => {
    const ids = new Set(CRM_SEGMENT_TEMPLATES.map((template) => template.id));
    [
      "checkout-abandonado-ativo",
      "segunda-compra-8-14",
      "segunda-compra-15-30",
      "frequencia-2-30d",
      "alto-valor-30d",
      "compra-unica-alto-valor",
      "recorrente-alto-valor",
      "rfm-campeoes",
      "rfm-hibernando",
      "baixo-ticket-recente",
    ].forEach((id) => expect(ids.has(id)).toBe(true));
  });

  it("oferece um segmento dinâmico para cada classificação RFM", () => {
    const rfmValues = CRM_RFM_SEGMENT_TEMPLATES.map((template) => template.conditions[0]?.value);
    expect(rfmValues).toEqual(Object.keys(RFM_SEGMENTS_CONFIG));

    for (const template of CRM_RFM_SEGMENT_TEMPLATES) {
      const segment = template.conditions[0]?.value;
      expect(template.name).toBe(`RFM — ${segment}`);
      expect(template.conditions).toEqual([{ field: "rfm_segment", operator: "eq", value: segment }]);
    }
  });

  it.each(CRM_SEGMENT_TEMPLATES)("$name gera regras persistíveis e editáveis", (template) => {
    const regras = buildPersistedRulesFromTemplate(template);
    expect(regras.groups).toHaveLength(1);
    expect(regras.groups[0]?.type).toBe("AND");
    expect(regras.groups[0]?.conditions).toHaveLength(template.conditions.length);
    expect(validateSegmentRulesPayload(regras)).toEqual({ valid: true, errors: [] });

    for (const condition of regras.groups[0]!.conditions) {
      expect(condition.id).not.toBe("");
      expect(condition.category).not.toBe("");
      expect(condition.label).not.toBe("");
      expect(getCRMFilterField(condition.field)).toBeDefined();
    }
  });
});
