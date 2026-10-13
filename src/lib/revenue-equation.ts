/**
 * Equação da receita da base:
 *
 *   Receita da base = Clientes ativos × Taxa de recompra × Receita por cliente que recomprou
 *
 * - Clientes ativos: quem tinha ao menos 1 pedido válido nos 12 meses ANTES do início da janela.
 * - Taxa de recompra: % desses clientes que voltaram a comprar dentro da janela.
 * - Receita por cliente que recomprou: soma dos pedidos válidos deles na janela ÷ quantos recompraram.
 *
 * O restante da receita da janela vem de clientes novos (nunca tinham comprado) e de reativados
 * (compraram há mais de 12 meses). Tudo puro — a busca no banco fica em `revenue-equation.functions.ts`.
 *
 * A "leitura do gargalo" compara cada fator com a MEDIANA das janelas anteriores da própria loja e
 * escolhe o fator cujo retorno ao nível habitual mais valeria em reais. Sem limites inventados.
 */

export const EQUATION_LOOKBACK_DAYS = 365;
export const EQUATION_WINDOWS = [30, 60, 90] as const;
export type EquationWindowDays = (typeof EQUATION_WINDOWS)[number];
export const EQUATION_MIN_SAMPLE = 5;
/** Quantas janelas anteriores entram na referência. */
export const EQUATION_REFERENCE_WINDOWS = 5;
/** Abaixo disso (fração da receita da base) o desvio é ruído, não gargalo. */
export const EQUATION_MATERIALITY = 0.05;

const DAY = 86_400_000;

export type EquationOrder = { customerId: string; at: number; total: number };

export type EquationWindow = {
  startMs: number;
  endMs: number;
  baseAtiva: number;
  recompradores: number;
  /** % da base ativa que comprou na janela. */
  taxa: number;
  pedidosBase: number;
  receitaBase: number;
  receitaPorRecomprador: number;
  ticketPedido: number;
  clientesNovos: number;
  receitaNovos: number;
  clientesReativados: number;
  receitaReativados: number;
  receitaTotal: number;
};

type CustomerOrders = { at: number[]; total: number[] };

export function groupOrdersByCustomer(orders: readonly EquationOrder[]): Map<string, CustomerOrders> {
  const map = new Map<string, CustomerOrders>();
  const sorted = [...orders].sort((a, b) => a.at - b.at);
  for (const o of sorted) {
    if (!o.customerId || !Number.isFinite(o.at)) continue;
    const entry = map.get(o.customerId) ?? { at: [], total: [] };
    entry.at.push(o.at);
    entry.total.push(Number.isFinite(o.total) ? o.total : 0);
    map.set(o.customerId, entry);
  }
  return map;
}

export function computeEquationWindow(
  byCustomer: Map<string, CustomerOrders>,
  startMs: number,
  endMs: number,
  lookbackDays = EQUATION_LOOKBACK_DAYS,
): EquationWindow {
  const lookbackStart = startMs - lookbackDays * DAY;
  let baseAtiva = 0;
  let recompradores = 0;
  let pedidosBase = 0;
  let receitaBase = 0;
  let clientesNovos = 0;
  let receitaNovos = 0;
  let clientesReativados = 0;
  let receitaReativados = 0;

  for (const { at, total } of byCustomer.values()) {
    let active = false;
    let before = false;
    let n = 0;
    let sum = 0;
    for (let i = 0; i < at.length; i++) {
      const t = at[i]!;
      if (t < startMs) {
        before = true;
        if (t >= lookbackStart) active = true;
      } else if (t < endMs) {
        n++;
        sum += total[i]!;
      } else break;
    }
    if (active) {
      baseAtiva++;
      if (n > 0) {
        recompradores++;
        pedidosBase += n;
        receitaBase += sum;
      }
    } else if (n > 0) {
      if (before) {
        clientesReativados++;
        receitaReativados += sum;
      } else {
        clientesNovos++;
        receitaNovos += sum;
      }
    }
  }

  return {
    startMs,
    endMs,
    baseAtiva,
    recompradores,
    taxa: baseAtiva > 0 ? (recompradores / baseAtiva) * 100 : 0,
    pedidosBase,
    receitaBase,
    receitaPorRecomprador: recompradores > 0 ? receitaBase / recompradores : 0,
    ticketPedido: pedidosBase > 0 ? receitaBase / pedidosBase : 0,
    clientesNovos,
    receitaNovos,
    clientesReativados,
    receitaReativados,
    receitaTotal: receitaBase + receitaNovos + receitaReativados,
  };
}

