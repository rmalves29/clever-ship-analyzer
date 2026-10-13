import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Calculator, TrendingDown, TrendingUp } from "lucide-react";
import { getRevenueEquation } from "@/lib/revenue-equation.functions";
import { EQUATION_WINDOWS, FACTOR_LABEL, type EquationBasis, type EquationFactor, type EquationFactorReading } from "@/lib/revenue-equation";
import { cn } from "@/lib/utils";

const brl0 = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

function formatFactor(factor: EquationFactor, v: number): string {
  if (factor === "base") return int(v);
  if (factor === "taxa") return `${v.toFixed(1).replace(".", ",")}%`;
  return brl0(v);
}

function Variation({ label, value }: { label: string; value: number | null }) {
  if (value === null) return <span className="text-[11px] text-muted-foreground">{label}: —</span>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", up ? "text-success" : "text-critical")}>
      <Icon className="size-3" />
      {up ? "+" : ""}
      {value.toFixed(0)}% {label}
    </span>
  );
}

const FACTOR_HINT: Record<EquationFactor, string> = {
  base: "tinham comprado nos 12 meses anteriores",
  taxa: "da base ativa voltou a comprar",
  valor: "soma dos pedidos ÷ clientes que voltaram",
};

function FactorCard({ reading, bottleneck, basis }: { reading: EquationFactorReading; bottleneck: boolean; basis: EquationBasis }) {
  return (
    <div
      className={cn(
        "relative flex-1 rounded-xl border bg-card p-4",
        bottleneck ? "border-critical/60 ring-2 ring-critical/15" : "border-border",
      )}
    >
      {bottleneck && (
        <span className="absolute -top-2.5 left-3 rounded-full bg-critical px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Gargalo
        </span>
      )}
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{FACTOR_LABEL[reading.factor]}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{formatFactor(reading.factor, reading.current)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{FACTOR_HINT[reading.factor]}</p>
      <div className="mt-2 flex flex-col gap-0.5">
        <Variation label="vs. janela anterior" value={reading.vsPrevious} />
        {basis === "mediana" && <Variation label="vs. sua mediana" value={reading.vsReference} />}
      </div>
    </div>
  );
}

const Operator = ({ children }: { children: string }) => (
  <span className="flex items-center justify-center text-2xl font-light text-muted-foreground md:px-1">{children}</span>
);

export function RevenueEquationCard() {
  const [windowDays, setWindowDays] = useState<30 | 60 | 90>(90);
  const run = useServerFn(getRevenueEquation);
  const { data, isLoading, error } = useQuery({
    queryKey: ["revenue-equation", windowDays],
    queryFn: () => run({ data: { windowDays } }),
    staleTime: 5 * 60_000,
  });

  const diagnosis = data?.diagnosis;
  const current = data?.current;
  const readingOf = (f: EquationFactor) => diagnosis?.factors.find((r) => r.factor === f);
  const tone =
    diagnosis?.status === "gargalo"
      ? "border-critical/30 bg-critical-soft/60"
      : diagnosis?.status === "estavel"
        ? "border-success/30 bg-success-soft/60"
        : "border-border bg-muted/40";

  return (
    <section className="surface-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div className="flex items-center gap-3">
          <span className="gradient-brand flex size-10 items-center justify-center rounded-xl text-primary-foreground">
            <Calculator className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Equação da receita da base</h2>
            <p className="text-sm text-muted-foreground">Clientes ativos × taxa de recompra × receita por cliente que voltou</p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Janela de análise">
          {EQUATION_WINDOWS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setWindowDays(d)}
              aria-pressed={windowDays === d}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                windowDays === d ? "bg-brand text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d} dias
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-5 p-5">
        {isLoading && <p className="animate-pulse text-sm text-muted-foreground">Calculando a equação da base…</p>}
        {error && <p className="text-sm text-critical">Não foi possível calcular a equação agora. Tente atualizar a página.</p>}

        {current && diagnosis && (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
              <FactorCard reading={readingOf("base")!} bottleneck={diagnosis.status === "gargalo" && diagnosis.factor === "base"} basis={diagnosis.basis} />
              <Operator>×</Operator>
              <FactorCard reading={readingOf("taxa")!} bottleneck={diagnosis.status === "gargalo" && diagnosis.factor === "taxa"} basis={diagnosis.basis} />
              <Operator>×</Operator>
              <FactorCard reading={readingOf("valor")!} bottleneck={diagnosis.status === "gargalo" && diagnosis.factor === "valor"} basis={diagnosis.basis} />
              <Operator>=</Operator>
              <div className="flex-1 rounded-xl border border-brand/30 bg-brand-soft/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Receita da base</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">{brl0(current.receitaBase)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {int(current.recompradores)} {current.recompradores === 1 ? "cliente" : "clientes"} · {int(current.pedidosBase)} {current.pedidosBase === 1 ? "pedido" : "pedidos"} · ticket {brl0(current.ticketPedido)}
                </p>
                <div className="mt-2">
                  <Variation
                    label="vs. janela anterior"
                    value={data.previous && data.previous.receitaBase > 0 ? ((current.receitaBase - data.previous.receitaBase) / data.previous.receitaBase) * 100 : null}
                  />
                </div>
              </div>
            </div>

            <div className={cn("rounded-xl border p-4", tone)}>
              <h3 className="font-semibold">{diagnosis.titulo}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{diagnosis.texto}</p>
              {diagnosis.observacoes.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {diagnosis.observacoes.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {diagnosis.acoes.map((a) => (
                  <Link
                    key={a.to}
                    to={a.to as never}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand"
                  >
                    {a.label}
                    <ArrowRight className="size-3" />
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                De onde veio a receita dos últimos {windowDays} dias ({brl0(current.receitaTotal)})
              </p>
              {current.receitaTotal > 0 ? (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                    <div className="bg-brand" style={{ width: `${(current.receitaBase / current.receitaTotal) * 100}%` }} title="Base ativa" />
                    <div className="bg-warning" style={{ width: `${(current.receitaReativados / current.receitaTotal) * 100}%` }} title="Reativados" />
                    <div className="bg-success" style={{ width: `${(current.receitaNovos / current.receitaTotal) * 100}%` }} title="Novos" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span><i className="mr-1 inline-block size-2 rounded-full bg-brand" />Base ativa {brl0(current.receitaBase)}</span>
                    <span><i className="mr-1 inline-block size-2 rounded-full bg-warning" />Reativados (voltaram após 12+ meses) {brl0(current.receitaReativados)} · {int(current.clientesReativados)}</span>
                    <span><i className="mr-1 inline-block size-2 rounded-full bg-success" />Novos {brl0(current.receitaNovos)} · {int(current.clientesNovos)}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sem pedidos válidos na janela.</p>
              )}
            </div>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Como esta leitura é feita</summary>
              <div className="mt-2 space-y-1.5">
                <p>
                  <strong>Clientes ativos</strong> = quem tinha ao menos 1 pedido pago nos 12 meses anteriores ao início da janela.{" "}
                  <strong>Taxa de recompra</strong> = % deles que comprou de novo dentro da janela.{" "}
                  <strong>Receita por cliente que voltou</strong> = soma dos pedidos pagos deles na janela ÷ quantos voltaram. O produto dos três é a receita da base.
                </p>
                <p>
                  {diagnosis.basis === "mediana" ? (
                    <>O gargalo é o fator cujo retorno à <strong>mediana das {data?.referenceCount ?? 0} janelas anteriores da própria loja</strong> mais aumentaria a receita da base (em reais).</>
                  ) : diagnosis.basis === "janela-anterior" ? (
                    <>Só há uma janela anterior com base suficiente, então o gargalo compara cada fator com ela; com mais meses de histórico passa a usar a mediana.</>
                  ) : (
                    <>Ainda não há janelas anteriores com base suficiente. A leitura é estrutural: olha quanto da base voltou a comprar e de onde veio a receita.</>
                  )}{" "}
                  Desvios menores que 5% da receita da base não contam. Só pedidos pagos e não cancelados da Shopify entram; o histórico importado da Tray não tem pedidos e fica de fora.
                </p>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
