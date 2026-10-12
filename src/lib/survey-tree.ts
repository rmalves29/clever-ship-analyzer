/**
 * Pesquisa como ÁRVORE: cada pergunta é um nó; cada resposta pode levar a outra pergunta (ou encerrar) e gravar etiquetas.
 * Tudo aqui é puro (sem React/servidor) e compatível com pesquisas antigas: sem `next`/`branches`/`tags` a pesquisa
 * continua sendo a lista de perguntas em ordem.
 */

export const FIM = "__fim";

export type SurveyNodeType =
  | "texto_curto"
  | "texto_longo"
  | "multipla_escolha"
  | "escolha_unica"
  | "nota"
  | "sim_nao"
  /** Só mostra um texto (ex.: "já passei para a nossa equipe") e segue — não recebe resposta. */
  | "mensagem";

export type SurveyBranch = {
  /** Destino ao escolher esta resposta: id de uma pergunta, FIM, ou vazio = seguir a ordem. */
  next?: string | null;
  tags?: string[];
  /** Ação interna da equipe quando a resposta é escolhida (ex.: "Avisar a expedição"). Só descrição; não envia nada sozinha. */
  action?: string;
};

export type TreeQuestion = {
  id: string;
  type: SurveyNodeType;
  label: string;
  required: boolean;
  options?: string[];
  shuffleOptions?: boolean;
  /** Destino padrão (quando a resposta não tem destino próprio): id, FIM ou vazio = próxima da lista. */
  next?: string | null;
  /** Roteamento e etiquetas por resposta (chave = texto da opção; Sim/Não; 1 a 5). */
  branches?: Record<string, SurveyBranch>;
  /** Etiquetas gravadas para qualquer resposta desta pergunta. */
  tags?: string[];
  /** Ação interna da equipe ao passar por esta pergunta (ex.: "Abrir atendimento com prioridade alta"). */
  action?: string;
};

export type TreeAnswers = Record<string, string | string[] | undefined>;

/** Respostas que podem ter destino/etiqueta próprios. */
export function optionKeys(q: TreeQuestion): string[] {
  switch (q.type) {
    case "sim_nao":
      return ["Sim", "Não"];
    case "nota":
      return ["1", "2", "3", "4", "5"];
    case "escolha_unica":
    case "multipla_escolha":
      return q.options ?? [];
    default:
      return [];
  }
}

/** Só a escolha única tem destino por resposta; na múltipla escolha cada opção só grava etiqueta. */
export function routesByOption(q: TreeQuestion): boolean {
  return q.type === "escolha_unica" || q.type === "sim_nao" || q.type === "nota";
}

/** A pesquisa usa a árvore (algum destino ou etiqueta definido, ou pergunta do tipo mensagem)? Senão é o formulário simples. */
export function isBranching(questions: readonly TreeQuestion[]): boolean {
  return questions.some(
    (q) =>
      q.type === "mensagem" ||
      (q.next !== undefined && q.next !== null && q.next !== "") ||
      (q.tags?.length ?? 0) > 0 ||
      Object.values(q.branches ?? {}).some((b) => (b.next !== undefined && b.next !== null && b.next !== "") || (b.tags?.length ?? 0) > 0),
  );
}

function defaultNextId(questions: readonly TreeQuestion[], index: number): string {
  return questions[index + 1]?.id ?? FIM;
}

/** Destino depois de responder `q` com `answer`. Destino que não existe mais (pergunta apagada) cai na ordem normal. */
export function nextQuestionId(
  questions: readonly TreeQuestion[],
  q: TreeQuestion,
  answer: string | string[] | undefined,
): string {
  const index = questions.findIndex((x) => x.id === q.id);
  const valid = (id: string | null | undefined): id is string =>
    typeof id === "string" && id !== "" && (id === FIM || questions.some((x) => x.id === id));
  if (routesByOption(q) && typeof answer === "string") {
    const branch = q.branches?.[answer];
    if (valid(branch?.next)) return branch.next;
  }
  if (valid(q.next)) return q.next;
  return defaultNextId(questions, index);
}

