export type PeriodKey = "diario" | "semanal" | "mensal" | "anual" | "personalizado";

export type Status = "critico" | "regular" | "meta";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "diario", label: "Diário" },
  { key: "semanal", label: "Semanal" },
  { key: "mensal", label: "Mensal" },
  { key: "anual", label: "Anual" },
  { key: "personalizado", label: "Personalizado" },
];

const MULT: Record<PeriodKey, number> = {
  diario: 1,
  semanal: 6.4,
  mensal: 27,
  anual: 320,
  personalizado: 3.5,
};

export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export const brlCents = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Metas do semáforo (vermelho crítico / amarelo regular / verde dentro da meta) */
export const GOALS = {
  taxaRecompra: { meta: 10, regular: 5 }, // %
  tempoMedioEnvio: { meta: 1.5, regular: 2.5 }, // dias (menor é melhor)
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
  status?: Status;
  icon: "users" | "bag" | "trend" | "repeat" | "truck" | "box" | "clock";
};

export type AnalysisSeries = { name: string; value: number }[];

export type DashboardData = {
  periodLabel: string;
  kpis: Kpi[];
  insights: { title: string; text: string; highlight?: string; tone: Status | "info" }[];
  frequencia: AnalysisSeries;
  clv: AnalysisSeries;
  ticketRecorrencia: { label: string; clientes: number; ticket: number; delta: number | null }[];
  faixaTicket: AnalysisSeries;
  regioes: AnalysisSeries;
  churn: AnalysisSeries;
  tempoEntreCompras: AnalysisSeries;
  curvaRecompra: AnalysisSeries;
  enviosPorDia: { dia: string; pedidos: number; produtos: number; tempoMedio: number }[];
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
  }[];
};

