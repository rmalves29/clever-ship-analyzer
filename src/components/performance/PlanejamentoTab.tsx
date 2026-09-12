import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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
    <Box sx={{ mt: 1, position: "relative", height: 6, borderRadius: 999, bgcolor: "action.hover" }}>
      <Box sx={{ position: "absolute", top: -2, height: 10, width: 2, borderRadius: 999, bgcolor: "text.primary", left: `${posPct}%` }} />
    </Box>
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

  if (loadingBaseline || loadingPlan) {
    return (
      <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
        Carregando...
      </Typography>
    );
  }

  const scoreColor = planScore >= 70 ? "success.main" : planScore >= 40 ? "warning.main" : "error.main";

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Stack
            sx={{ width: 56, height: 56, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 3, border: "1px solid", borderColor: "divider" }}
          >
            <Activity size={16} color="var(--mui-palette-text-secondary)" />
            <Typography sx={{ fontWeight: 700, color: scoreColor }}>{planScore}</Typography>
          </Stack>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
              Saúde do plano
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {planScore >= 70 ? "Plano coerente com o histórico real da conta." : planScore >= 40 ? "Plano com pontos de atenção." : "Plano com risco — revise as premissas."}
            </Typography>
          </Box>
        </Stack>
        <Grid container spacing={1.5} sx={{ mt: 1 }}>
          {planChecklist.map((c) => (
            <Grid key={c.label} size={{ xs: 12, sm: 4 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "flex-start" }}>
                {c.ok ? (
                  <CheckCircle2 size={14} color="var(--mui-palette-success-main, #28C76F)" style={{ marginTop: 2, flexShrink: 0 }} />
                ) : (
                  <AlertTriangle size={14} color="var(--mui-palette-warning-main, #FF9F43)" style={{ marginTop: 2, flexShrink: 0 }} />
                )}
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>
                    {c.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {c.detail}
                  </Typography>
                </Box>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2, height: "100%" }}>
            <Typography sx={{ fontWeight: 600 }}>Etapa 1 — Orçamento</Typography>
            <Typography variant="caption" color="text.secondary">
              Ticket, taxa de conversão e CPS já vêm pré-preenchidos com a média real dos últimos 30 dias — ajuste se quiser planejar diferente.
            </Typography>

            <Stack spacing={1.5} sx={{ mt: 1.5 }}>
              <TextField size="small" fullWidth label="Investimento mensal (R$)" value={investimento} onChange={(e) => setInvestimento(e.target.value)} placeholder="ex: 10000" />
              <TextField size="small" fullWidth label="Meta de receita (R$, opcional)" value={metaReceita} onChange={(e) => setMetaReceita(e.target.value)} placeholder="ex: 50000" />
              <Grid container spacing={1}>
                <Grid size={4}>
                  <TextField size="small" fullWidth label="Ticket médio (R$)" value={ticket} onChange={(e) => setTicket(e.target.value)} />
                </Grid>
                <Grid size={4}>
                  <TextField size="small" fullWidth label="Conversão (%)" value={cvr} onChange={(e) => setCvr(e.target.value)} />
                </Grid>
                <Grid size={4}>
                  <TextField size="small" fullWidth label="CPS (R$)" value={cps} onChange={(e) => setCps(e.target.value)} />
                </Grid>
              </Grid>
            </Stack>

            <Grid container spacing={1} sx={{ mt: 1.5, borderRadius: 2, bgcolor: "action.hover", p: 1.5 }}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Investimento diário</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{brl(projection.diario)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Pedidos projetados</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{Math.round(projection.pedidos)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Receita projetada</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{brl(projection.receita)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>CPA implícito</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{brl(projection.cpa)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>ROAS planejado</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{projection.roas.toFixed(2)}x</Typography>
              </Grid>
              {projection.cobertura !== null && (
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Cobertura da meta</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{pct(projection.cobertura)}</Typography>
                </Grid>
              )}
            </Grid>

            <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar plano"}
            </Button>
            {plan && (
              <Typography variant="caption" color="text.secondary" align="center" sx={{ display: "block", mt: 0.5 }}>
                Última atualização: {new Date(plan.updatedAt).toLocaleString("pt-BR")}
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2, height: "100%" }}>
            <Typography sx={{ fontWeight: 600 }}>Etapa 2 — Validação Matemática</Typography>
            <Typography variant="caption" color="text.secondary">
              Compara o plano com a faixa real (mín-máx diário) da conta nos últimos 30 dias.
            </Typography>

            {!baseline || baseline.roas === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Sem histórico suficiente nos últimos 30 dias pra validar contra dado real.
              </Typography>
            ) : (
              <>
                <Typography variant="body2" sx={{ fontWeight: 500, mt: 1.5 }}>
                  {healthyCount} de 5 métricas saudáveis —{" "}
                  {healthyCount >= 4 ? "plano coerente com o histórico real" : healthyCount >= 2 ? "plano com pontos de atenção" : "plano com risco — metas distantes do real"}
                </Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {healthChecks!.map((h) => {
                    const meta = METRIC_META[h.key];
                    const delta = h.real > 0 ? (h.planned / h.real - 1) * 100 : 0;
                    const range = ranges?.[h.key];
                    return (
                      <Box key={h.key} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25 }}>
                        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: h.ok ? "success.main" : "error.main" }} />
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {meta.label}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" sx={{ color: h.ok ? "success.main" : "error.main" }}>
                            {delta >= 0 ? "+" : ""}
                            {delta.toFixed(0)}% vs. real
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                          Planejado {meta.format(h.planned)} · Média (30d) {meta.format(h.real)}
                        </Typography>
                        {range && range.max > range.min && (
                          <>
                            <RangeBar range={range} value={h.planned} />
                            <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.25 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{meta.format(range.min)}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{meta.format(range.max)}</Typography>
                            </Stack>
                          </>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </>
            )}
          </Box>
        </Grid>
      </Grid>
    </Stack>
  );
}
