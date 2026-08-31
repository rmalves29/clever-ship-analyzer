import { describe, expect, it } from "vitest";
import {
  buildImportedContactId,
  normalizeImportPhone,
  parseContactsCsv,
  parseImportDate,
} from "./contacts-import-shared";

describe("parseContactsCsv", () => {
  it("faz parse de CSV com ponto-e-vírgula e todos os campos", () => {
    const text = [
      "Nome;Email;Telefone;Tag;Data da ultima compra",
      "Maria Silva;maria@exemplo.com;(31) 99999-1234;VIP;15/08/2026",
      "João;joao@exemplo.com;31988887777;LEAD|RECORRENTE;2026-07-01",
    ].join("\n");
    const result = parseContactsCsv(text);
    expect(result.delimiter).toBe(";");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      nome: "Maria Silva",
      email: "maria@exemplo.com",
      phone: "+5531999991234",
      tags: ["VIP"],
      lastPurchaseAt: "2026-08-15T00:00:00.000Z",
      errors: [],
    });
    expect(result.rows[1]?.tags).toEqual(["LEAD", "RECORRENTE"]);
    expect(result.rows[1]?.lastPurchaseAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("aceita vírgula como delimitador e tags separadas por barra", () => {
    const text = "nome,email,telefone,tag\nAna,ana@exemplo.com,11999998888,A/B";
    const result = parseContactsCsv(text);
    expect(result.delimiter).toBe(",");
    expect(result.rows[0]?.tags).toEqual(["A", "B"]);
  });

  it("marca linha sem email e sem telefone como erro", () => {
    const text = "nome;email;telefone\nSem Contato;;";
    const result = parseContactsCsv(text);
    expect(result.rows[0]?.errors).toContain("sem e-mail e sem telefone");
  });

  it("tolera colunas extras e ausência da coluna de data", () => {
    const text = "nome;telefone;cidade\nBia;31977776666;BH";
    const result = parseContactsCsv(text);
    expect(result.ignoredColumns).toContain("cidade");
    expect(result.rows[0]?.lastPurchaseAt).toBeNull();
    expect(result.rows[0]?.errors).toEqual([]);
  });
});

describe("normalizeImportPhone", () => {
  it("adiciona DDI 55 em números locais", () => {
    expect(normalizeImportPhone("(31) 99290-4210")).toBe("+5531992904210");
  });
  it("mantém números já com DDI", () => {
    expect(normalizeImportPhone("5531992904210")).toBe("+5531992904210");
  });
  it("rejeita números curtos demais", () => {
    expect(normalizeImportPhone("12345")).toBeNull();
  });
});

describe("parseImportDate", () => {
  it("parse dd/mm/yyyy", () => {
    expect(parseImportDate("01/02/2026")).toBe("2026-02-01T00:00:00.000Z");
  });
  it("parse dd/mm/yyyy com hora", () => {
    expect(parseImportDate("01/02/2026 13:45")).toBe("2026-02-01T13:45:00.000Z");
  });
  it("parse ISO", () => {
    expect(parseImportDate("2026-02-01")).toBe("2026-02-01T00:00:00.000Z");
  });
  it("rejeita data impossível", () => {
    expect(parseImportDate("31/02/2026")).toBeNull();
  });
});

describe("buildImportedContactId", () => {
  it("prefere email e é estável", () => {
    expect(buildImportedContactId({ email: "a@b.com", phone: "+5511" })).toBe("manual:email:a@b.com");
    expect(buildImportedContactId({ email: null, phone: "+5531992904210" })).toBe("manual:phone:5531992904210");
    expect(buildImportedContactId({ email: null, phone: null })).toBeNull();
  });
});
