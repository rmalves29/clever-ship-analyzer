/**
 * Relatório em PDF da matriz criativa (+ ideias, quando já geradas). Roda no navegador:
 * `jspdf` é carregado só quando o botão é clicado, para não pesar o resto do sistema.
 */
import {
  ANGLE_LABEL,
  CATEGORY_LABEL,
  cellKey,
  type Angle,
  type Category,
  type PostCell,
} from "./creative-matrix-shared";
import type { CreativeIdea, CreativeMatrixResult } from "./creative-matrix.server";

const PERIOD_LABEL: Record<string, string> = {
  today: "hoje",
  yesterday: "ontem",
  last_7d: "últimos 7 dias",
  last_14d: "últimos 14 dias",
  last_30d: "últimos 30 dias",
  this_month: "este mês",
  last_month: "mês passado",
};

/**
 * As fontes padrão do PDF só cobrem Latin-1: acentos do português passam, mas emojis, setas e
 * aspas tipográficas viram lixo. Troca o que tem equivalente simples e descarta o resto.
 */
export function pdfSafeText(value: string): string {
  const replaced = value
    .normalize("NFC")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●]/g, "-")
    .replace(/→/g, "->")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[​-‍️ ]/g, " ");
  // Mantém Latin-1 (acentos, ×, ·, º, ª); remove emojis e demais símbolos.
  return Array.from(replaced)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code === 9 || code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255);
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const percent = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const intBr = (v: number) => Math.round(v).toLocaleString("pt-BR");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const roasText = (v: number | null) => (v === null ? "-" : `${v.toFixed(2).replace(".", ",")}x`);
const angleLabel = (a: string) => ANGLE_LABEL[a as Angle] ?? a;
const categoryLabel = (c: string) => CATEGORY_LABEL[c as Category] ?? c;

export function postCellText(cell: PostCell | undefined): string {
  if (!cell || cell.n === 0) return "-";
  return `${percent(cell.engagementRate)}\n${cell.n} ${cell.n === 1 ? "post" : "posts"} | alcance ${intBr(cell.avgReach)}`;
}

export function reportFileName(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `matriz-criativa-${yyyy}-${mm}-${dd}.pdf`;
}

const PRIMARY: [number, number, number] = [115, 103, 240];
const GRAY: [number, number, number] = [100, 100, 110];

