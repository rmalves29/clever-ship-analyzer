/**
 * Arquivo visual da Matriz Criativa: um HTML autocontido (sem recursos externos) com as 16 seções do
 * método. Todo texto dinâmico passa por `esc()`: o conteúdo vem da IA e das páginas da loja.
 */
import {
  AWARENESS,
  AWARENESS_LABEL,
  CELL_STATUS_LABEL,
  CLAIM_LABEL,
  CLAIM_STATUS,
  FORMAT_LABEL,
  HEALTH_CRITERIA,
  MAX_SCORE,
  PHASE_LABEL,
  PILLARS,
  PILLAR_LABEL,
  PLACEMENTS,
  ROLE_LABEL,
  SCORE_KEYS,
  SCORE_LABEL,
  healthAverage,
  healthVerdict,
  totalScore,
  type Awareness,
  type CreativeBriefing,
  type MatrixProject,
  type Pillar,
} from "./matriz-agente-shared";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PLACEHOLDER = /\[(?:INSERIR|VALIDAR|CONFIRMAR)[^\]]*\]/gi;

/** Escapa o texto e destaca os placeholders obrigatórios do método. */
export function fmt(value: unknown): string {
  return esc(value).replace(PLACEHOLDER, (m) => `<mark>${m}</mark>`);
}

const list = (items: string[]) => (items.length > 0 ? `<ul>${items.map((i) => `<li>${fmt(i)}</li>`).join("")}</ul>` : `<p class="muted">-</p>`);
const row = (label: string, value: string) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;

const pillarLabel = (p: string) => PILLAR_LABEL[p as Pillar] ?? p;

export function reportFileName(project: Pick<MatrixProject, "brief" | "generatedAt">): string {
  const slug = (project.brief.produto || project.brief.marca || "matriz")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `matriz-criativa-black-friday-${slug || "produto"}-${project.generatedAt.slice(0, 10)}.html`;
}

