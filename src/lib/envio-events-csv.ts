/** Exportação por pessoa das entradas e saídas dos grupos (aba Relatórios do Fluxo de Envio). */

export type EnvioEventsExportFilter = "all" | "join" | "leave";

export type EnvioEventExportRow = {
  createdAt: string;
  eventType: string;
  phone: string | null;
  groupName: string;
  /** Campanha do link clicado (campaign_id do evento). */
  campaignName: string;
  /** Campanhas em que o grupo está cadastrado. */
  groupCampaignNames: string[];
};

const BRT_OFFSET_MS = 3 * 3_600_000;

/** "5531999998888" -> "+55 (31) 99999-8888". Números fora do padrão ficam como vieram (só dígitos com +). */
export function formatBrPhone(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    const split = local.length === 9 ? `${local.slice(0, 5)}-${local.slice(5)}` : `${local.slice(0, 4)}-${local.slice(4)}`;
    return `+55 (${ddd}) ${split}`;
  }
  return `+${digits}`;
}

/** Data e hora no fuso de Brasília: ["14/11/2026", "09:00:30"]. */
export function brtDateTime(iso: string): [string, string] {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return ["", ""];
  const t = new Date(ms - BRT_OFFSET_MS).toISOString();
  return [`${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`, t.slice(11, 19)];
}

function cell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const ENVIO_EVENTS_CSV_HEADER = ["data", "hora", "evento", "telefone", "grupo", "campanha_do_link", "campanhas_do_grupo"];

/** Ponto e vírgula + BOM: o Excel em português abre direto; nomes com vírgula/aspas não quebram as colunas. */
export function buildEnvioEventsCsv(rows: EnvioEventExportRow[]): string {
  const lines = [ENVIO_EVENTS_CSV_HEADER.join(";")];
  for (const row of rows) {
    const [date, time] = brtDateTime(row.createdAt);
    lines.push(
      [
        date,
        time,
        row.eventType === "join" ? "Entrou" : row.eventType === "leave" ? "Saiu" : row.eventType,
        formatBrPhone(row.phone),
        row.groupName,
        row.campaignName,
        row.groupCampaignNames.join(" + "),
      ]
        .map(cell)
        .join(";"),
    );
  }
  return "﻿" + lines.join("\r\n");
}

export function envioEventsFileName(filter: EnvioEventsExportFilter, label: string, today: string): string {
  const what = filter === "join" ? "entradas" : filter === "leave" ? "saidas" : "entradas-e-saidas";
  return `fluxo-envio-${what}-${label}-${today}.csv`;
}
