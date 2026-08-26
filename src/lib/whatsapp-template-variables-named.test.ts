import { describe, expect, it } from "vitest";
import {
  buildMetaWhatsappBodyParameters,
  extractWhatsappBodyVariables,
  inferWhatsappTemplateParameterFormat,
  missingWhatsappTemplateVariableIndexes,
  renderWhatsappTemplateBodyPreview,
  suggestedWhatsappDynamicToken,
} from "./whatsapp-template-variables";

const named = [{ type: "BODY", text: "Oi {{primeiro_nome}}, pedido {{id_pedido}} pronto." }];
const positional = [{ type: "BODY", text: "Oi {{1}}, pedido {{2}} pronto." }];

describe("WhatsApp template runtime variables", () => {
  it("extrai variáveis nomeadas na ordem em que aparecem", () => {
    expect(extractWhatsappBodyVariables(named)).toEqual([
      { key: "primeiro_nome", label: "{{primeiro_nome}}", parameterName: "primeiro_nome", position: 0 },
      { key: "id_pedido", label: "{{id_pedido}}", parameterName: "id_pedido", position: 1 },
    ]);
    expect(inferWhatsappTemplateParameterFormat(named)).toBe("NAMED");
  });

  it("mantém compatibilidade com variáveis posicionais", () => {
    expect(extractWhatsappBodyVariables(positional).map((variable) => variable.key)).toEqual(["1", "2"]);
    expect(inferWhatsappTemplateParameterFormat(positional)).toBe("POSITIONAL");
  });

  it("monta parameter_name para templates nomeados", () => {
    expect(buildMetaWhatsappBodyParameters(named, ["Ana", "#123"])).toEqual([
      { type: "text", text: "Ana", parameter_name: "primeiro_nome" },
      { type: "text", text: "#123", parameter_name: "id_pedido" },
    ]);
  });

  it("não inclui parameter_name em templates posicionais", () => {
    expect(buildMetaWhatsappBodyParameters(positional, ["Ana", "#123"])).toEqual([
      { type: "text", text: "Ana" },
      { type: "text", text: "#123" },
    ]);
  });

  it("identifica campos obrigatórios vazios e renderiza prévia nomeada", () => {
    const variables = extractWhatsappBodyVariables(named);
    expect(missingWhatsappTemplateVariableIndexes(variables, ["Ana", ""])).toEqual([1]);
    expect(renderWhatsappTemplateBodyPreview(named, ["Ana", "#123"])).toBe("Oi Ana, pedido #123 pronto.");
  });

  it("sugere tokens do CRM para nomes comuns da Meta", () => {
    expect(suggestedWhatsappDynamicToken("primeiro_nome")).toBe("{{NOME_CLIENTE}}");
    expect(suggestedWhatsappDynamicToken("id_pedido")).toBe("{{NUMERO_PEDIDO}}");
    expect(suggestedWhatsappDynamicToken("codigo_rastreio")).toBe("{{RASTREIO}}");
  });
});