const CSS = `
:root{--blue:#1d4ed8;--blue-soft:#e8efff;--ink:#0b1b3a;--muted:#5b6b86;--line:#d9e1f0;--bg:#f6f9ff;--ok:#0f8a5f;--warn:#b45309;--bad:#b91c1c}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
main{max-width:1180px;margin:0 auto;padding:24px 20px 80px}
header.cover{background:linear-gradient(135deg,#0b1b3a,#1d4ed8);color:#fff;border-radius:20px;padding:48px 40px;margin-bottom:28px}
header.cover small{letter-spacing:.14em;text-transform:uppercase;opacity:.8;font-weight:700}
header.cover h1{font-size:clamp(28px,5vw,46px);line-height:1.1;margin:10px 0 12px}
header.cover p{margin:4px 0;opacity:.92}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
nav.toc a{font-size:12px;font-weight:700;color:var(--blue);background:var(--blue-soft);border-radius:999px;padding:6px 12px;text-decoration:none}
section{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px;margin-bottom:20px}
section>h2{margin:0 0 4px;font-size:22px}section>h2 .n{color:var(--blue);margin-right:8px}
section>.lead{color:var(--muted);margin:0 0 16px}
h3{font-size:16px;margin:18px 0 8px}
table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:var(--blue-soft);font-weight:700;color:#173a8a}table.kv th{width:240px}
.scroll{overflow-x:auto}.muted{color:var(--muted)}
.grid{display:grid;gap:14px}.g2{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.g3{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.card{border:1px solid var(--line);border-radius:12px;padding:14px;background:#fff}
.badge{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;background:var(--blue-soft);color:#173a8a;margin:0 4px 4px 0}
.badge.ok{background:#dcfce7;color:#14532d}.badge.warn{background:#fef3c7;color:#78350f}.badge.bad{background:#fee2e2;color:#7f1d1d}.badge.grey{background:#e5e7eb;color:#374151}
mark{background:#fff3b0;color:#4a3b00;border-radius:4px;padding:0 3px;font-weight:700}
.matrix td{min-width:170px;font-size:12.5px}.matrix td.sel{background:#dbe7ff;border:2px solid var(--blue)}
.matrix td.blocked{background:#f3f4f6;color:#6b7280}.matrix ol{margin:6px 0 0;padding-left:16px}
.bar{height:8px;border-radius:999px;background:#e5eaf5;overflow:hidden;min-width:70px}.bar>i{display:block;height:100%;background:var(--blue)}
.mocks{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.mockwrap{display:flex;flex-direction:column;gap:10px}
.mock{width:100%;max-width:340px;aspect-ratio:4/5;border-radius:22px;border:1px solid var(--line);background:linear-gradient(160deg,#eef3ff,#fff);box-shadow:0 10px 30px rgba(15,35,90,.12);padding:20px;display:flex;flex-direction:column;gap:12px}
.mock .tag{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)}
.mock h4{margin:0;font-size:24px;line-height:1.1;letter-spacing:-.02em;outline:none}
.mock .img{flex:1;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#c7d8ff,#8fb0ff);position:relative;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;text-align:center;padding:10px}
.mock .img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mock .anchor{position:absolute;left:8px;right:8px;bottom:8px;background:rgba(11,27,58,.82);color:#fff;font-size:10.5px;font-weight:600;border-radius:8px;padding:6px 8px;text-align:left}
.mock .cta{background:var(--blue);color:#fff;text-align:center;font-weight:800;border-radius:12px;padding:12px;font-size:14px;text-transform:uppercase;letter-spacing:.03em;outline:none}
.hfc{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.hfc div{background:var(--blue-soft);border-radius:8px;padding:7px 9px;font-size:12px}.hfc b{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#173a8a}
.briefing{border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:16px}.briefing h3{margin-top:0}
.verdict{display:inline-block;border-radius:12px;padding:8px 14px;font-weight:800}
.v-critico{background:#fee2e2;color:#7f1d1d}.v-atencao{background:#fef3c7;color:#78350f}.v-pronto{background:#dcfce7;color:#14532d}.v-maduro{background:#dbeafe;color:#1e3a8a}
footer{color:var(--muted);font-size:12px;text-align:center;margin-top:30px}
@media print{body{background:#fff}main{max-width:none;padding:0}section{break-inside:auto;border:none;padding:8px 0}.briefing,.card,.mockwrap{break-inside:avoid}nav.toc{display:none}header.cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

function badgeForStatus(status: string): string {
  const tone = status === "ancora" || status === "rodando" ? "ok" : status === "bloqueado" ? "bad" : status === "pendente" ? "warn" : "";
  return `<span class="badge ${tone}">${esc(CELL_STATUS_LABEL[status as keyof typeof CELL_STATUS_LABEL] ?? status)}</span>`;
}

function section(id: string, n: number, title: string, lead: string, body: string): string {
  return `<section id="${id}"><h2><span class="n">${String(n).padStart(2, "0")}</span>${esc(title)}</h2>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}${body}</section>`;
}

function mockup(b: CreativeBriefing, image: string | null): string {
  const img = image ? `<img src="${image}" alt="">` : `<span>[INSERIR FOTO DO PRODUTO]</span>`;
  return `<div class="mockwrap">
  <div class="mock" aria-label="Mockup 4:5 ${esc(b.id)}">
    <div class="tag">${esc(pillarLabel(b.pilar))} · ${esc(ROLE_LABEL[b.papel])}</div>
    <h4 contenteditable="true" spellcheck="false">${fmt(b.headline)}</h4>
    <div class="img">${img}<div class="anchor">${esc(b.imagemAncora.slice(0, 120))}</div></div>
    <div class="cta" contenteditable="true" spellcheck="false">${fmt(b.cta)}</div>
  </div>
  <div class="hfc"><div><b>Headline</b>${fmt(b.headline)}</div><div><b>Imagem</b>${fmt(b.imagemAncora)}</div><div><b>CTA</b>${fmt(b.cta)}</div></div>
  <p class="muted" style="font-size:12px;margin:0">Fonte da condição: ${fmt(b.provaFonte || "[VALIDAR CONDIÇÃO COMERCIAL]")}</p>
