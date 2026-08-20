import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMetaAdsPlanningBaseline, getMetaAdsPlan, saveMetaAdsPlan } from "@/lib/meta-ads.functions";
import { brl } from "@/lib/crm-mock";
import type { PlanBaseline } from "@/lib/meta-ads.server";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

type MetricKey = "cps" | "cvr" | "ticket" | "cpa" | "roas";

const METRIC_META: Record<MetricKey, { label: string; lowerIsBetter: boolean; format: (v: number) => string }> = {
  cps: { label: "CPS", lowerIsBetter: true, format: brl },
  cvr: { label: "Taxa de Conversão", lowerIsBetter: false, format: pct },
  ticket: { label: "Ticket Médio", lowerIsBetter: false, format: brl },
  cpa: { label: "CPA", lowerIsBetter: true, format: brl },
  roas: { label: "ROAS Planejado", lowerIsBetter: false, format: (v) => `${v.toFixed(2)}x` },
};

/** "Saudável" = dentro de ±30% do baseline real da conta (últimos 30 dias) — limiar nosso,
 *  documentado, não é o critério exato de nenhuma outra ferramenta. */
function isHealthy(planned: number, real: number, lowerIsBetter: boolean): boolean {
  if (real <= 0) return planned <= 0;
  const ratio = planned / real;
  return lowerIsBetter ? ratio <= 1.3 : ratio >= 0.7;
}