export type EquationSeries = {
  windowDays: number;
  current: EquationWindow;
  previous: EquationWindow | null;
  /** Janelas anteriores com amostra suficiente (da mais recente para a mais antiga). */
  references: EquationWindow[];
  firstOrderMs: number | null;
};

export function computeEquationSeries(orders: readonly EquationOrder[], windowDays: number, nowMs: number): EquationSeries {
  const byCustomer = groupOrdersByCustomer(orders);
  let firstOrderMs: number | null = null;
  for (const { at } of byCustomer.values()) {
    const t = at[0]!;
    if (firstOrderMs === null || t < firstOrderMs) firstOrderMs = t;
  }
  const span = windowDays * DAY;
  const windowAt = (k: number) => computeEquationWindow(byCustomer, nowMs + 1 - (k + 1) * span, nowMs + 1 - k * span);
  const current = windowAt(0);
  const previous = windowAt(1);
  const references: EquationWindow[] = [];
  for (let k = 1; k <= EQUATION_REFERENCE_WINDOWS; k++) {
    const w = k === 1 ? previous : windowAt(k);
    const hasHistory = firstOrderMs !== null && w.startMs >= firstOrderMs + span;
    if (hasHistory && w.baseAtiva >= EQUATION_MIN_SAMPLE && w.recompradores > 0) references.push(w);
  }
  return { windowDays, current, previous: previous.baseAtiva > 0 || previous.receitaTotal > 0 ? previous : null, references, firstOrderMs };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type EquationFactor = "base" | "taxa" | "valor";

export const FACTOR_LABEL: Record<EquationFactor, string> = {
  base: "Clientes ativos",
  taxa: "Taxa de recompra",
  valor: "Receita por cliente que recomprou",
};

export type EquationAction = { label: string; to: string };

export type EquationFactorReading = {
  factor: EquationFactor;
  current: number;
  /** Mediana das janelas anteriores (null sem histórico suficiente). */
  reference: number | null;
  /** Variação do fator contra a janela imediatamente anterior (%). */
  vsPrevious: number | null;
  /** Variação contra a mediana das janelas anteriores (%). */
  vsReference: number | null;
  /** Quanto a receita da base subiria se o fator voltasse à mediana (R$). 0 se já está acima. */
  impactoReais: number;
};

/** Contra o que cada fator foi comparado: mediana das janelas anteriores, só a janela anterior ou nada (leitura estrutural). */
export type EquationBasis = "mediana" | "janela-anterior" | "estrutural";

export type EquationDiagnosis = {
  basis: EquationBasis;
  status: "sem-dados" | "gargalo" | "estavel";
  factor: EquationFactor | null;
  titulo: string;
  texto: string;
  acoes: EquationAction[];
  observacoes: string[];
  factors: EquationFactorReading[];
};

const ACTIONS: Record<EquationFactor, EquationAction[]> = {
  taxa: [
    { label: "Régua de segunda compra", to: "/crm/reguas/primeira-segunda" },
    { label: "Automações por evento", to: "/whatsapp/automacoes" },
    { label: "Cashback", to: "/cashback" },
  ],
  valor: [
    { label: "Nova campanha (kits e combos)", to: "/whatsapp/nova" },
    { label: "Cashback com compra mínima", to: "/cashback" },
    { label: "Segmentos de maior ticket", to: "/crm/segmentos" },
  ],
  base: [
    { label: "Pop-ups de captação", to: "/popups" },
    { label: "Landing pages", to: "/landing-pages" },
    { label: "Reativar quem sumiu (RFM)", to: "/crm" },
  ],
};

const pctChange = (current: number, base: number | null | undefined): number | null =>
  base && base > 0 ? ((current - base) / base) * 100 : null;

function factorValue(w: EquationWindow, f: EquationFactor): number {
  return f === "base" ? w.baseAtiva : f === "taxa" ? w.taxa : w.receitaPorRecomprador;
}

const dec1 = (v: number) => v.toFixed(1).replace(".", ",");
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function diagnoseEquation(series: EquationSeries, ticketGoal?: { meta: number; regular: number }): EquationDiagnosis {
  const { current, previous, references } = series;
  const factorsList: EquationFactor[] = ["base", "taxa", "valor"];

  const readings: EquationFactorReading[] = factorsList.map((factor) => {
    const cur = factorValue(current, factor);
    const refValues = references.map((w) => factorValue(w, factor)).filter((v) => v > 0);
    const reference = refValues.length >= 2 ? median(refValues) : refValues.length === 1 ? refValues[0]! : null;
    const impacto = reference !== null && cur > 0 && reference > cur ? current.receitaBase * (reference / cur - 1) : 0;
    return {
      factor,
      current: cur,
      reference,
      vsPrevious: previous ? pctChange(cur, factorValue(previous, factor)) : null,
      vsReference: reference !== null ? pctChange(cur, reference) : null,
      impactoReais: impacto,
    };
  });

  const basis: EquationBasis = references.length >= 2 ? "mediana" : references.length === 1 ? "janela-anterior" : "estrutural";
  const refName = basis === "mediana" ? "sua própria mediana" : "a janela anterior";
  const observacoes: string[] = [];
  if (current.receitaTotal > 0) {
    const shareBase = (current.receitaBase / current.receitaTotal) * 100;
    const shareNovos = (current.receitaNovos / current.receitaTotal) * 100;
    observacoes.push(
      `${shareBase.toFixed(0)}% da receita do período veio de clientes que já tinham comprado nos 12 meses anteriores; ${shareNovos.toFixed(0)}% de clientes novos.`,
    );
    if (shareNovos >= 75) observacoes.push("A receita depende quase só de aquisição: qualquer alta no custo da mídia aparece direto no faturamento.");
  }
  if (ticketGoal && current.ticketPedido > 0) {
    if (current.ticketPedido < ticketGoal.regular) {
      observacoes.push(`Ticket por pedido da base (${brl(current.ticketPedido)}) abaixo do mínimo aceitável da loja (${brl(ticketGoal.regular)}).`);
    } else if (current.ticketPedido < ticketGoal.meta) {
      observacoes.push(`Ticket por pedido da base (${brl(current.ticketPedido)}) entre o mínimo (${brl(ticketGoal.regular)}) e a meta (${brl(ticketGoal.meta)}).`);
    }
  }
  if (series.firstOrderMs !== null && basis !== "mediana") {
    observacoes.push(
      basis === "janela-anterior"
        ? "Histórico ainda curto: a leitura compara só com a janela anterior; fica mais precisa conforme os meses passam."
        : "Ainda não há janelas anteriores com base suficiente para comparar; esta é uma leitura estrutural, sem comparação com o seu normal.",
    );
  }

  if (current.baseAtiva < EQUATION_MIN_SAMPLE) {
    return {
      basis,
      status: "sem-dados",
      factor: null,
      titulo: "Base ainda pequena para uma leitura",
      texto: `Só ${current.baseAtiva} cliente(s) ativo(s) nos 12 meses anteriores a esta janela — a equação precisa de pelo menos ${EQUATION_MIN_SAMPLE}.`,
      acoes: ACTIONS.base,
      observacoes,
      factors: readings,
    };
  }

  if (basis === "estrutural") {
    const shareNovos = current.receitaTotal > 0 ? (current.receitaNovos / current.receitaTotal) * 100 : 0;
    if (shareNovos >= 75) {
      return {
        basis,
        status: "gargalo",
        factor: "taxa",
        titulo: "Gargalo: quase ninguém da base voltou a comprar",
        texto: `Só ${dec1(current.taxa)}% dos ${current.baseAtiva.toLocaleString("pt-BR")} clientes ativos compraram de novo na janela, e ${shareNovos.toFixed(0)}% da receita veio de clientes novos. Ainda não há histórico para comparar com o seu normal, então esta é a leitura estrutural: a base existe, mas não está retornando.`,
        acoes: ACTIONS.taxa,
        observacoes,
        factors: readings,
      };
    }
    return {
      basis,
      status: "estavel",
      factor: null,
      titulo: "Sem histórico para comparar ainda",
      texto: "A equação está calculada, mas ainda não há janelas anteriores com base suficiente para dizer o que está fora do normal.",
      acoes: ACTIONS.base,
      observacoes,
      factors: readings,
    };
  }

  const top = [...readings].sort((a, b) => b.impactoReais - a.impactoReais)[0]!;
  if (top.impactoReais >= current.receitaBase * EQUATION_MATERIALITY && top.reference !== null) {
    const rel = top.vsReference !== null ? Math.abs(top.vsReference).toFixed(0) : "";
    const textoPorFator: Record<EquationFactor, string> = {
      taxa: `Só ${dec1(current.taxa)}% da base ativa voltou a comprar na janela, ${rel}% abaixo de ${refName} (${dec1(top.reference)}%). Se a taxa voltasse ao normal, a receita da base subiria cerca de ${brl(top.impactoReais)}.`,
      valor: `Cada cliente que recomprou deixou ${brl(current.receitaPorRecomprador)}, ${rel}% abaixo de ${refName} (${brl(top.reference)}). Voltando ao normal, a receita da base subiria cerca de ${brl(top.impactoReais)}.`,
      base: `A base ativa (${current.baseAtiva.toLocaleString("pt-BR")} clientes) está ${rel}% abaixo de ${refName} (${Math.round(top.reference).toLocaleString("pt-BR")}). Voltando ao normal, a receita da base subiria cerca de ${brl(top.impactoReais)}.`,
    };
    const titulo: Record<EquationFactor, string> = {
      taxa: "Gargalo: poucos clientes estão voltando",
      valor: "Gargalo: o valor de cada recompra caiu",
      base: "Gargalo: a base de clientes ativos encolheu",
    };
    return { basis, status: "gargalo", factor: top.factor, titulo: titulo[top.factor], texto: textoPorFator[top.factor], acoes: ACTIONS[top.factor], observacoes, factors: readings };
  }

  // Nenhum fator abaixo do normal. Se a receita ainda vem quase toda de clientes novos, o espaço está na recompra.
  const shareNovosAgora = current.receitaTotal > 0 ? (current.receitaNovos / current.receitaTotal) * 100 : 0;
  if (shareNovosAgora >= 75) {
    const trend =
      basis === "mediana" ? "dentro do seu normal" : "sem piora em relação à janela anterior";
    return {
      basis,
      status: "gargalo",
      factor: "taxa",
      titulo: "Gargalo: a receita ainda depende de clientes novos",
      texto: `${shareNovosAgora.toFixed(0)}% da receita da janela veio de clientes novos e só ${dec1(current.taxa)}% dos ${current.baseAtiva.toLocaleString("pt-BR")} clientes ativos voltaram a comprar. Nenhum fator piorou (${trend}), mas é na recompra que há mais espaço para crescer sem depender do custo da mídia.`,
      acoes: ACTIONS.taxa,
      observacoes,
      factors: readings,
    };
  }

  // Indica a alavanca com mais espaço até a melhor janela recente.
  const best = (f: EquationFactor) => Math.max(0, ...references.map((w) => factorValue(w, f)));
  const headroom = readings
    .map((r) => ({ f: r.factor, gap: r.current > 0 ? best(r.factor) / r.current - 1 : 0 }))
    .sort((a, b) => b.gap - a.gap)[0]!;
  const lever = headroom.gap > 0.05 ? headroom.f : null;
  return {
    basis,
    status: "estavel",
    factor: lever,
    titulo: "Nenhum fator está abaixo do seu normal",
    texto: lever
      ? `A equação está dentro do habitual. A alavanca com mais espaço é "${FACTOR_LABEL[lever].toLowerCase()}": a melhor janela recente chegou ${(headroom.gap * 100).toFixed(0)}% acima do nível atual.`
      : basis === "mediana"
        ? "A equação está dentro do habitual e perto das melhores janelas recentes. O crescimento agora vem de ampliar a base de clientes ativos."
        : "Em relação à janela anterior nenhum fator piorou. O crescimento agora vem de ampliar a base de clientes ativos.",
    acoes: lever ? ACTIONS[lever] : ACTIONS.base,
    observacoes,
    factors: readings,
  };
}
