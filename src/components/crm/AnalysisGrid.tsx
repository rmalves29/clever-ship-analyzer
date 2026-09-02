import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import { Maximize2 } from "lucide-react";
import type { DashboardData, PanelBadge } from "@/lib/crm-mock";
import { brlCents } from "@/lib/crm-mock";
import { statusChip, statusLabel } from "./KpiCard";
import { cn } from "@/lib/utils";

/** Chip do painel. "sem-dados" = amostra insuficiente, nunca pintado como bom/ruim. */
const badgeChip: Record<PanelBadge, string> = {
  ...statusChip,
  "sem-dados": "bg-muted text-muted-foreground",
};
const badgeLabel: Record<PanelBadge, string> = {
  ...statusLabel,
  "sem-dados": "sem dados",
};

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

const CHART = ["var(--color-chart-1)", "var(--color-chart-3)", "var(--color-chart-2)", "var(--color-chart-5)"];

function Panel({
  index,
  title,
  description,
  status,
  footnote,
  empty,
  children,
}: {
  index: string;
  title: string;
  description: string;
  status: PanelBadge;
  /** Tamanho da amostra / ressalva metodológica exibida abaixo do gráfico. */
  footnote?: string;
  /** Mensagem exibida no lugar do gráfico quando não há amostra suficiente. */
  empty?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-5">
      <header className="flex items-start gap-3">
        <span className="mt-1 text-xs font-mono text-muted-foreground">{index}</span>
        <div className="flex-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", badgeChip[status])}>
          {badgeLabel[status]}
        </span>
        <Maximize2 className="size-4 text-muted-foreground" />
      </header>
      <div className="mt-4 h-[240px]">{empty ? <EmptyState>{empty}</EmptyState> : children}</div>
      {footnote && <p className="mt-2 text-[11px] text-muted-foreground">{footnote}</p>}
    </section>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.75rem",
    fontSize: 12,
  },
} as const;

