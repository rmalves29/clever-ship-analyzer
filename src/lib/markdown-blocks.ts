/**
 * Markdown mínimo e seguro (sem HTML): títulos, parágrafos, listas, tabelas, citação e linha. Devolve blocos para o
 * componente desenhar — nada de dangerouslySetInnerHTML, então texto vindo da IA nunca vira HTML.
 */
export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; inline: Inline[] }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "quote"; inline: Inline[] }
  | { type: "rule" };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith("`")) out.push({ text: tok.slice(1, -1), code: true });
    else out.push({ text: tok.slice(1, -1), italic: true });
    last = idx + tok.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length > 0 ? out : [{ text }];
}

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1]!.length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ type: "heading", level, inline: parseInline(heading[2]!.trim()) });
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1] ?? "")) {
      const header = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim() !== "") {
        rows.push(splitRow(lines[i]!).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const l = lines[i] ?? "";
        const m = ordered ? l.match(/^\s*\d+[.)]\s+(.*)$/) : l.match(/^\s*[-*•]\s+(.*)$/);
        if (m) {
          items.push(parseInline(m[1]!));
          i++;
        } else if (/^\s{2,}\S/.test(l) && items.length > 0) {
          // continuação indentada do item anterior
          items[items.length - 1] = [...items[items.length - 1]!, { text: ` ${l.trim()}` }];
          i++;
        } else break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (line.startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        quoted.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", inline: parseInline(quoted.join(" ")) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "" && !/^(#{1,6}\s|\s*[-*•]\s|\s*\d+[.)]\s|>)/.test(lines[i] ?? "") && !((lines[i] ?? "").includes("|") && isTableSep(lines[i + 1] ?? ""))) {
      para.push((lines[i] ?? "").trim());
      i++;
    }
    if (para.length === 0) {
      i++;
      continue;
    }
    blocks.push({ type: "paragraph", inline: parseInline(para.join(" ")) });
  }
  return blocks;
}