</div>`;
}

function briefingBlock(b: CreativeBriefing): string {
  const kv = [
    row("Papel na campanha", `${esc(ROLE_LABEL[b.papel])} - ${fmt(b.papelNaCampanha)}`),
    row("Fase da Black", esc(PHASE_LABEL[b.faseBlack])),
    row("Público", fmt(b.publico)),
    row("Nível de consciência", esc(AWARENESS_LABEL[b.consciencia])),
    row("Dor / motivo de compra", fmt(b.dor)),
    row("Pilar", esc(pillarLabel(b.pilar))),
    row("Ângulo", fmt(b.angulo)),
    row("Conceito", fmt(b.conceito)),
    row("Hipótese", fmt(b.hipotese)),
    row("Stop Signal", fmt(b.stopSignal)),
    row("Headline (4 a 9 palavras)", `<b>${fmt(b.headline)}</b>`),
    row("Argumento de apoio (Meaning Signal)", fmt(b.argumentoApoio)),
    row("Trust Signal", fmt(b.trustSignal)),
    row("Produto e oferta visíveis", fmt(b.produtoOfertaVisiveis)),
    row("CTA (2 a 4 palavras / Action Signal)", `<b>${fmt(b.cta)}</b>`),
    row("Direção de arte", fmt(b.direcaoArte)),
    row("Imagem âncora", fmt(b.imagemAncora)),
    row("Ordem de leitura", fmt(b.ordemLeitura)),
    row("Elementos obrigatórios", list(b.elementosObrigatorios)),
    row("Elementos proibidos", list(b.elementosProibidos)),
    row("Prova e fonte", fmt(b.provaFonte)),
    row("Risco de compliance", fmt(b.riscoCompliance)),
    row("Variável de teste", fmt(b.variavelTeste)),
    row("Métrica primária", fmt(b.metricaPrimaria)),
    row("Métrica de negócio", fmt(b.metricaNegocio)),
    row("Formato recomendado", esc(FORMAT_LABEL[b.formatoRecomendado])),
    ...(b.roteiroFormato.length > 0 ? [row("Roteiro do formato", `<ol>${b.roteiroFormato.map((r) => `<li>${fmt(r)}</li>`).join("")}</ol>`)] : []),
    row("URL de destino", esc(b.urlDestino)),
    row("Próximo passo", fmt(b.proximoPasso)),
  ].join("");
  const avisos = b.avisos.length > 0 ? `<p>${b.avisos.map((a) => `<span class="badge warn">${esc(a)}</span>`).join("")}</p>` : "";
  return `<article class="briefing" id="brief-${esc(b.id)}"><h3>${esc(b.id)} - ${fmt(b.nome)}</h3>${avisos}<div class="scroll"><table class="kv">${kv}</table></div></article>`;
}

export function buildReportHtml(project: MatrixProject): string {
  const { brief, motivos, celulas, briefings, plano, input } = project;
  const selectedIds = new Set(project.selecionadas.map((s) => s.cellId));
  const byId = new Map(celulas.map((c) => [c.id, c]));
  const ranked = [...celulas].sort((a, b) => totalScore(b.scores) - totalScore(a.scores));
  const healthRows = plano?.healthScore ?? [];
  const avg = healthAverage(healthRows);
  const verdict = healthVerdict(avg);

  const cover = `<header class="cover"><small>Growth Commerce AI · Bloco 07</small><h1>Matriz Criativa de Black Friday</h1>
<p><b>${esc(brief.marca || "Marca")}</b> · ${esc(brief.produto || "Produto")}</p>
<p>Fase: ${esc(PHASE_LABEL[input.fase])} · Objetivo: ${esc(input.objetivo || brief.objetivo)}</p>
<p>Gerado em ${esc(new Date(project.generatedAt).toLocaleString("pt-BR"))}</p></header>`;

  const toc = `<nav class="toc">${[
    ["resumo", "Resumo"], ["brief", "Product Brief"], ["fontes", "Fontes e claims"], ["dores", "Mapa de dores"], ["consciencia", "Consciência"],
    ["matriz", "Matriz"], ["ranking", "Prioridades"], ["galeria", "Criativos"], ["briefings", "Briefings"], ["copies", "Copies Meta"],
    ["placements", "Placements"], ["testes", "Plano de teste"], ["riscos", "Riscos"], ["health", "Health Score"], ["passos", "Próximos passos"],
  ].map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join("")}</nav>`;

  const s1 = section("resumo", 1, "Resumo executivo", "", `
