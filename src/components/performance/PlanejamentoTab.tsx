import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMetaAdsPlanningBaseline, getMetaAdsPlanningRanges, getMetaAdsPlan, saveMetaAdsPlan } from "@/lib/meta-ads.functions";
import { brl } from "@/lib/crm-mock";
import type { PlanBaseline, PlanRanges, PlanRange } from "@/lib/meta-ads.server";

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

function RangeBar({ range, value }: { range: PlanRange; value: number }) {
  if (range.max <= range.min) return null;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const posPct = ((clamped - range.min) / (range.max - range.min)) * 100;
  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-full bg-muted">
        <div className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground" style={{ left: `${posPct}%` }} />
      </div>
    </div>
  );
}

export function PlanejamentoTab() {
  const queryClient = useQueryClient();
  const runBaseline = useServerFn(getMetaAdsPlanningBaseline);
  const runRanges = useServerFn(getMetaAdsPlanningRanges);
  const runPlan = useServerFn(getMetaAdsPlan);
  const runSave = useServerFn(saveMetaAdsPlan);

  const { data: baselineResult, isLoading: loadingBaseline } = useQuery({
    queryKey: ["meta-ads-planning-baseline"],
    queryFn: () => runBaseline(),
  });
  const { data: rangesResult } = useQuery({ queryKey: ["meta-ads-planning-ranges"], queryFn: () => runRanges() });
  const { data: plan, isLoading: loadingPlan } = useQuery({ queryKey: ["meta-ads-plan"], queryFn: () => runPlan() });

  const baseline: PlanBaseline | null = baselineResult?.success ? baselineResult.baseline : null;
  const ranges: PlanRanges | null = rangesResult?.success ? rangesResult.ranges : null;

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
    const pedidosPorSemana = (pedidos / 30) * 7;
    const cobertura = inputs.metaReceita ? receita / inputs.metaReceita : null;
    return { cliques, pedidos, receita, cpa, roas, diario, pedidosPorSemana, cobertura };
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

  // Checklist "Saúde do Plano" — inspirado no card da Axoly, mas com checagens que dá pra calcular
  // de verdade com o que temos: 50 conversões/semana é o número que a própria Meta recomenda pra
  // um conjunto sair da fase de aprendizado (documentado publicamente, não é chute nosso).
  const planChecklist = useMemo(() => {
    const financeiraOk = inputs.investimentoMensal > 0 && inputs.metaReceita !== null;
    const cpaOk = projection.cpa > 0 && healthChecks ? healthChecks.find((h) => h.key === "cpa")?.ok ?? false : false;
    const aprendizadoOk = projection.pedidosPorSemana >= 50;
    return [
      {
        label: "Coerência financeira",
        ok: financeiraOk,
        detail: financeiraOk ? "Investimento e meta de receita definidos." : "Defina o investimento mensal e a meta de receita.",
      },
      {
        label: "CPA factível",
        ok: cpaOk,
        detail: cpaOk
          ? "CPA planejado dentro do que a conta entrega hoje."
          : projection.cpa <= 0
            ? "CPA planejado ainda não calculado (preencha CPS e conversão)."
            : "CPA planejado distante do real dos últimos 30 dias.",
      },
      {
        label: "Orçamento mínimo de aprendizado",
        ok: aprendizadoOk,
        detail: aprendizadoOk
          ? `~${Math.round(projection.pedidosPorSemana)} conversões/semana projetadas — acima do mínimo de 50 que a Meta recomenda.`
          : `~${Math.round(projection.pedidosPorSemana)} conversões/semana projetadas — abaixo do mínimo de 50 que a Meta recomenda pra sair da fase de aprendizado.`,
      },
    ];
  }, [inputs, projection, healthChecks]);

  const checklistOkCount = planChecklist.filter((c) => c.ok).length;
  const planScore = Math.round(((healthyCount / 5 + checklistOkCount / 3) / 2) * 100);

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
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border">
            <Activity className="size-4 text-muted-foreground" />
            <span className={`text-lg font-bold ${planScore >= 70 ? "text-success" : planScore >= 40 ? "text-warning" : "text-critical"}`}>
              {planScore}
            </span>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saúde do plano</p>
            <p className="text-sm text-muted-foreground">
              {planScore >= 70 ? "Plano coerente com o histórico real da conta." : planScore >= 40 ? "Plano com pontos de atenção." : "Plano com risco — revise as premissas."}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {planChecklist.map((c) => (
            <div key={c.label} className="flex items-start gap-1.5 text-xs">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              )}
              <div>
                <p className="font-medium">{c.label}</p>
                <p className="text-muted-foreground">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          <p className="text-xs text-muted-foreground">Compara o plano com a faixa real (mín-máx diário) da conta nos últimos 30 dias.</p>

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
                  const range = ranges?.[h.key];
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
                        Planejado {meta.format(h.planned)} · Média (30d) {meta.format(h.real)}
                      </p>
                      {range && range.max > range.min && (
                        <>
                          <RangeBar range={range} value={h.planned} />
                          <p className="mt-0.5 flex justify-between text-[11px] text-muted-foreground">
                            <span>{meta.format(range.min)}</span>
                            <span>{meta.format(range.max)}</span>
                          </p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
