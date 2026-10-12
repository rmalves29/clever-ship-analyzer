import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown-blocks";

describe("markdown mínimo", () => {
  it("negrito, itálico e código no meio do texto", () => {
    expect(parseInline("Frete **caro** e `n=46` mas *ok*")).toEqual([
      { text: "Frete " },
      { text: "caro", bold: true },
      { text: " e " },
      { text: "n=46", code: true },
      { text: " mas " },
      { text: "ok", italic: true },
    ]);
  });

  it("títulos, listas, tabela e parágrafos", () => {
    const md = [
      "### Resumo",
      "Primeira linha",
      "continua aqui.",
      "",
      "- item **um**",
      "- item dois",
      "",
      "| Opção | n | % |",
      "|---|---:|---:|",
      "| Frete | 46 | 38% |",
      "| Preço | 30 | 25% |",
      "",
      "1. primeiro",
      "2. segundo",
    ].join("\n");
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "table", "list"]);
    const table = blocks[3] as Extract<(typeof blocks)[number], { type: "table" }>;
    expect(table.header).toHaveLength(3);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]![0]![0]!.text).toBe("Frete");
    expect((blocks[1] as any).inline[0].text).toBe("Primeira linha continua aqui.");
    expect((blocks[4] as any).ordered).toBe(true);
  });

  it("HTML vira texto puro (nada é interpretado)", () => {
    const [block] = parseMarkdown("<script>alert(1)</script> **ok**");
    expect(block!.type).toBe("paragraph");
    const texts = (block as any).inline.map((i: any) => i.text).join("");
    expect(texts).toContain("<script>");
  });
});
