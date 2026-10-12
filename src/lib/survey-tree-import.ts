/**
 * Importa árvores de pesquisa de um JSON no formato do material de pesquisas (id, nome, quando, publico, canal, objetivo,
 * nos[], regras[]) e converte cada árvore para as perguntas do sistema (nós = perguntas; respostas com destino,
 * etiquetas e ação). Puro e testável.
 */
import { FIM, findPendingPlaceholders, normalizeTag, type SurveyBranch, type TreeQuestion } from "./survey-tree";

export type ImportNode = {
  id: string;
  titulo?: string;
  tipo: "botoes" | "lista" | "texto" | "acao" | "fim";
  msg: string;
  opcoes?: { r: string; prox: string | null; tags?: string[]; acao?: string }[];
  prox?: string | null;
  tags?: string[];
  acao?: string;
};

export type ImportTree = {
  id: string;
  nome: string;
  quando?: string;
  publico?: string;
  canal?: string;
  objetivo?: string;
  nos: ImportNode[];
  regras?: string[];
};

export type ImportWarning = { code: "ref_inexistente" | "titulo_longo" | "muitas_opcoes" | "pendente_loja" | "sem_inicio"; node?: string; detail: string };

export type ConvertedTree = {
  code: string;
  title: string;
  description: string;
  /** Link da pesquisa existente que esta árvore substitui (se houver). */
  slug: string;
  questions: TreeQuestion[];
  thankYou: string;
  warnings: ImportWarning[];
};

/** Código da árvore (P1…P5) -> link da pesquisa que já existe no sistema. */
export const TREE_SLUGS: Record<string, string> = {
  P1: "pos-compra",
  P2: "pos-entrega",
  P3: "pos-uso",
  P4: "quem-nao-voltou",
  P5: "pre-black-friday",
};

const BUTTON_MAX = 20; // botão de resposta rápida do WhatsApp
const LIST_ROW_MAX = 24; // linha de lista do WhatsApp
const LIST_MAX_ROWS = 10;

export function parseTreesJson(text: string): ImportTree[] {
  const raw = JSON.parse(text) as unknown;
  const list = Array.isArray(raw) ? raw : [raw];
  const trees = list.filter((t): t is ImportTree => typeof t === "object" && t !== null && Array.isArray((t as ImportTree).nos) && typeof (t as ImportTree).nome === "string");
  if (trees.length === 0) throw new Error("O arquivo não tem nenhuma árvore de pesquisa no formato esperado (id, nome, nos).");
  return trees;
}

const cleanTags = (tags: string[] | undefined) => [...new Set((tags ?? []).map(normalizeTag).filter(Boolean))];

export function convertTree(tree: ImportTree): ConvertedTree {
  const warnings: ImportWarning[] = [];
  const ids = new Set(tree.nos.map((n) => n.id));
  const refOk = (to: string | null | undefined, from: string) => {
    if (!to) return true;
    if (ids.has(to)) return true;
    warnings.push({ code: "ref_inexistente", node: from, detail: `aponta para "${to}", que não existe` });
    return false;
  };

  const questions: TreeQuestion[] = tree.nos.map((n) => {
    const base = { id: n.id, label: n.msg.trim(), required: false } as const;
    const tags = cleanTags(n.tags);
    const pending = findPendingPlaceholders(n.msg);
    if (pending.length > 0) warnings.push({ code: "pendente_loja", node: n.id, detail: `texto depende de decisão da loja: ${pending.map((p) => `[${p}]`).join(" ")}` });

    if (n.tipo === "botoes" || n.tipo === "lista") {
      const options = (n.opcoes ?? []).map((o) => o.r.trim()).filter(Boolean);
      if (n.tipo === "botoes" && options.length > 3) warnings.push({ code: "muitas_opcoes", node: n.id, detail: `${options.length} opções em botões (máximo 3 no WhatsApp)` });
      if (n.tipo === "lista" && options.length > LIST_MAX_ROWS) warnings.push({ code: "muitas_opcoes", node: n.id, detail: `${options.length} opções em lista (máximo 10 no WhatsApp)` });
      for (const o of options) {
        const max = n.tipo === "botoes" ? BUTTON_MAX : LIST_ROW_MAX;
        if (o.length > max) warnings.push({ code: "titulo_longo", node: n.id, detail: `"${o}" tem ${o.length} caracteres (máximo ${max} no WhatsApp)` });
      }
      const branches: Record<string, SurveyBranch> = {};
      for (const o of n.opcoes ?? []) {
        const label = o.r.trim();
        if (!label) continue;
        refOk(o.prox, n.id);
        const op = findPendingPlaceholders(o.acao ?? "");
        if (op.length > 0) warnings.push({ code: "pendente_loja", node: n.id, detail: `ação depende de decisão da loja: ${op.map((p) => `[${p}]`).join(" ")}` });
        branches[label] = {
          ...(o.prox && ids.has(o.prox) ? { next: o.prox } : {}),
          ...(cleanTags(o.tags).length > 0 ? { tags: cleanTags(o.tags) } : {}),
          ...(o.acao?.trim() ? { action: o.acao.trim() } : {}),
        };
      }
      const q: TreeQuestion = { ...base, type: "escolha_unica", options, branches };
      if (tags.length > 0) q.tags = tags;
      if (n.acao?.trim()) q.action = n.acao.trim();
      return q;
    }

    refOk(n.prox, n.id);
    const next = n.tipo === "fim" ? FIM : n.prox && ids.has(n.prox) ? n.prox : null;
    const type = n.tipo === "texto" ? ("texto_curto" as const) : ("mensagem" as const);
    const q: TreeQuestion = { ...base, type };
    if (next) q.next = next;
    if (tags.length > 0) q.tags = tags;
    if (n.acao?.trim()) {
      q.action = n.acao.trim();
      const ap = findPendingPlaceholders(n.acao);
      if (ap.length > 0) warnings.push({ code: "pendente_loja", node: n.id, detail: `ação depende de decisão da loja: ${ap.map((p) => `[${p}]`).join(" ")}` });
    }
    return q;
  });

  if (questions.length === 0) warnings.push({ code: "sem_inicio", detail: "árvore sem nós" });

  const finalNode = tree.nos.find((n) => n.tipo === "fim" && n.tags?.some((t) => t.startsWith("respondeu_")));
  const description = [
    tree.objetivo ? `Objetivo: ${tree.objetivo}` : "",
    tree.quando ? `Quando: ${tree.quando}.` : "",
    tree.publico ? `Para quem: ${tree.publico}.` : "",
    tree.canal ? `Canal: ${tree.canal}.` : "",
    ...(tree.regras ?? []).map((r) => `• ${r}`),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    code: tree.id,
    title: `${tree.id} · ${tree.nome}`,
    description,
    slug: TREE_SLUGS[tree.id] ?? `pesquisa-${normalizeTag(tree.nome).replace(/_/g, "-")}`,
    questions,
    thankYou: finalNode?.msg ?? "Obrigada por participar da pesquisa!",
    warnings,
  };
}