<p>${fmt(plano?.resumoExecutivo || "Resumo não gerado.")}</p>
<div class="grid g3">
<div class="card"><b>${motivos.length}</b><br><span class="muted">motivos de compra</span></div>
<div class="card"><b>${celulas.length}</b><br><span class="muted">territórios (células da matriz)</span></div>
<div class="card"><b>${briefings.length}</b><br><span class="muted">criativos na fila de produção</span></div>
<div class="card"><b>${avg.toFixed(1).replace(".", ",")} / 10</b><br><span class="verdict v-${verdict.tone}">${esc(verdict.label)}</span></div>
</div>`);

  const s2 = section("brief", 2, "Product Brief", "O que foi extraído das fontes. O que não estava nelas virou pendência.", `<div class="scroll"><table class="kv">${[
    row("Marca", fmt(brief.marca)), row("Produto ou kit", fmt(brief.produto)), row("URL de destino", esc(brief.urlDestino)),
    row("Preço", fmt(brief.preco)), row("Condição comercial", fmt(brief.condicaoComercial)), row("Público", fmt(brief.publico)),
    row("Benefício central", fmt(brief.beneficioCentral)), row("Objetivo", fmt(brief.objetivo)), row("Fase da Black", esc(PHASE_LABEL[brief.faseBlack])),
    row("Evidências", list(brief.evidencias)), row("Assets disponíveis", list(brief.assets)), row("Restrições de compliance", list(brief.restricoes)),
    row("Aprendizados anteriores", list(brief.aprendizadosAnteriores)),
    row("CPA máximo", input.cpaMax === null ? "<mark>[CONFIRMAR NÚMERO]</mark> não informado" : esc(`R$ ${input.cpaMax.toLocaleString("pt-BR")}`)),
    row("ROAS de equilíbrio", input.roasEquilibrio === null ? "<mark>[CONFIRMAR NÚMERO]</mark> não informado" : esc(input.roasEquilibrio.toLocaleString("pt-BR"))),
  ].join("")}</table></div>`);

  const claimsByStatus = CLAIM_STATUS.map((status) => {
    const items = brief.claims.filter((c) => c.status === status);
    return items.length === 0 ? "" : `<h3>${esc(CLAIM_LABEL[status])}</h3><ul>${items.map((c) => `<li>${fmt(c.texto)} <span class="muted">(${fmt(c.origem)})</span></li>`).join("")}</ul>`;
  }).join("");
  const s3 = section("fontes", 3, "Fontes, evidências e claims", "Hierarquia: anexos > página oficial > avaliações > pesquisa > mídia > concorrentes > hipótese.", `
