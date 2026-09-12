import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getMetaAdsRows } from "@/lib/meta-ads.functions";
import { brl } from "@/lib/crm-mock";
import type { MetaAdsDatePreset, MetaAdsRow, MetaAdsSummary } from "@/lib/meta-ads.server";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Classifica a campanha/conjunto pelo público pela convenção de nome já usada nesta conta
 *  (" LTV" = clientes existentes, " RMKT" = público engajado/remarketing, resto = novo público).
 *  Não vem de nenhum campo de targeting da Meta — é lido direto do nome, então é sempre
 *  conferível: se o nome não seguir esse padrão, a campanha cai em "Novo público". */
function classifyAudience(name: string): "novo" | "engajado" | "existente" {
  const n = name.toLowerCase();
  if (/\bltv\b/.test(n)) return "existente";
  if (/\brmkt\b/.test(n)) return "engajado";
  return "novo";
}

const AUDIENCE_LABEL: Record<ReturnType<typeof classifyAudience>, string> = {
  novo: "Novo público",
  engajado: "Público engajado",
  existente: "Clientes existentes",
};

type ProblemKind = "sem_conversao" | "gancho_fraco";

const PROBLEM_LABEL: Record<ProblemKind, string> = {
  sem_conversao: "Sem conversão",
  gancho_fraco: "Gancho fraco",
};

const PROBLEM_COLOR: Record<ProblemKind, string> = {
  sem_conversao: "error.main",
  gancho_fraco: "warning.main",
};

/** "Gancho fraco" é uma leitura nossa (ROAS bem abaixo da média da conta, mesmo com conversão) —
 *  não é o algoritmo exato da Axoly, que é fechado. Deixado explícito na UI. */
function classifyProblem(row: MetaAdsRow, accountRoas: number): ProblemKind | null {
  if (row.spend <= 0) return null;
  if (row.purchases === 0) return "sem_conversao";
  if (accountRoas > 0 && row.roas < accountRoas * 0.7) return "gancho_fraco";
  return null;
}