export function AnalysisGrid({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        index="01"
        title="Frequência de compra por cliente"
        description="% de clientes por número de pedidos PAGOS no histórico da base."
        status={data.panelStatus.recompra}
        footnote={`Base: ${data.meta.totalClientesBase} cliente(s) com pedido pago.`}
        empty={data.frequencia.length ? null : "Sem clientes com pedido pago para este período."}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.frequencia} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
              {data.frequencia.map((_, i) => (
                <Cell key={i} fill={CHART[i % CHART.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => `${v}%`} {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        index="02"
        title="Valor acumulado por cliente"
        description="Média do valor já gasto (pedidos pagos) por faixa de recorrência. Não é LTV previsto."
        status={data.panelStatus.clv}
        footnote="Valor observado até hoje — nenhuma projeção de vida útil é aplicada."
        empty={data.clv.length ? null : "Sem clientes com pedido pago para este período."}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.clv}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={60} />
            <Tooltip formatter={(v: number) => brlCents(v)} {...tooltipStyle} />
            <Bar dataKey="value" fill="var(--color-chart-3)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <section className="surface-card p-5">
        <header className="flex items-start gap-3">
          <span className="mt-1 text-xs font-mono text-muted-foreground">03</span>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Ticket médio x recorrência</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Relação entre o valor gasto por pedido e a maturidade do cliente.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
              badgeChip[data.panelStatus.ticketRecorrencia],
            )}
          >
            {badgeLabel[data.panelStatus.ticketRecorrencia]}
          </span>
        </header>
        <ul className="mt-4 space-y-4">
          {data.ticketRecorrencia.map((r) => (
            <li key={r.label}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {r.label} <span className="text-muted-foreground">· {r.clientes} clientes</span>
                </span>
                <span className="flex items-center gap-2 font-semibold">
                  {brlCents(r.ticket)}
                  {r.delta !== null && (
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[11px]",
                        r.delta >= 0 ? statusChip.meta : statusChip.critico,
                      )}
                    >
                      {r.delta > 0 ? "+" : ""}
                      {r.delta.toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-muted">
                <div
                  className="gradient-brand h-2 rounded-full"
                  style={{ width: `${Math.min(100, (r.ticket / 700) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Panel
        index="04"
        title="Pedidos por faixa de ticket"
        description="% dos pedidos PAGOS do período distribuídos por valor do pedido."
        status={data.panelStatus.faixaTicket}
        footnote={`Base: ${data.meta.numPedidos} pedido(s) pago(s) no período.`}
        empty={data.faixaTicket.length ? null : "Sem pedidos pagos no período selecionado."}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.faixaTicket}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} unit="%" width={44} />
            <Tooltip formatter={(v: number) => `${v}%`} {...tooltipStyle} />
            <Bar dataKey="value" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        index="05"
        title="Top 5 estados por taxa de recompra"
        description="Clientes do estado com 2+ pedidos pagos ÷ total de clientes daquele estado."
        status={data.panelStatus.regioes}
        footnote={`Só entram estados com pelo menos ${data.meta.minSample} clientes.`}
        empty={data.regioes.length ? null : `Nenhum estado atingiu a amostra mínima de ${data.meta.minSample} clientes.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.regioes}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} unit="%" width={44} />
            <Tooltip formatter={(v: number) => `${v}%`} {...tooltipStyle} />
            <Bar dataKey="value" fill="var(--color-chart-3)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        index="06"
        title={data.meta.baseMadura ? "Retenção por estágio de compra" : "Retenção por estágio (preliminar)"}
        description="% dos clientes que avançaram para a compra seguinte."
        status={data.panelStatus.churn}
        footnote={
          data.meta.baseMadura
            ? `Base: ${data.meta.totalClientesBase} cliente(s) com pedido pago.`
            : `Histórico pago de apenas ${data.meta.historyDays} dias — leitura preliminar, não indica churn definitivo.`
        }
        empty={data.churn.length ? null : "Sem clientes com pedido pago para calcular retenção."}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.churn}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} unit="%" width={44} domain={[0, 100]} />
            <Tooltip formatter={(v: number) => `${v}%`} {...tooltipStyle} />
            <Area dataKey="value" stroke="var(--color-warning)" fill="var(--color-warning-soft)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        index="07"
        title="Tempo entre 1ª e 2ª compra"
        description="Intervalo em dias entre o 1º e o 2º pedido pago do mesmo cliente (faixas exclusivas)."
        status={data.panelStatus.tempoEntreCompras}
        footnote={`Base: ${data.meta.gapsAmostra} cliente(s) com 2ª compra paga.`}
        empty={
          data.meta.gapsAmostra >= data.meta.minSample
            ? null
            : `Amostra insuficiente: ${data.meta.gapsAmostra} cliente(s) com 2ª compra.`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.tempoEntreCompras}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} unit="%" width={44} />
            <Tooltip formatter={(v: number) => `${v}%`} {...tooltipStyle} />
            <Bar dataKey="value" fill="var(--color-chart-5)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        index="08"
        title="Quando acontece a 2ª compra"
        description="Distribuição das 2ªs compras por faixa de semanas (faixas exclusivas, somam 100%)."
        status={data.panelStatus.curvaRecompra}
        footnote={`Base: ${data.meta.gapsAmostra} cliente(s) com 2ª compra paga.`}
        empty={
          data.meta.gapsAmostra >= data.meta.minSample
            ? null
            : `Amostra insuficiente: ${data.meta.gapsAmostra} cliente(s) com 2ª compra.`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.curvaRecompra}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} unit="%" width={44} />
            <Tooltip formatter={(v: number) => `${v}%`} {...tooltipStyle} />
            <Line dataKey="value" stroke="var(--color-chart-1)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <section className="surface-card p-5 lg:col-span-2">
        <header className="flex items-start gap-3">
          <span className="mt-1 text-xs font-mono text-muted-foreground">09</span>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Operação de envio</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pedidos e produtos enviados por dia (pedidos pagos com rastreio). Tempo médio = 1º envio − pagamento.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
              badgeChip[data.panelStatus.envios],
            )}
          >
            {badgeLabel[data.panelStatus.envios]}
          </span>
        </header>
        <div className="mt-4 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.enviosPorDia}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="pedidos" name="Pedidos enviados" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="produtos" name="Produtos enviados" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="surface-card p-5 lg:col-span-2">
        <header className="flex items-start gap-3 border-b border-border pb-3">
          <span className="mt-1 text-xs font-mono text-muted-foreground">10</span>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Análise de coorte de clientes</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Retenção por mês da 1ª compra paga. Células vazias = mês sem coorte (não é 0%).
            </p>
          </div>
        </header>
        <div className="mt-4 overflow-x-auto pb-2">
          <table className="w-full text-left text-[10px] border-collapse min-w-[600px]">
            <thead>
              <tr>
                <th className="p-2 font-medium text-muted-foreground border-b border-border">Coorte</th>
                <th className="p-2 font-medium text-muted-foreground border-b border-border text-center" colSpan={8}>Meses</th>
              </tr>
            </thead>
            <tbody>
              {data.cohortData?.map((cohort, idx) => (
                <tr key={idx} className="hover:bg-muted/50 transition-colors">
                  <td className="p-2 font-medium whitespace-nowrap border-b border-border">
                    {cohort.month} <span className="text-muted-foreground">({cohort.size})</span>
                  </td>
                  {cohort.retention.map((val, i) => (
                    <td 
                      key={i} 
                      className={cn(
                        "p-2 text-center border-b border-border",
                        val === null ? "bg-transparent" : 
                        val === 0 ? "text-muted-foreground/30" : 
                        val > 20 ? "bg-meta/20 font-semibold" : 
                        val > 10 ? "bg-meta/10" : ""
                      )}
                    >
                      {val !== null ? `${val}%` : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card p-5 lg:col-span-2">
        <header className="flex items-start gap-3 border-b border-border pb-3">
          <span className="mt-1 text-xs font-mono text-muted-foreground">11</span>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Pedidos por página de entrada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Página de entrada (landing site) registrada nos pedidos pagos. Não é contagem de sessões.
            </p>
          </div>
        </header>
        <ul className="mt-4 space-y-2">
          {data.sessoes?.map((s, i) => (
            <li key={i} className="flex items-center justify-between text-xs p-2 rounded-md hover:bg-muted/50 transition-colors">
              <span className="truncate max-w-[300px]" title={s.page}>{s.page}</span>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{s.count} pedido(s)</span>
              </div>
            </li>
          ))}
          {(!data.sessoes || data.sessoes.length === 0) && (
            <li className="p-2 text-xs text-muted-foreground">Nenhum pedido pago com página de entrada registrada.</li>
          )}
        </ul>
      </section>

      <section className="surface-card p-5 lg:col-span-2">
        <header className="flex items-start gap-3 border-b border-border pb-3">
          <span className="mt-1 text-xs font-mono text-muted-foreground">12</span>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Produtos mais vendidos</h3>
            <p className="mt-1 text-sm text-muted-foreground">Quantidade vendida em pedidos pagos no período.</p>
          </div>
        </header>
        <ul className="mt-4 space-y-2">
          {data.produtosMaisVendidos?.map((p, i) => (
            <li key={i} className="flex items-center justify-between text-xs p-2 rounded-md hover:bg-muted/50 transition-colors">
              <span className="truncate max-w-[300px]" title={p.nome}>{p.nome}</span>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{p.quantidade} un.</span>
                <span className="text-muted-foreground">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(p.faturamento)}
                </span>
              </div>
            </li>
          ))}
          {(!data.produtosMaisVendidos || data.produtosMaisVendidos.length === 0) && (
            <li className="text-xs text-muted-foreground p-2">Nenhum produto vendido no período selecionado.</li>
          )}
        </ul>
      </section>

      <section className="surface-card p-5 lg:col-span-2">
        <header className="flex items-start gap-3 border-b border-border pb-3">
          <span className="mt-1 text-xs font-mono text-muted-foreground">13</span>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Curva ABC de produtos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Classificação por receita (A até 80% acumulado, B até 95%, C o resto) e por itens vendidos, cada uma com seu
              próprio ranking. Ordenado por valor vendido, do maior pro menor.
            </p>
          </div>
        </header>
        <div className="mt-4 max-h-[420px] overflow-y-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="sticky top-0 bg-muted/90 text-left uppercase tracking-wider text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium">Variação</th>
                <th className="px-3 py-2 text-right font-medium">Valor vendido</th>
                <th className="px-3 py-2 text-center font-medium">Curva (receita)</th>
                <th className="px-3 py-2 text-center font-medium">Curva (itens)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.curvaAbcProdutos.map((p) => (
                <tr key={p.key} className="hover:bg-muted/50">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{p.sku ?? "—"}</td>
                  <td className="max-w-[240px] truncate px-3 py-2" title={p.nome}>{p.nome}</td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground" title={p.variacao ?? undefined}>
                    {p.variacao ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.valorVendido)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <AbcBadge tier={p.curvaReceita} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <AbcBadge tier={p.curvaItens} />
                  </td>
                </tr>
              ))}
              {data.curvaAbcProdutos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum produto vendido no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const ABC_TIER_CLASS: Record<"A" | "B" | "C", string> = {
  A: "bg-success-soft text-success",
  B: "bg-warning-soft text-warning",
  C: "bg-muted text-muted-foreground",
};

function AbcBadge({ tier }: { tier: "A" | "B" | "C" }) {
  return (
    <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold", ABC_TIER_CLASS[tier])}>
      {tier}
    </span>
  );
}
