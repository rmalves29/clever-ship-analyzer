import { describe, expect, it } from "vitest";
import { CRM_SEGMENT_TEMPLATES } from "./crm-segment-templates";
import { getCRMFilterField, validateCRMFilterCondition, validateSegmentRulesPayload } from "./crm-filter-catalog";

describe("modelos prontos de segmentos", () => {
  it("mantém IDs únicos e modelos com nome e descrição", () => {
    expect(CRM_SEGMENT_TEMPLATES.length).toBeGreaterThan(0);
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
});