<h3>Páginas lidas</h3><div class="scroll"><table><tr><th>Tipo</th><th>Endereço</th><th>Situação</th></tr>${project.paginas.map((p) => `<tr><td>${esc(p.tipo)}</td><td>${esc(p.url)}</td><td>${p.ok ? '<span class="badge ok">lida</span>' : `<span class="badge bad">falhou</span> ${esc(p.erro ?? "")}`}</td></tr>`).join("")}</table></div>
<h3>Fontes</h3><div class="scroll"><table><tr><th>Tipo</th><th>Origem</th><th>Resumo</th></tr>${brief.fontes.map((f) => `<tr><td>${esc(f.tipo)}</td><td>${esc(f.origem)}</td><td>${fmt(f.resumo)}</td></tr>`).join("")}</table></div>
<h3>Matriz de claims</h3>${claimsByStatus || '<p class="muted">Nenhum claim classificado.</p>'}
<h3>Avaliações reais encontradas</h3>${(brief.avaliacoesReais ?? []).length > 0 ? list(brief.avaliacoesReais) : "<p><mark>[INSERIR REVIEW REAL]</mark> Nenhuma avaliação publicada em texto foi encontrada nas páginas.</p>"}
<h3>Divergências entre fontes</h3>${list(brief.divergencias)}
<h3>Pendências</h3>${list(brief.pendencias)}`);

  const s4 = section("dores", 4, "Mapa de dores e motivos de compra", "Cada linha precisa gerar mensagem, prova ou público diferentes.", `<div class="grid g2">${motivos.map((m) => `<div class="card"><span class="badge">${esc(m.id)}</span><span class="badge grey">${esc(m.tipo)}</span><span class="badge">${esc(AWARENESS_LABEL[m.consciencia])}</span><h3 style="margin-top:4px">${fmt(m.nome)}</h3><p>${fmt(m.descricao)}</p><p class="muted"><b>Evidência:</b> ${fmt(m.evidencia)}<br><b>Fase:</b> ${esc(PHASE_LABEL[m.fase])}<br><b>Risco:</b> ${fmt(m.risco)}</p></div>`).join("")}</div>`);

  const guide: Record<Awareness, string> = {
    inconsciente: "Abra com situação, sintoma ou descoberta.",
    consciente_problema: "Abra com a dor ou o desejo e mostre que existe saída.",
    consciente_solucao: "Explique o mecanismo, compare opções e mostre uso e prova.",
    consciente_produto: "Reduza risco: prova, uso real, diferenciais e dúvidas.",
    muito_consciente: "Vá direto à oferta, condição, kit, garantia, entrega e CTA.",
  };
  const s5 = section("consciencia", 5, "Níveis de consciência", "O nível decide qual argumento entra primeiro.", `<div class="scroll"><table><tr><th>Nível</th><th>Primeiro argumento</th><th>Territórios</th></tr>${AWARENESS.map((a) => {
    const cs = celulas.filter((c) => c.consciencia === a);
    return `<tr><td>${esc(AWARENESS_LABEL[a])}</td><td>${esc(guide[a])}</td><td>${cs.length === 0 ? '<span class="muted">-</span>' : cs.map((c) => `<span class="badge ${selectedIds.has(c.id) ? "ok" : ""}">${esc(c.id)}</span>`).join("")}</td></tr>`;
  }).join("")}</table></div><p class="muted">Frio: situação, dor, desejo ou descoberta. Morno: mecanismo, comparação, uso e prova. Quente: oferta, condição, kit, garantia, entrega e CTA.</p>`);

  const matrixRows = motivos.map((m) => {
    const cells = PILLARS.map((p) => {
      const c = byId.get(`${m.id}-${p}`);
      if (!c) return `<td class="muted">-</td>`;
      const cls = selectedIds.has(c.id) ? "sel" : c.statusSugerido === "bloqueado" ? "blocked" : "";
      return `<td class="${cls}"><b>${totalScore(c.scores)}/${MAX_SCORE}</b> ${badgeForStatus(c.statusSugerido)}${selectedIds.has(c.id) ? '<span class="badge ok">produzir</span>' : ""}<ol>${c.sementes.map((x) => `<li>${fmt(x)}</li>`).join("")}</ol>${c.observacao ? `<div class="muted">${fmt(c.observacao)}</div>` : ""}</td>`;
    }).join("");
    return `<tr><th>${esc(m.id)} · ${fmt(m.nome)}</th>${cells}</tr>`;
  }).join("");
  const s6 = section("matriz", 6, "Matriz completa", "Linhas: motivos de compra. Colunas: cinco pilares. Cada célula é uma hipótese com três sementes, não uma arte final. Destacadas: selecionadas para produção.", `<div class="scroll"><table class="matrix"><tr><th>Motivo</th>${PILLARS.map((p) => `<th>${esc(PILLAR_LABEL[p])}</th>`).join("")}</tr>${matrixRows}</table></div>`);

  const scoreCols = SCORE_KEYS.map((k) => `<th>${esc(SCORE_LABEL[k])}</th>`).join("");
  const s7 = section("ranking", 7, "Ranking de prioridades", "A matriz abre o mapa; a pontuação (0 a 5 em oito critérios) define a fila. Bloqueadas e pendentes não entram antes das demais.", `<div class="scroll"><table><tr><th>#</th><th>Território</th><th>Status</th>${scoreCols}<th>Total</th></tr>${ranked.slice(0, 20).map((c, i) => `<tr><td>${i + 1}</td><td>${selectedIds.has(c.id) ? "<b>" : ""}${esc(c.id)} · ${esc(pillarLabel(c.pilar))}${selectedIds.has(c.id) ? "</b>" : ""}</td><td>${badgeForStatus(c.statusSugerido)}</td>${SCORE_KEYS.map((k) => `<td>${c.scores[k]}</td>`).join("")}<td><div class="bar"><i style="width:${Math.round((totalScore(c.scores) / MAX_SCORE) * 100)}%"></i></div>${totalScore(c.scores)}</td></tr>`).join("")}</table></div>