export async function buildCreativeReportPdf(result: CreativeMatrixResult, ideas: CreativeIdea[] | null) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const heading = (text: string) => {
    y += 8;
    ensureSpace(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 40);
    doc.text(pdfSafeText(text), margin, y);
    y += 18;
  };

  const paragraph = (text: string, opts: { size?: number; color?: [number, number, number]; bold?: boolean; indent?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? [40, 40, 50]));
    const indent = opts.indent ?? 0;
    const lines = doc.splitTextToSize(pdfSafeText(text), contentWidth - indent) as string[];
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, margin + indent, y);
      y += size + 3;
    }
  };

  const table = (head: string[], body: string[][], options: { columnWidths?: Record<number, number> } = {}) => {
    ensureSpace(60);
    autoTable(doc, {
      startY: y,
      head: [head.map(pdfSafeText)],
      body: body.map((row) => row.map(pdfSafeText)),
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, lineColor: [225, 225, 232], lineWidth: 0.5, textColor: [40, 40, 50] },
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 247, 250] },
      columnStyles: options.columnWidths
        ? Object.fromEntries(Object.entries(options.columnWidths).map(([k, w]) => [k, { cellWidth: w }]))
        : {},
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;
  };

  // Cabeçalho
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageWidth, 54, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("Matriz criativa - Mania de Mulher", margin, 34);
  y = 74;
  paragraph(
    `Período: ${PERIOD_LABEL[result.datePreset] ?? result.datePreset} | Gerada em ${new Date(result.generatedAt).toLocaleString("pt-BR")} | ${result.posts.length} posts${result.ads.length > 0 ? ` e ${result.ads.length} anúncios` : ""}`,
    { size: 9, color: GRAY },
  );
  paragraph("Os ângulos e produtos de cada peça foram classificados por IA (posts pela legenda, anúncios pelo nome). Taxas e ROAS vêm das métricas reais.", { size: 8, color: GRAY });
  y += 6;

  for (const notice of result.notices) paragraph(`Aviso: ${notice}`, { size: 9, color: GRAY });

  heading("Resumo");
  paragraph(result.resumo);
  y += 2;
  if (result.recomendacoes.length > 0) {
    heading("Recomendações");
    result.recomendacoes.forEach((r, i) => paragraph(`${i + 1}. ${r}`, { indent: 6 }));
    y += 6;
  }

  // Orgânico formato x ângulo
  const pm = result.postMatrix;
  heading("Orgânico: formato x ângulo");
  paragraph("Em cada célula: engajamento (interações ÷ alcance), posts e alcance médio.", { size: 8, color: GRAY });
  table(
    ["Formato", ...pm.angles.map(angleLabel), "Todos"],
    [
      ...pm.formats.map((f) => [f, ...pm.angles.map((a) => postCellText(pm.cells[cellKey(f, a)])), postCellText(pm.byFormat[f])]),
      ["Todos", ...pm.angles.map((a) => postCellText(pm.byAngle[a])), postCellText(pm.overall)],
    ],
  );

  // Anúncios x orgânico
  if (result.adMatrix) {
    const am = result.adMatrix;
    heading("Anúncios x orgânico por ângulo");
    paragraph("ROAS marcado como 'poucos dados' tem menos de 3 compras e não é conclusivo.", { size: 8, color: GRAY });
    table(
      ["Ângulo", "Anúncios", "Gasto", "Compras", "ROAS", "CPA", "CTR link", "Engaj. orgânico"],
      [
        ...am.angles.map((a) => {
          const c = am.byAngle[a]!;
          const organic = pm.byAngle[a];
          return [
            angleLabel(a),
            String(c.n),
            brl(c.spend),
            String(c.purchases),
            `${roasText(c.roas)}${c.lowData ? " (poucos dados)" : ""}`,
            c.cpa === null ? "-" : brl(c.cpa),
            percent(c.ctrLink),
            organic && organic.n > 0 ? `${percent(organic.engagementRate)} (${organic.n})` : "-",
          ];
        }),
        ["Conta", String(am.overall.n), brl(am.overall.spend), String(am.overall.purchases), roasText(am.overall.roas), am.overall.cpa === null ? "-" : brl(am.overall.cpa), percent(am.overall.ctrLink), percent(pm.overall.engagementRate)],
      ],
    );
  }

  // Por produto
  if (Object.keys(pm.byCategory).length > 0) {
    heading("Por produto");
    table(
      ["Produto", "Posts", "Engaj. orgânico", "Anúncios", "ROAS"],
      Object.entries(pm.byCategory).map(([category, cell]) => {
        const ad = result.adMatrix?.byCategory[category];
        return [categoryLabel(category), String(cell.n), percent(cell.engagementRate), ad ? String(ad.n) : "-", ad ? `${roasText(ad.roas)}${ad.lowData ? " (poucos dados)" : ""}` : "-"];
      }),
    );
  }

  // Achados
  if (result.insights.length > 0) {
    heading("Achados calculados");
    for (const ins of result.insights) {
      paragraph(ins.title, { bold: true, size: 10 });
      paragraph(ins.text, { size: 9, color: GRAY, indent: 6 });
      y += 3;
    }
    y += 4;
  }

  // Ideias
  if (ideas && ideas.length > 0) {
    doc.addPage();
    y = margin;
    heading("Ideias para as próximas peças");
    paragraph("Geradas por IA a partir da matriz. Nenhuma foi publicada. Onde aparece [informe a oferta], defina a oferta antes de usar.", { size: 8, color: GRAY });
    y += 4;
    ideas.forEach((idea, index) => {
      ensureSpace(90);
      paragraph(`${index + 1}. ${idea.tipo === "post" ? "Post" : "Anúncio"} | ${idea.formato} | ${angleLabel(idea.angulo)} | ${idea.produto}${idea.prioridade === "alta" ? " | prioridade alta" : ""}`, { bold: true, size: 10, color: PRIMARY });
      paragraph(`Gancho: ${idea.gancho}`, { bold: true, size: 10, indent: 8 });
      idea.roteiro.forEach((step, i) => paragraph(`${i + 1}) ${step}`, { size: 9, indent: 14 }));
      paragraph(`${idea.tipo === "post" ? "Legenda" : "Texto principal"}: ${idea.legenda}`, { size: 9, indent: 8 });
      paragraph(`CTA: ${idea.cta}`, { size: 9, bold: true, indent: 8 });
      paragraph(`Por quê: ${idea.baseado_em}`, { size: 8, color: GRAY, indent: 8 });
      y += 10;
    });
  }

  // Rodapé com paginação
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Mania de Mulher | Matriz criativa | página ${i} de ${pages}`, margin, pageHeight - 16);
  }

  return doc;
}

export async function downloadCreativeReportPdf(result: CreativeMatrixResult, ideas: CreativeIdea[] | null): Promise<void> {
  const doc = await buildCreativeReportPdf(result, ideas);
  doc.save(reportFileName());
}
