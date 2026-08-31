// Parser compartilhado (client-safe) para importação manual de contatos.
// Campos esperados: nome, email, telefone, tag, data da última compra.

export type ImportedContactRow = {
  line: number;
  nome: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  lastPurchaseAt: string | null; // ISO 8601
  errors: string[];
};

export type ContactsImportParseResult = {
  rows: ImportedContactRow[];
  delimiter: string;
  columns: string[];
  ignoredColumns: string[];
};

const HEADER_ALIASES: Record<keyof Omit<ImportedContactRow, "line" | "tags" | "lastPurchaseAt" | "errors"> | "tag" | "lastPurchase", string[]> = {
  nome: ["nome", "name", "nome completo", "nome cliente", "nome do cliente", "cliente", "contato"],
  email: ["email", "e-mail", "mail", "e mail"],
  phone: ["telefone", "telefone 1", "telefone 2", "phone", "celular", "whatsapp", "tel", "fone", "numero", "número"],
  tag: ["tag", "tags", "etiqueta", "etiquetas"],
  lastPurchase: [
    "data da ultima compra",
    "data ultima compra",
    "ultima compra",
    "última compra",
    "data da última compra",
    "last purchase",
    "last_order_at",
    "data_pedido",
    "data compra",
    "data da compra",
  ],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((v) => v.trim());
}

export function normalizeImportPhone(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 10) return null; // inválido
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  return `+${digits}`;
}

export function parseImportDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // dd/mm/yyyy ou dd-mm-yyyy (opcionalmente com hora)
  const brMatch = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brMatch) {
    const [, d, m, yRaw, hh = "0", mm = "0", ss = "0"] = brMatch;
    let y = Number(yRaw);
    if (y < 100) y += 2000;
    const date = new Date(Date.UTC(y, Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
    return date.toISOString();
  }

  // ISO: yyyy-mm-dd[ T hh:mm[:ss]]
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = isoMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function parseTags(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/[|/]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 20);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseContactsCsv(text: string): ContactsImportParseResult {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], delimiter: ",", columns: [], ignoredColumns: [] };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitCsvLine(lines[0]!, delimiter).map(normalizeHeader);

  const columnIndex: Partial<Record<"nome" | "email" | "phone" | "tag" | "lastPurchase", number>> = {};
  const ignored: string[] = [];
  const setCol = (key: keyof typeof columnIndex, idx: number) => {
    if (columnIndex[key] === undefined) columnIndex[key] = idx;
  };

  headers.forEach((h, idx) => {
    if (!h) return;
    let matched = false;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.map(normalizeHeader).includes(h)) {
        setCol(key as keyof typeof columnIndex, idx);
        matched = true;
        break;
      }
    }
    if (matched) return;

    // Correspondência aproximada (cabeçalhos variados / acentos corrompidos)
    if (/mail/.test(h)) setCol("email", idx);
    else if (/(telefone|celular|whats|fone|tel\b)/.test(h)) setCol("phone", idx);
    else if (/(compra|pedido|purchase)/.test(h) && /(data|ultima|last|ltima)/.test(h)) setCol("lastPurchase", idx);
    else if (/compra/.test(h)) setCol("lastPurchase", idx);
    else if (/(tag|etiqueta)/.test(h)) setCol("tag", idx);
    else if (/(nome|name|cliente|contato)/.test(h)) setCol("nome", idx);
    else {
      ignored.push(h);
      return;
    }
  });


  const rows: ImportedContactRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!, delimiter);
    const get = (key: keyof typeof columnIndex) => {
      const idx = columnIndex[key];
      return idx === undefined ? "" : (cells[idx] ?? "");
    };

    const errors: string[] = [];
    const nome = get("nome") || null;
    const rawEmail = get("email") || null;
    const email = rawEmail ? rawEmail.toLowerCase() : null;
    if (email && !EMAIL_RE.test(email)) errors.push("e-mail inválido");

    const rawPhone = get("phone");
    const phone = normalizeImportPhone(rawPhone);
    if (rawPhone && !phone) errors.push("telefone inválido");

    const rawDate = get("lastPurchase");
    const lastPurchaseAt = parseImportDate(rawDate);
    if (rawDate && !lastPurchaseAt) errors.push("data da última compra inválida");

    if (!email && !phone) errors.push("sem e-mail e sem telefone");

    rows.push({
      line: i + 1,
      nome,
      email,
      phone,
      tags: parseTags(get("tag")),
      lastPurchaseAt,
      errors,
    });
  }

  return { rows, delimiter, columns: headers, ignoredColumns: ignored };
}

/** Gera o id determinístico do contato importado (estável entre reimportações). */
export function buildImportedContactId(row: Pick<ImportedContactRow, "email" | "phone">): string | null {
  if (row.email) return `manual:email:${row.email}`;
  if (row.phone) return `manual:phone:${row.phone.replace(/\D/g, "")}`;
  return null;
}