<h3>Fila de produção</h3><p>${project.selecionadas.map((s) => `<span class="badge ok">${esc(ROLE_LABEL[s.papel])}: ${esc(s.cellId)}</span>`).join("")}</p>`);

  const s8 = section("galeria", 8, "Galeria dos criativos selecionados", "Mockups estáticos 4:5 editáveis (clique no texto para ajustar). São direcionamento de produção: preço, cashback e prova só entram depois de validados.", `<div class="mocks">${briefings.map((b) => mockup(b, project.imagemProduto)).join("")}</div>`);

  const s9 = section("briefings", 9, "Briefings detalhados", "", briefings.map(briefingBlock).join(""));

  const s10 = section("copies", 10, "Copies de Meta Ads", "Limites sugeridos: texto principal até 300, título até 40, descrição até 30 caracteres.", `<div class="scroll"><table><tr><th>ID</th><th>Texto principal</th><th>Título</th><th>Descrição</th><th>Destino</th></tr>${briefings.map((b) => `<tr><td>${esc(b.id)}</td><td>${fmt(b.copyPrincipal)}<br><span class="muted">${b.copyPrincipal.length} car.</span></td><td>${fmt(b.titulo)}<br><span class="muted">${b.titulo.length} car.</span></td><td>${fmt(b.descricao)}<br><span class="muted">${b.descricao.length} car.</span></td><td>${esc(b.urlDestino)}</td></tr>`).join("")}</table></div>`);

  const s11 = section("placements", 11, "Mapa de placements", "Redimensionar não é adaptar: o que permanece, muda e sai em cada formato.", briefings.map((b) => `<h3>${esc(b.id)} - ${fmt(b.nome)}</h3><div class="scroll"><table><tr><th>Placement</th><th>Permanece</th><th>Muda</th><th>Sai</th><th>Recorte</th><th>Ordem de leitura</th><th>Zona protegida</th><th>Risco de truncamento</th></tr>${PLACEMENTS.map((pl) => { const a = b.adaptacoes[pl]; return `<tr><th>${esc(pl)}</th><td>${fmt(a.permanece)}</td><td>${fmt(a.muda)}</td><td>${fmt(a.sai)}</td><td>${fmt(a.recorte)}</td><td>${fmt(a.ordemLeitura)}</td><td>${fmt(a.zonaProtegida)}</td><td>${fmt(a.riscoTruncamento)}</td></tr>`; }).join("")}</table></div>`).join(""));

  const stageLabel = { exploracao: "Exploração", validacao: "Validação", escala: "Escala" } as const;
  const s12 = section("testes", 12, "Plano de teste", "Exploração compara territórios; validação muda uma variável; escala preserva a hipótese vencedora. Nunca use uma meta única de ROAS como regra universal.", `