function parseNum(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function PlanejamentoTab() {
  const queryClient = useQueryClient();
  const runBaseline = useServerFn(getMetaAdsPlanningBaseline);
  const runPlan = useServerFn(getMetaAdsPlan);
  const runSave = useServerFn(saveMetaAdsPlan);

  const { data: baselineResult, isLoading: loadingBaseline } = useQuery({
    queryKey: ["meta-ads-planning-baseline"],
    queryFn: () => runBaseline(),
  });
  const { data: plan, isLoading: loadingPlan } = useQuery({ queryKey: ["meta-ads-plan"], queryFn: () => runPlan() });

  const baseline: PlanBaseline | null = baselineResult?.success ? baselineResult.baseline : null;

  const [investimento, setInvestimento] = useState("");
  const [metaReceita, setMetaReceita] = useState("");
  const [ticket, setTicket] = useState("");
  const [cvr, setCvr] = useState("");
  const [cps, setCps] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || loadingBaseline || loadingPlan) return;
    if (plan) {
      setInvestimento(String(plan.investimentoMensal));
      setMetaReceita(plan.metaReceita != null ? String(plan.metaReceita) : "");
      setTicket(String(plan.ticketMedio));
      setCvr(String((plan.taxaConversao * 100).toFixed(2)));
      setCps(String(plan.cps));
    } else if (baseline) {
      setTicket(baseline.ticket > 0 ? baseline.ticket.toFixed(2) : "");
      setCvr(baseline.cvr > 0 ? (baseline.cvr * 100).toFixed(2) : "");
      setCps(baseline.cps > 0 ? baseline.cps.toFixed(2) : "");
    }
    setInitialized(true);
  }, [plan, baseline, loadingBaseline, loadingPlan, initialized]);

  const inputs = useMemo(
    () => ({
      investimentoMensal: parseNum(investimento),
      metaReceita: metaReceita.trim() ? parseNum(metaReceita) : null,
      ticketMedio: parseNum(ticket),
      taxaConversao: parseNum(cvr) / 100,
      cps: parseNum(cps),
    }),
    [investimento, metaReceita, ticket, cvr, cps],
  );

  const projection = useMemo(() => {
    const { investimentoMensal, ticketMedio, taxaConversao, cps: cpsVal } = inputs;
    const cliques = cpsVal > 0 ? investimentoMensal / cpsVal : 0;
    const pedidos = cliques * taxaConversao;
    const receita = pedidos * ticketMedio;
    const cpa = pedidos > 0 ? investimentoMensal / pedidos : 0;
    const roas = investimentoMensal > 0 ? receita / investimentoMensal : 0;
    const diario = investimentoMensal / 30;
    const cobertura = inputs.metaReceita ? receita / inputs.metaReceita : null;
    return { cliques, pedidos, receita, cpa, roas, diario, cobertura };
  }, [inputs]);

  const healthChecks = useMemo(() => {
    if (!baseline) return null;
    const items: { key: MetricKey; planned: number; real: number; ok: boolean }[] = [
      { key: "cps" as const, planned: inputs.cps, real: baseline.cps, ok: false },
      { key: "cvr" as const, planned: inputs.taxaConversao, real: baseline.cvr, ok: false },
      { key: "ticket" as const, planned: inputs.ticketMedio, real: baseline.ticket, ok: false },
      { key: "cpa" as const, planned: projection.cpa, real: baseline.cpa, ok: false },
      { key: "roas" as const, planned: projection.roas, real: baseline.roas, ok: false },
    ].map((i) => ({ ...i, ok: isHealthy(i.planned, i.real, METRIC_META[i.key].lowerIsBetter) }));
    return items;
  }, [baseline, inputs, projection]);

  const healthyCount = healthChecks?.filter((h) => h.ok).length ?? 0;

  const handleSave = async () => {
    if (inputs.investimentoMensal <= 0 || inputs.ticketMedio <= 0 || inputs.taxaConversao <= 0 || inputs.cps <= 0) {
      toast.error("Preencha investimento, ticket, taxa de conversão e CPS.");
      return;
    }
    setSaving(true);
    try {
      const res = await runSave({ data: inputs });
      if (!res.success) {
        toast.error(res.error || "Falha ao salvar.");
        return;
      }
      toast.success("Plano salvo.");
      queryClient.invalidateQueries({ queryKey: ["meta-ads-plan"] });
    } finally {
      setSaving(false);
    }
  };

  if (loadingBaseline || loadingPlan) return <p className="mt-6 text-center text-muted-foreground">Carregando...</p>;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-semibold">Etapa 1 — Orçamento</p>
        <p className="text-xs text-muted-foreground">
          Ticket, taxa de conversão e CPS já vêm pré-preenchidos com a média real dos últimos 30 dias — ajuste se quiser planejar diferente.
        </p>

        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Investimento mensal (R$)</label>
            <Input value={investimento} onChange={(e) => setInvestimento(e.target.value)} placeholder="ex: 10000" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Meta de receita (R$, opcional)</label>
            <Input value={metaReceita} onChange={(e) => setMetaReceita(e.target.value)} placeholder="ex: 50000" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ticket médio (R$)</label>
              <Input value={ticket} onChange={(e) => setTicket(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Conversão (%)</label>
              <Input value={cvr} onChange={(e) => setCvr(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">CPS (R$)</label>
              <Input value={cps} onChange={(e) => setCps(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Investimento diário</p><p className="font-semibold">{brl(projection.diario)}</p></div>
          <div><p className="text-xs text-muted-foreground">Pedidos projetados</p><p className="font-semibold">{Math.round(projection.pedidos)}</p></div>
          <div><p className="text-xs text-muted-foreground">Receita projetada</p><p className="font-semibold">{brl(projection.receita)}</p></div>
          <div><p className="text-xs text-muted-foreground">CPA implícito</p><p className="font-semibold">{brl(projection.cpa)}</p></div>
          <div><p className="text-xs text-muted-foreground">ROAS planejado</p><p className="font-semibold">{projection.roas.toFixed(2)}x</p></div>
          {projection.cobertura !== null && (
            <div><p className="text-xs text-muted-foreground">Cobertura da meta</p><p className="font-semibold">{pct(projection.cobertura)}</p></div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-4 w-full">
          {saving ? "Salvando..." : "Salvar plano"}
        </Button>
        {plan && <p className="mt-1 text-center text-xs text-muted-foreground">Última atualização: {new Date(plan.updatedAt).toLocaleString("pt-BR")}</p>}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-semibold">Etapa 2 — Validação Matemática</p>
        <p className="text-xs text-muted-foreground">Compara o plano com o desempenho real da conta nos últimos 30 dias.</p>

        {!baseline || baseline.roas === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Sem histórico suficiente nos últimos 30 dias pra validar contra dado real.</p>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium">
              {healthyCount} de 5 métricas saudáveis —{" "}
              {healthyCount >= 4 ? "plano coerente com o histórico real" : healthyCount >= 2 ? "plano com pontos de atenção" : "plano com risco — metas distantes do real"}
            </p>
            <div className="mt-2 space-y-2">
              {healthChecks!.map((h) => {
                const meta = METRIC_META[h.key];
                const delta = h.real > 0 ? (h.planned / h.real - 1) * 100 : 0;
                return (
                  <div key={h.key} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className={`size-2 rounded-full ${h.ok ? "bg-success" : "bg-critical"}`} />
                        {meta.label}
                      </span>
                      <span className={h.ok ? "text-success" : "text-critical"}>
                        {delta >= 0 ? "+" : ""}
                        {delta.toFixed(0)}% vs. real
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Planejado {meta.format(h.planned)} · Real (30d) {meta.format(h.real)}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
