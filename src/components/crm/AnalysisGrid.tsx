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
import type { DashboardData, Status } from "@/lib/crm-mock";
import { brlCents } from "@/lib/crm-mock";
import { statusChip, statusLabel } from "./KpiCard";
import { cn } from "@/lib/utils";

const CHART = ["var(--color-chart-1)", "var(--color-chart-3)", "var(--color-chart-2)", "var(--color-chart-5)"];

function Panel({
  index,
  title,
  description,
  status,
  children,
}: {
  index: string;
  title: string;
  description: string;
  status: Status;
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
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", statusChip[status])}>
          {statusLabel[status]}
        </span>
        <Maximize2 className="size-4 text-muted-foreground" />
      </header>
      <div className="mt-4 h-[240px]">{children}</div>
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
        title="Análise de recompra por cliente"
        description="Distribuição de frequência de pedidos por cliente único no período."
        status={data.panelStatus.recompra}
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
        title="Customer Lifetime Value (CLV)"
        description="Valor financeiro acumulado por cliente em cada estágio da jornada."
        status={data.panelStatus.clv}
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
              statusChip[data.panelStatus.ticketRecorrencia],
            )}
          >
            {statusLabel[data.panelStatus.ticketRecorrencia]}
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
        title="Base por faixa de ticket"
        description="Segmentação de clientes por valor gasto no pedido mais recente."
        status={data.panelStatus.faixaTicket}
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
        title="Top 5 regiões que recompram"
        description="Estados com maior taxa de recompra da base."
        status={data.panelStatus.regioes}
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

      <Panel index="06" title="Curva de churn" description="Volume de clientes perdidos por estágio de compra." status={data.panelStatus.churn}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.churn}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} unit="%" width={44} domain={[90, 100]} />
            <Tooltip formatter={(v: number) => `${v}%`} {...tooltipStyle} />
            <Area dataKey="value" stroke="var(--color-warning)" fill="var(--color-warning-soft)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        index="07"
        title="Tempo entre 1ª e 2ª compra"
        description="Intervalo de dias entre o primeiro e o segundo pedido do mesmo cliente."
        status={data.panelStatus.tempoEntreCompras}
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

      <Panel index="08" title="Curva de recompra" description="Evolução da base de clientes ativos ao longo do tempo." status={data.panelStatus.curvaRecompra}>
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
              Pedidos e produtos enviados por dia (com rastreio) e tempo médio de envio (rastreio − pagamento).
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
              statusChip[data.panelStatus.envios],
            )}
          >
            {statusLabel[data.panelStatus.envios]}
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
            <p className="mt-1 text-sm text-muted-foreground">Retenção de clientes por mês de primeira compra.</p>
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
                  <td className="p-2 font-medium whitespace-nowrap border-b border-border">{cohort.month}</td>
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
            <h3 className="text-base font-semibold">Sessões por página de destino</h3>
            <p className="mt-1 text-sm text-muted-foreground">Principais páginas de entrada na loja.</p>
          </div>
        </header>
        <ul className="mt-4 space-y-2">
          {data.sessoes?.map((s, i) => (
            <li key={i} className="flex items-center justify-between text-xs p-2 rounded-md hover:bg-muted/50 transition-colors">
              <span className="truncate max-w-[300px]" title={s.page}>{s.page}</span>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{s.count}</span>
                {s.trend && (
                  <span className="text-meta font-medium">↗ {(s.trend/100).toFixed(1)} mil%</span>
                )}
                {!s.trend && <span className="text-muted-foreground">—</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