<div class="scroll"><table><tr><th>ID</th><th>Estágio</th><th>Hipótese</th><th>Variável</th><th>Controle</th><th>Público</th><th>Placement</th><th>Métrica primária</th><th>Métrica de negócio</th><th>Janela</th><th>Critério de leitura</th><th>Limite econômico</th><th>Aprendizado esperado</th><th>Ação seguinte</th></tr>${(plano?.testes ?? []).map((t) => `<tr><td>${esc(t.id)}</td><td>${esc(stageLabel[t.estagio])}</td><td>${fmt(t.hipotese)}</td><td>${fmt(t.variavel)}</td><td>${fmt(t.controle)}</td><td>${fmt(t.publico)}</td><td>${fmt(t.placement)}</td><td>${fmt(t.metricaPrimaria)}</td><td>${fmt(t.metricaNegocio)}</td><td>${fmt(t.janela)}</td><td>${fmt(t.criterioLeitura)}</td><td>${fmt(t.limiteEconomico)}</td><td>${fmt(t.aprendizadoEsperado)}</td><td>${fmt(t.acaoSeguinte)}</td></tr>`).join("")}</table></div>`);

  const s13 = section("riscos", 13, "Diagnóstico de riscos", "", `<div class="scroll"><table><tr><th>Risco</th><th>Severidade</th><th>Mitigação</th></tr>${(plano?.riscos ?? []).map((r) => `<tr><td>${fmt(r.risco)}</td><td><span class="badge ${r.severidade === "alta" ? "bad" : r.severidade === "media" ? "warn" : "grey"}">${esc(r.severidade)}</span></td><td>${fmt(r.mitigacao)}</td></tr>`).join("")}</table></div>
<h3>Quando o resultado cair, diferencie a causa</h3><div class="grid g2">
<div class="card"><b>Fadiga visual</b><br>Nova execução do mesmo conceito recupera o resultado: refresh cosmético.</div>
<div class="card"><b>Saturação de ângulo</b><br>Várias execuções do mesmo território perdem força: novo ângulo.</div>
<div class="card"><b>Problema de destino</b><br>Clique forte e conversão fraca: revisar a página.</div>
<div class="card"><b>Problema comercial ou de público</b><br>Preço, frete, prazo ou oferta não sustentam a promessa, ou há atenção sem intenção de compra.</div></div>`);

  const s14 = section("health", 14, "Health Score", "Estimativa do agente, com tetos objetivos: sem prova real a nota de prova não passa de 6; sem CPA máximo, a de coerência econômica não passa de 5.", `
<p><span class="verdict v-${verdict.tone}">${avg.toFixed(1).replace(".", ",")} / 10 - ${esc(verdict.label)}</span></p>
<div class="scroll"><table><tr><th>Critério</th><th>Nota</th><th>Justificativa</th></tr>${(healthRows.length > 0 ? healthRows : HEALTH_CRITERIA.map((c) => ({ criterio: c, nota: 0, justificativa: "" }))).map((h) => `<tr><td>${esc(h.criterio)}</td><td><div class="bar"><i style="width:${Math.round(h.nota * 10)}%"></i></div>${h.nota.toFixed(1).replace(".", ",")}</td><td>${fmt(h.justificativa)}</td></tr>`).join("")}</table></div>
<p class="muted">0 a 3 crítico · 4 a 6 atenção · 7 a 8 pronto para produzir e testar · 9 a 10 sistema maduro.</p>`);

  const s15 = section("passos", 15, "Próximos passos", "", list(plano?.proximosPassos ?? []) + `<h3>Handoff para o tráfego</h3><p class="muted">Para cada criativo: ID, público, dor, ângulo, formato, placement, hipótese, métrica, destino e limite econômico (ver briefings e plano de teste).</p>`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Matriz Criativa de Black Friday - ${esc(brief.produto || brief.marca)}</title><style>${CSS}</style></head><body><main>${cover}${toc}${s1}${s2}${s3}${s4}${s5}${s6}${s7}${s8}${s9}${s10}${s11}${s12}${s13}${s14}${s15}<footer>Hipóteses para produção e teste. Preço, cashback, frete, prazo, garantia e provas só entram na arte depois de validados. Gerado pelo Agente Matriz Criativa do CRM.</footer></main></body></html>`;
}

