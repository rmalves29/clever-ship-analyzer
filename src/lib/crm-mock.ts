import type { ProductAbcRow } from "./product-abc-curve-shared";

export type PeriodKey = "diario" | "semanal" | "mensal" | "anual" | "tudo" | "personalizado";

export type Status = "critico" | "regular" | "meta";

/** Segmentos realmente calculáveis a partir dos dados da Shopify — usados pra disparar campanhas de WhatsApp. */
export const SEGMENT_TYPES = ["ticket_alto", "sem_recompra", "recompra_30d", "recompra_60d", "envio_atrasado", "recorrencia"] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number] | (string & {});

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "diario", label: "Diário" },
  { key: "semanal", label: "Semanal" },
  { key: "mensal", label: "Mensal" },
  { key: "anual", label: "Anual" },
  { key: "tudo", label: "Tudo" },
  { key: "personalizado", label: "Personalizado" },
];


export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export const brlCents = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Metas do semáforo (vermelho crítico / amarelo regular / verde dentro da meta) */
export const GOALS = {
  taxaRecompra: { meta: 10, regular: 5 }, // %
  tempoMedioEnvio: { meta: 3.0, regular: 3.5 }, // dias (menor é melhor)
  ticketMedio: { meta: 300, regular: 200 }, // R$
};

export function statusHigherIsBetter(value: number, meta: number, regular: number): Status {
  if (value >= meta) return "meta";
  if (value >= regular) return "regular";
  return "critico";
}

export function statusLowerIsBetter(value: number, meta: number, regular: number): Status {
  if (value <= meta) return "meta";
  if (value <= regular) return "regular";
  return "critico";
}

export type Kpi = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  status?: Status | undefined;
  icon: "users" | "bag" | "trend" | "repeat" | "truck" | "box" | "clock" | "receipt" | "dollar";
};

/** Série de gráfico. Campos extras carregam o TAMANHO DA AMOSTRA por trás do percentual. */
export type AnalysisSeries = {
  name: string;
  value: number;
  clientes?: number;
  pedidos?: number;
  base?: number;
  avancaram?: number;
  recompraram?: number;
}[];

/** "sem-dados" = amostra insuficiente; nunca pintar de verde/vermelho um número sem base. */
export type PanelBadge = Status | "sem-dados";

export type PanelStatus = {
  recompra: PanelBadge;
  clv: PanelBadge;
  ticketRecorrencia: PanelBadge;
  faixaTicket: PanelBadge;
  regioes: PanelBadge;
  churn: PanelBadge;
  tempoEntreCompras: PanelBadge;
  curvaRecompra: PanelBadge;
  envios: PanelBadge;
};

/** Metadados de confiabilidade exibidos junto dos painéis. */
export type DashboardMeta = {
  historyDays: number;
  baseMadura: boolean;
  minSample: number;
  gapsAmostra: number;
  totalClientesBase: number;
  numPedidos: number;
  tempoMedioEnvioAmostra: number;
  /** false enquanto os dados reais ainda não chegaram — a UI mostra estado vazio, nunca mock. */
  hasRealData: boolean;
};

export type DashboardData = {
  periodLabel: string;
  kpis: Kpi[];
  insights: { title: string; text: string; highlight?: string | undefined; tone: Status | "info" }[];
  panelStatus: PanelStatus;
  meta: DashboardMeta;
  frequencia: AnalysisSeries;
  clv: AnalysisSeries;
  ticketRecorrencia: { label: string; clientes: number; ticket: number; delta: number | null }[];
  faixaTicket: AnalysisSeries;
  regioes: AnalysisSeries;
  churn: AnalysisSeries;
  tempoEntreCompras: AnalysisSeries;
  curvaRecompra: AnalysisSeries;
  enviosPorDia: { dia: string; pedidos: number; produtos: number; tempoMedio: number }[];
  cohortData: { month: string; size: number; retention: (number | null)[] }[];
  sessoes: { page: string; count: number; trend?: number }[];
  produtosMaisVendidos: { productId: string | null; nome: string; quantidade: number; faturamento: number }[];
  curvaAbcProdutos: ProductAbcRow[];

  reguas: {
    titulo: string;
    tag: string;
    descricao: string;
    base: string;
    conv: string;
    receita: number;
  }[];
  acoes: {
    cluster: string;
    criterio: string;
    base: string;
    oferta: string;
    janela: string;
    conv: string;
    receita: number;
    segmentType: SegmentType;
  }[];
};

/**
 * Estado BASE do dashboard: zeros e séries vazias. Não existe mais fallback silencioso para
 * dados de demonstração — enquanto os dados reais não chegam, a UI mostra estado vazio.
 */
export function emptyDashboardData(period: PeriodKey, customLabel?: string): DashboardData {
  return {
    periodLabel:
      period === "personalizado" ? (customLabel ?? "Período personalizado") : PERIODS.find((p) => p.key === period)!.label,
    kpis: [
      { id: "clientes", label: "Clientes únicos", value: "—", hint: "Clientes com pedido pago", icon: "users" },
      { id: "pedidos", label: "Pedidos pagos", value: "—", hint: "Somente PAID / PARTIALLY_PAID", icon: "receipt" },
      { id: "vendas", label: "Faturamento válido", value: "—", hint: "Exclui reembolsos, cancelados e expirados", icon: "dollar" },
      { id: "ticket", label: "Ticket médio", value: "—", hint: "Faturamento válido ÷ pedidos pagos", icon: "bag" },
      { id: "ltv", label: "Receita por cliente", value: "—", hint: "Faturamento válido ÷ clientes do período", icon: "trend" },
      { id: "recompra", label: "Taxa de recompra", value: "—", hint: "Clientes com 2+ pedidos pagos", icon: "repeat" },
      { id: "pedidos-enviados", label: "Pedidos enviados", value: "—", hint: "Com rastreio, de pedidos pagos", icon: "truck" },
      { id: "produtos-enviados", label: "Produtos enviados", value: "—", hint: "Itens dentro dos pedidos enviados", icon: "box" },
      { id: "tempo-envio", label: "Tempo médio de envio", value: "—", hint: "Envio − pagamento", icon: "clock" },
    ],
    panelStatus: {
      recompra: "sem-dados",
      clv: "sem-dados",
      ticketRecorrencia: "sem-dados",
      faixaTicket: "sem-dados",
      regioes: "sem-dados",
      churn: "sem-dados",
      tempoEntreCompras: "sem-dados",
      curvaRecompra: "sem-dados",
      envios: "sem-dados",
    },
    meta: {
      historyDays: 0,
      baseMadura: false,
      minSample: 5,
      gapsAmostra: 0,
      totalClientesBase: 0,
      numPedidos: 0,
      tempoMedioEnvioAmostra: 0,
      hasRealData: false,
    },
    insights: [],
    frequencia: [],
    clv: [],
    ticketRecorrencia: [],
    faixaTicket: [],
    regioes: [],
    churn: [],
    tempoEntreCompras: [],
    curvaRecompra: [],
    enviosPorDia: [],
    cohortData: [],
    sessoes: [],
    produtosMaisVendidos: [],
    curvaAbcProdutos: [],
    reguas: [],
    acoes: [],
  };
}