export function GestaoInsights({ datePreset, summary }: { datePreset: MetaAdsDatePreset; summary: MetaAdsSummary | null }) {
  const runRows = useServerFn(getMetaAdsRows);
  const { data: campaignResult } = useQuery({
    queryKey: ["meta-ads-rows", "campaign", datePreset],
    queryFn: () => runRows({ data: { level: "campaign", datePreset } }),
  });

  const rows = useMemo(
    () => ((campaignResult?.success ? campaignResult.rows : []) as MetaAdsRow[]).filter((r) => r.spend > 0),
    [campaignResult],
  );

  const totalSpend = rows.reduce((acc, r) => acc + r.spend, 0);
  const accountRoas = summary?.roas ?? 0;
  const cps = summary && summary.linkClicks > 0 ? summary.spend / summary.linkClicks : 0;

  const audienceGroups = useMemo(() => {
    const groups: Record<"novo" | "engajado" | "existente", { spend: number; purchases: number; revenue: number }> = {
      novo: { spend: 0, purchases: 0, revenue: 0 },
      engajado: { spend: 0, purchases: 0, revenue: 0 },
      existente: { spend: 0, purchases: 0, revenue: 0 },
    };
    for (const r of rows) {
      const key = classifyAudience(r.name);
      groups[key].spend += r.spend;
      groups[key].purchases += r.purchases;
      groups[key].revenue += r.revenue;
    }
    return groups;
  }, [rows]);

  const problemGroups = useMemo(() => {
    const groups: Record<ProblemKind, { spend: number; count: number; revenue: number }> = {
      sem_conversao: { spend: 0, count: 0, revenue: 0 },
      gancho_fraco: { spend: 0, count: 0, revenue: 0 },
    };
    for (const r of rows) {
      const kind = classifyProblem(r, accountRoas);
      if (!kind) continue;
      groups[kind].spend += r.spend;
      groups[kind].count += 1;
      groups[kind].revenue += r.revenue;
    }
    return groups;
  }, [rows, accountRoas]);

  const problemSpend = problemGroups.sem_conversao.spend + problemGroups.gancho_fraco.spend;
  const problemCount = problemGroups.sem_conversao.count + problemGroups.gancho_fraco.count;
  const maxProblemSpend = Math.max(problemGroups.sem_conversao.spend, problemGroups.gancho_fraco.spend, 1);
  const maxAudienceSpend = Math.max(audienceGroups.novo.spend, audienceGroups.engajado.spend, audienceGroups.existente.spend, 1);

  if (!summary || rows.length === 0) return null;

  return (
    <Grid container spacing={2} sx={{ mt: 0.5 }}>
      <Grid size={{ xs: 12, lg: 6 }}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2, height: "100%" }}>
          <Typography sx={{ fontWeight: 600 }}>As 3 alavancas — ROAS = Ticket × CVR ÷ CPS</Typography>
          <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
            <Grid size={4}>
              <Box sx={{ borderRadius: 2, bgcolor: "action.hover", p: 1.5, textAlign: "center" }}>
                <Typography variant="caption" color="text.secondary">CPS</Typography>
                <Typography sx={{ fontWeight: 700 }}>{brl(cps)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontSize: 11 }}>
                  Custo por Sessão = Investimento ÷ Link clicks.
                </Typography>
              </Box>
            </Grid>
            <Grid size={4}>
              <Box sx={{ borderRadius: 2, bgcolor: "action.hover", p: 1.5, textAlign: "center" }}>
                <Typography variant="caption" color="text.secondary">CVR</Typography>
                <Typography sx={{ fontWeight: 700 }}>{pct(summary.cvr)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontSize: 11 }}>
                  Taxa de Conversão = Compras ÷ Link clicks.
                </Typography>
              </Box>
            </Grid>
            <Grid size={4}>
              <Box sx={{ borderRadius: 2, bgcolor: "action.hover", p: 1.5, textAlign: "center" }}>
                <Typography variant="caption" color="text.secondary">Ticket médio</Typography>
                <Typography sx={{ fontWeight: 700 }}>{brl(summary.ticket)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontSize: 11 }}>
                  Faturado ÷ Compras.
                </Typography>
              </Box>
            </Grid>
          </Grid>
          <Box sx={{ mt: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary" component="span">
              ROAS resultante{" "}
            </Typography>
            <Typography sx={{ fontWeight: 700 }} component="span">
              {accountRoas.toFixed(2)}x
            </Typography>
          </Box>
        </Box>
      </Grid>

      <Grid size={{ xs: 12, lg: 6 }}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2, height: "100%" }}>
          <Typography sx={{ fontWeight: 600 }}>Análises Estratégicas</Typography>
          <Typography variant="caption" sx={{ display: "block", mt: 1, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
            O que está prejudicando o ROI
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {problemCount} de {rows.length} campanhas com problema · {brl(problemSpend)} em risco
            {totalSpend > 0 ? ` (${pct(problemSpend / totalSpend)} da verba de ${brl(totalSpend)})` : ""}
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {(["gancho_fraco", "sem_conversao"] as ProblemKind[]).map((kind) => {
              const g = problemGroups[kind]!;
              if (g.count === 0) return null;
              const groupRoas = g.spend > 0 ? g.revenue / g.spend : 0;
              return (
                <Box key={kind}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: PROBLEM_COLOR[kind] }} />
                      <Typography variant="body2">{PROBLEM_LABEL[kind]}</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {brl(g.spend)} · {totalSpend > 0 ? pct(g.spend / totalSpend) : "0%"} · {g.count} camp.
                    </Typography>
                  </Stack>
                  <Box sx={{ mt: 0.5, height: 6, borderRadius: 999, bgcolor: "action.hover" }}>
                    <Box sx={{ height: 6, borderRadius: 999, bgcolor: PROBLEM_COLOR[kind], width: `${Math.max(2, (g.spend / maxProblemSpend) * 100)}%` }} />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    ROAS do grupo {groupRoas.toFixed(2)}x
                  </Typography>
                </Box>
              );
            })}
            {problemCount === 0 && (
              <Typography variant="body2" color="text.secondary">
                Nenhuma campanha com problema nesse período.
              </Typography>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, fontSize: 11 }}>
            "Gancho fraco" = tem conversão mas ROAS abaixo de 70% do ROAS da conta — leitura nossa, não é o critério exato de nenhuma outra ferramenta.
          </Typography>

          <Typography variant="caption" sx={{ display: "block", mt: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
            Onde está indo a verba
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {(["novo", "engajado", "existente"] as const).map((key) => {
              const g = audienceGroups[key]!;
              const groupRoas = g.spend > 0 ? g.revenue / g.spend : 0;
              const groupCpa = g.purchases > 0 ? g.spend / g.purchases : 0;
              return (
                <Box key={key}>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="body2">{AUDIENCE_LABEL[key]}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {totalSpend > 0 ? pct(g.spend / totalSpend) : "0%"}
                    </Typography>
                  </Stack>
                  <Box sx={{ mt: 0.5, height: 6, borderRadius: 999, bgcolor: "action.hover" }}>
                    <Box sx={{ height: 6, borderRadius: 999, bgcolor: "primary.main", width: `${Math.max(2, (g.spend / maxAudienceSpend) * 100)}%` }} />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    Gasto {brl(g.spend)} · ROAS {groupRoas.toFixed(2)}x · CPA {g.purchases > 0 ? brl(groupCpa) : "—"} · Compras {g.purchases}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, fontSize: 11 }}>
            Classificado pelo nome da campanha/conjunto (" LTV" = clientes existentes, " RMKT" = engajado, resto = novo público).
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );
}
