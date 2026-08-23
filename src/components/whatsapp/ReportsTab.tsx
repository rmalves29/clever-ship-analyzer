import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getCampaigns, getCampaignsFailureBreakdown } from "@/lib/whatsapp-meta.functions";
import { brl } from "@/lib/crm-mock";
import { SEGMENT_LABEL } from "@/components/crm/AutomationDialog";

function FunnelRow({ label, value, pct, tone }: { label: string; value: number; pct: number; tone: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-semibold">
          {value.toLocaleString("pt-BR")} <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-muted">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function ReportsTab() {
  const { data: campaigns } = useQuery({ queryKey: ["whatsapp-campaigns"], queryFn: () => getCampaigns() });
  const runFailures = useServerFn(getCampaignsFailureBreakdown);
  const { data: failures } = useQuery({ queryKey: ["whatsapp-failures"], queryFn: () => runFailures() });

  const list = campaigns ?? [];

  const totals = useMemo(() => {
    const enviadas = list.reduce((a, c) => a + c.enviadas, 0);
    const entregues = list.reduce((a, c) => a + c.entregues, 0);
    const lidas = list.reduce((a, c) => a + c.lidas, 0);
    const vendas = list.reduce((a, c) => a + c.vendas, 0);
    const receita = list.reduce((a, c) => a + c.receita, 0);
    const custo = list.reduce((a, c) => a + c.custo, 0);
    const falhas = list.reduce((a, c) => a + c.falhas, 0);
    return { enviadas, entregues, lidas, vendas, receita, custo, falhas };
  }, [list]);

  const roas = totals.custo > 0 ? totals.receita / totals.custo : null;
  const conversao = totals.enviadas > 0 ? (totals.vendas / totals.enviadas) * 100 : 0;
  const ticketMedio = totals.vendas > 0 ? totals.receita / totals.vendas : 0;
  const receitaMilEnvios = totals.enviadas > 0 ? (totals.receita / totals.enviadas) * 1000 : 0;
  const taxaFalha = totals.enviadas + totals.falhas > 0 ? (totals.falhas / (totals.enviadas + totals.falhas)) * 100 : 0;
  const leituraPct = totals.enviadas > 0 ? (totals.lidas / totals.enviadas) * 100 : 0;
  const entregaPct = totals.enviadas > 0 ? (totals.entregues / totals.enviadas) * 100 : 0;

  const evolucao = useMemo(() => {
    return [...list]
      .filter((c) => c.sentAt)
      .sort((a, b) => new Date(a.sentAt!).getTime() - new Date(b.sentAt!).getTime())
      .map((c) => ({
        data: new Date(c.sentAt!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        enviadas: c.enviadas,
        lidas: c.lidas,
        vendas: c.vendas,
      }));
  }, [list]);

  const ranking = [...list].sort((a, b) => b.receita - a.receita).slice(0, 8);

  const byCategory = useMemo(() => {
    const map = new Map<string, { enviadas: number; leitura: number; vendas: number; receita: number }>();
    for (const c of list) {
      const agg = map.get(c.messageType) ?? { enviadas: 0, leitura: 0, vendas: 0, receita: 0 };
      agg.enviadas += c.enviadas;
      agg.leitura += c.lidas;
      agg.vendas += c.vendas;
      agg.receita += c.receita;
      map.set(c.messageType, agg);
    }
    return Array.from(map.entries());
  }, [list]);

  return (
    <div className="mt-4 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-xs text-muted-foreground">Campanhas</p>
          <p className="mt-2 text-3xl font-bold">{list.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{totals.enviadas.toLocaleString("pt-BR")} envios</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs text-muted-foreground">Receita</p>
          <p className="mt-2 text-3xl font-bold">{brl(totals.receita)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{totals.vendas} pedidos atribuídos</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs text-muted-foreground">Leitura</p>
          <p className="mt-2 text-3xl font-bold">{leituraPct.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{totals.lidas.toLocaleString("pt-BR")} mensagens lidas</p>
        </div>
        <div className="surface-card bg-foreground p-5 text-background">
          <p className="text-xs text-background/70">ROAS estimado</p>
          <p className="mt-2 text-3xl font-bold">{roas !== null ? `${roas.toFixed(1)}x` : "—"}</p>
          <p className="mt-1 text-xs text-background/70">{brl(totals.custo)} de custo estimado</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Entrega", value: `${entregaPct.toFixed(1)}%` },
          { label: "Conversão", value: `${conversao.toFixed(1)}%` },
          { label: "Ticket médio", value: brl(ticketMedio) },
          { label: "Receita / mil envios", value: brl(receitaMilEnvios) },
          { label: "Receita assistida", value: brl(totals.receita) },
          { label: "Falhas", value: `${taxaFalha.toFixed(1)}%` },
        ].map((m) => (
          <div key={m.label} className="surface-card p-4">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-lg font-semibold">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card p-5">
          <h3 className="font-semibold">Funil consolidado</h3>
          <p className="text-sm text-muted-foreground">Avanço dos contatos até o pedido atribuído.</p>
          <div className="mt-4 space-y-4">
            <FunnelRow label="Enviadas" value={totals.enviadas} pct={100} tone="bg-foreground" />
            <FunnelRow label="Entregues" value={totals.entregues} pct={entregaPct} tone="bg-brand" />
            <FunnelRow label="Lidas" value={totals.lidas} pct={leituraPct} tone="bg-brand" />
            <FunnelRow label="Pedidos" value={totals.vendas} pct={conversao} tone="bg-success" />
          </div>
        </section>

        <section className="surface-card p-5">
          <h3 className="font-semibold">Evolução no período</h3>
          <p className="text-sm text-muted-foreground">Volume enviado, leitura e pedidos por campanha.</p>
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="data" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="enviadas" name="Enviadas" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lidas" name="Lidas" stroke="var(--color-chart-3)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="vendas" name="Pedidos" stroke="var(--color-chart-5)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="surface-card p-5">
        <h3 className="font-semibold">Melhores campanhas</h3>
        <p className="text-sm text-muted-foreground">Ranking por receita.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2">Campanha</th>
                <th className="py-2">Enviadas</th>
                <th className="py-2">Leitura</th>
                <th className="py-2">Pedidos</th>
                <th className="py-2">Receita</th>
                <th className="py-2">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">Sem dados ainda.</td>
                </tr>
              )}
              {ranking.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 font-medium">{c.nome}</td>
                  <td className="py-2">{c.enviadas}</td>
                  <td className="py-2">{c.enviadas > 0 ? `${((c.lidas / c.enviadas) * 100).toFixed(1)}%` : "0.0%"}</td>
                  <td className="py-2">{c.vendas}</td>
                  <td className="py-2 font-semibold">{brl(c.receita)}</td>
                  <td className="py-2">{c.custo > 0 ? `${(c.receita / c.custo).toFixed(1)}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card p-5">
          <h3 className="font-semibold">Categorias</h3>
          <p className="text-sm text-muted-foreground">Contribuição das categorias pra receita e conversão.</p>
          <div className="mt-4 space-y-3">
            {byCategory.length === 0 && <p className="text-sm text-muted-foreground">Sem dados ainda.</p>}
            {byCategory.map(([cat, agg]) => (
              <div key={cat} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{cat}</p>
                  <p className="text-xs text-muted-foreground">
                    {agg.enviadas} envios · {agg.enviadas > 0 ? ((agg.leitura / agg.enviadas) * 100).toFixed(1) : "0.0"}% leitura · {agg.vendas} pedidos
                  </p>
                </div>
                <p className="font-semibold text-brand">{brl(agg.receita)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-5">
          <h3 className="font-semibold">crie uma mensagem de teste na api do whatsapp, veja se está tudo ok, faça uma avaliação geral do sistema para ver se a integração do whatsapp api está funcionando.</h3>
          <p className="text-sm text-muted-foreground">crie uma mensagem de teste na api do whatsapp, veja se está tudo ok, faça uma avaliação geral do sistema para ver se a integração do whatsapp api está funcionando.</p>
          <div className="mt-4 space-y-3">
            {(!failures || failures.length === 0) && <p className="text-sm text-muted-foreground">Nenhuma falha registrada.</p>}
            {failures?.map((f) => (
              <div key={f.motivo} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{f.motivo}</p>
                  <p className="text-sm font-semibold">{f.count}</p>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-critical" style={{ width: `${f.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