/** Perguntas percorridas, na ordem, seguindo as respostas dadas. Para quando falta resposta, chega ao fim ou repete (laço). */
export function resolvePath(questions: readonly TreeQuestion[], answers: TreeAnswers): TreeQuestion[] {
  const path: TreeQuestion[] = [];
  const seen = new Set<string>();
  let current: TreeQuestion | undefined = questions[0];
  while (current && !seen.has(current.id)) {
    path.push(current);
    seen.add(current.id);
    const answer = answers[current.id];
    const answered = current.type === "mensagem" || (Array.isArray(answer) ? answer.length > 0 : typeof answer === "string" && answer.trim() !== "");
    if (!answered) break;
    const nextId = nextQuestionId(questions, current, answer);
    current = nextId === FIM ? undefined : questions.find((x) => x.id === nextId);
  }
  return path;
}

/** Etiquetas gravadas pelas respostas dadas no caminho percorrido (sem repetir). */
export function collectTags(questions: readonly TreeQuestion[], answers: TreeAnswers): string[] {
  const out = new Set<string>();
  for (const q of resolvePath(questions, answers)) {
    const answer = answers[q.id];
    const answered = Array.isArray(answer) ? answer.length > 0 : typeof answer === "string" && answer.trim() !== "";
    if (!answered && q.type !== "mensagem") continue;
    for (const t of q.tags ?? []) out.add(t);
    const chosen = Array.isArray(answer) ? answer : typeof answer === "string" ? [answer] : [];
    for (const c of chosen) for (const t of q.branches?.[c]?.tags ?? []) out.add(t);
  }
  return [...out];
}

/** Perguntas obrigatórias que o caminho percorrido exige e que ainda estão sem resposta. */
export function missingRequired(questions: readonly TreeQuestion[], answers: TreeAnswers): TreeQuestion[] {
  return resolvePath(questions, answers).filter((q) => {
    if (!q.required || q.type === "mensagem") return false;
    const v = answers[q.id];
    return v === undefined || (Array.isArray(v) ? v.length === 0 : v.trim() === "");
  });
}

/** Normaliza etiqueta: minúsculas, sem acento, só letras/números/_ (ex.: "Evento 7d" -> "evento_7d"). */
export function normalizeTag(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseTags(input: string): string[] {
  return [...new Set(input.split(/[,;\n]/).map(normalizeTag).filter(Boolean))];
}

// ---------------------------------------------------------------------------------------------- visualização

export type TreeEdge = {
  from: string;
  /** Índice da opção na lista do nó, ou "x" para o destino padrão. */
  key: string;
  to: string;
  label: string;
  tags: string[];
  /** Ação interna da equipe ligada a esta resposta (texto livre), se houver. */
  action?: string;
  /** Destino definido de propósito (true) ou apenas "seguir a ordem" (false). */
  explicit: boolean;
};

export type TreeLayout = {
  /** Colunas por profundidade (a partir da 1ª pergunta); a última pode conter o nó virtual FIM. */
  columns: string[][];
  edges: TreeEdge[];
  /** Perguntas que nenhum caminho alcança a partir da primeira. */
  unreachable: string[];
  hasEnd: boolean;
};

export function buildEdges(questions: readonly TreeQuestion[]): TreeEdge[] {
  const edges: TreeEdge[] = [];
  questions.forEach((q, index) => {
    const fallback = (() => {
      const valid = typeof q.next === "string" && q.next !== "" && (q.next === FIM || questions.some((x) => x.id === q.next));
      return valid ? { to: q.next as string, explicit: true } : { to: defaultNextId(questions, index), explicit: false };
    })();
    if (routesByOption(q)) {
      optionKeys(q).forEach((opt, i) => {
        const b = q.branches?.[opt];
        const own = typeof b?.next === "string" && b.next !== "" && (b.next === FIM || questions.some((x) => x.id === b.next));
        edges.push({
          from: q.id,
          key: String(i),
          to: own ? (b!.next as string) : fallback.to,
          label: opt,
          tags: b?.tags ?? [],
          ...(b?.action ? { action: b.action } : {}),
          explicit: own || fallback.explicit,
        });
      });
    } else {
      const tagsFromOptions = q.type === "multipla_escolha" ? [...new Set(optionKeys(q).flatMap((o) => q.branches?.[o]?.tags ?? []))] : [];
      edges.push({
        from: q.id,
        key: "x",
        to: fallback.to,
        label: q.type === "mensagem" ? "Segue" : "Qualquer resposta",
        tags: tagsFromOptions,
        explicit: fallback.explicit,
      });
    }
  });
  return edges;
}

/** Colunas por profundidade (busca em largura) como no desenho da árvore. */
export function buildTreeLayout(questions: readonly TreeQuestion[]): TreeLayout {
  const edges = buildEdges(questions);
  const out = new Map<string, TreeEdge[]>();
  for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e]);
  const depth = new Map<string, number>();
  const order: string[] = [];
  const queue: [string, number][] = questions[0] ? [[questions[0].id, 0]] : [];
  while (queue.length > 0) {
    const [id, d] = queue.shift() as [string, number];
    if (depth.has(id)) continue;
    depth.set(id, d);
    order.push(id);
    for (const e of out.get(id) ?? []) if (!depth.has(e.to)) queue.push([e.to, d + 1]);
  }
  const columns: string[][] = [];
  for (const id of order) (columns[depth.get(id) as number] ??= []).push(id);
  const unreachable = questions.filter((q) => !depth.has(q.id)).map((q) => q.id);
  return { columns: columns.filter(Boolean), edges, unreachable, hasEnd: depth.has(FIM) };
}