export function getDashboardData(period: PeriodKey, customLabel?: string): DashboardData {
  const m = MULT[period];
  const pedidos = Math.round(271 * m);
  const clientes = Math.round(255 * m);
  const ticket = 268 + (period === "anual" ? 22 : period === "mensal" ? 9 : 0);
  const taxaRecompra = period === "anual" ? 6.8 : period === "mensal" ? 4.2 : 2.4;
  const pedidosEnviados = Math.round(pedidos * 0.83);
  const produtosEnviados = Math.round(pedidosEnviados * 1.42);
  const tempoMedioEnvio = period === "anual" ? 2.1 : period === "mensal" ? 1.8 : 2.4;

  return {
    periodLabel:
      period === "personalizado" ? (customLabel ?? "Período personalizado") : PERIODS.find((p) => p.key === period)!.label,
    kpis: [
      { id: "clientes", label: "Clientes únicos", value: String(clientes), hint: `${pedidos} pedidos`, icon: "users" },
      {
        id: "ticket",
        label: "Ticket médio",
        value: brl(ticket),
        icon: "bag",
        status: statusHigherIsBetter(ticket, GOALS.ticketMedio.meta, GOALS.ticketMedio.regular),
      },
      { id: "ltv", label: "LTV", value: brl(Math.round(ticket * 1.06)), hint: "Faturamento ÷ clientes únicos", icon: "trend" },
      {
        id: "recompra",
        label: "Taxa de recompra",
        value: `${taxaRecompra.toFixed(1)}%`,
        icon: "repeat",
        status: statusHigherIsBetter(taxaRecompra, GOALS.taxaRecompra.meta, GOALS.taxaRecompra.regular),
      },
      {
        id: "pedidos-enviados",
        label: "Pedidos enviados",
        value: String(pedidosEnviados),
        hint: "Com código de rastreio no período",
        icon: "truck",
      },
      {
        id: "produtos-enviados",
        label: "Produtos enviados",
        value: String(produtosEnviados),
        hint: "Itens dentro dos pedidos enviados",
        icon: "box",
      },
      {
        id: "tempo-envio",
        label: "Tempo médio de envio",
        value: `${tempoMedioEnvio.toFixed(1)} dias`,
        hint: "Data do rastreio − data do pagamento",
        icon: "clock",
        status: statusLowerIsBetter(tempoMedioEnvio, GOALS.tempoMedioEnvio.meta, GOALS.tempoMedioEnvio.regular),
      },
    ],
    insights: [
      {
        title: "Análise de recompra por cliente",
        text: "A taxa de recompra é crítica, indicando um gargalo severo na fidelização.",
        highlight: `${taxaRecompra.toFixed(2)}%`,
        tone: "critico",
      },
      {
        title: "Customer Lifetime Value (CLV)",
        text: "O valor acumulado explode na quarta compra, indicando um perfil de cliente premium desproporcional.",
        tone: "info",
      },
      {
        title: "Ticket médio x recorrência",
        text: "Existe uma 'barriga' negativa no ticket médio da segunda compra antes da ascensão no VIP.",
        tone: "regular",
      },
      {
        title: "Base por faixa de ticket",
        text: "A base está concentrada no corpo da curva; o high-end segue subexplorado.",
        tone: "regular",
      },
      {
        title: "Tempo médio de envio",
        text: "Envios acima da meta operacional de 1,5 dia impactam diretamente a experiência pós-compra.",
        highlight: `${tempoMedioEnvio.toFixed(1)} dias`,
        tone: statusLowerIsBetter(tempoMedioEnvio, GOALS.tempoMedioEnvio.meta, GOALS.tempoMedioEnvio.regular),
      },
      {
        title: "Curva de churn",
        text: "da base não retorna após a 1ª compra; o churn sobe até a 3ª compra.",
        highlight: "97.6%",
        tone: "critico",
      },
    ],
    frequencia: [
      { name: "1x", value: 97.6 },
      { name: "2x", value: 1.6 },
      { name: "3x", value: 0.0 },
      { name: "4x+", value: 0.8 },
    ],
    clv: [
      { name: "1x", value: 251.12 },
      { name: "2x", value: 253.32 },
      { name: "3x", value: 0 },
      { name: "4x+", value: 4549.89 },
    ],
    ticketRecorrencia: [
      { label: "1x compra", clientes: Math.round(249 * m), ticket: 251.12, delta: null },
      { label: "2x compras", clientes: Math.round(4 * m), ticket: 126.66, delta: -49.6 },
      { label: "3x compras", clientes: 0, ticket: 0, delta: -100 },
      { label: "4x+ compras", clientes: Math.round(2 * m), ticket: 649.98, delta: 158.8 },
    ],
    faixaTicket: [
      { name: "< R$100", value: 11.4 },
      { name: "R$100-200", value: 34.5 },
      { name: "R$200-400", value: 44.3 },
      { name: "R$400-800", value: 8.6 },
      { name: "R$800+", value: 1.2 },
    ],
    regioes: [
      { name: "MG", value: 4.5 },
      { name: "SP", value: 2.8 },
      { name: "RJ", value: 1.9 },
      { name: "PR", value: 1.2 },
      { name: "RS", value: 0.7 },
    ],
    churn: [
      { name: "Após 1ª compra", value: 97.6 },
      { name: "Após 2ª compra", value: 98.8 },
      { name: "Após 3ª compra", value: 99.2 },
    ],
    tempoEntreCompras: [
      { name: "<15d", value: 66.7 },
      { name: "16-60d", value: 0 },
      { name: "61-90d", value: 33.3 },
    ],
    curvaRecompra: [
      { name: "Semana 1-4", value: 100 },
      { name: "Semana 5-8", value: 42 },
      { name: "Semana 9-12", value: 21 },
      { name: "Semana 13+", value: 14 },
    ],
    enviosPorDia: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((dia, i) => ({
      dia,
      pedidos: Math.round((30 + i * 6) * (m / 6.4 || 1)),
      produtos: Math.round((44 + i * 9) * (m / 6.4 || 1)),
      tempoMedio: Number((1.4 + ((i * 7) % 5) * 0.32).toFixed(1)),
    })),
    reguas: [
      {
        titulo: "Onboarding Pós-1ª Compra",
        tag: "Clientes com 1 compra",
        descricao: "Maior cluster: clientes de 1 compra precisam ser ativados para a 2ª.",
        base: "98%",
        conv: "8.0%",
        receita: Math.round(5002 * (m / 6.4 || 1)),
      },
      {
        titulo: "Expansão de Ticket (Upsell)",
        tag: "Expansão de receita",
        descricao: "Boa massa de clientes com ticket acima de R$100 — espaço para upsell.",
        base: "89%",
        conv: "6.0%",
        receita: Math.round(4725 * (m / 6.4 || 1)),
      },
      {
        titulo: "Resgate de Atraso de Envio",
        tag: "Pós-venda",
        descricao: "Pedidos com envio acima da meta recebem comunicação proativa.",
        base: "31%",
        conv: "9.5%",
        receita: Math.round(2180 * (m / 6.4 || 1)),
      },
    ],
    acoes: [
      { cluster: "Clientes Ticket > R$200", criterio: "Ticket médio acima de R$200.", base: "44%", oferta: "Oferta antecipada", janela: "48h", conv: "4.5%", receita: 1636 },
      { cluster: "Sem Recompra → Reativação", criterio: "Clientes que nunca voltaram a comprar.", base: "98%", oferta: "Sale", janela: "72h", conv: "1.2%", receita: 750 },
      { cluster: "Comprou 1x → Comprar 2x (30d)", criterio: "Primeira compra nos últimos 30 dias.", base: "24%", oferta: "Cupom desconto", janela: "24h", conv: "3.5%", receita: 545 },
      { cluster: "Base PIX → Desconto à vista", criterio: "Clientes que pagaram via PIX.", base: "19%", oferta: "Cupom desconto", janela: "24h", conv: "4.0%", receita: 525 },
      { cluster: "Comprou 1x → Comprar 2x (60d)", criterio: "Primeira compra nos últimos 60 dias.", base: "29%", oferta: "Frete grátis", janela: "48h", conv: "2.5%", receita: 471 },
      { cluster: "Envio acima da meta", criterio: "Pedidos enviados com mais de 2 dias.", base: "17%", oferta: "Cupom de desculpas", janela: "24h", conv: "5.1%", receita: 388 },
    ],
  };
}