export type TagRow = { tag: string; when: string; questionId: string; position: number };

/** Dicionário de etiquetas: onde cada uma é gravada. */
export function buildTagDictionary(questions: readonly TreeQuestion[]): TagRow[] {
  const rows: TagRow[] = [];
  questions.forEach((q, i) => {
    for (const t of q.tags ?? []) rows.push({ tag: t, when: q.label, questionId: q.id, position: i + 1 });
    for (const [opt, b] of Object.entries(q.branches ?? {})) {
      for (const t of b.tags ?? []) rows.push({ tag: t, when: `${q.label}: “${opt}”`, questionId: q.id, position: i + 1 });
    }
  });
  return rows;
}

/** Remove referências a perguntas que deixaram de existir (ao apagar uma pergunta). */
export function pruneDanglingRefs<T extends TreeQuestion>(questions: readonly T[]): T[] {
  const ids = new Set(questions.map((q) => q.id));
  const ok = (id: string | null | undefined) => id === undefined || id === null || id === "" || id === FIM || ids.has(id);
  return questions.map((q) => {
    const branches = q.branches
      ? Object.fromEntries(Object.entries(q.branches).map(([k, b]) => [k, ok(b.next) ? b : { ...b, next: null }]))
      : undefined;
    return { ...q, ...(ok(q.next) ? {} : { next: null }), ...(branches ? { branches } : {}) };
  });
}

// ---------------------------------------------------------------------------------------------- textos com variáveis

/** Variáveis aceitas nos textos da pesquisa: {nome}, {pedido}, {interesse}. */
export type SurveyVars = { nome?: string | null | undefined; pedido?: string | null | undefined; interesse?: string | null | undefined };

/**
 * Troca {nome}/{pedido}/{interesse} pelos valores conhecidos. Variável sem valor some junto com a pontuação que a prendia
 * ("Oi, {nome}!" vira "Oi!"), para o texto nunca sair com chaves nem com "Oi, !".
 */
export function fillPlaceholders(text: string, vars: SurveyVars): string {
  let out = text;
  for (const key of ["nome", "pedido", "interesse"] as const) {
    const value = (vars[key] ?? "").toString().trim();
    out = out.replace(new RegExp(`\{${key}\}`, "g"), value);
  }
  return out
    .replace(/,\s+([!?.,:;])/g, "$1")
    .replace(/#\s*(?=[\s.,!?]|$)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([!?.,:;])/g, "$1")
    .trim();
}

/** Trechos entre colchetes ("[mimo aprovado]", "[link da coleção]"): decisões da loja ainda não preenchidas. */
export function findPendingPlaceholders(text: string): string[] {
  return [...text.matchAll(/\[([^\]]{2,80})\]/g)].map((m) => m[1] as string);
}
