import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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

const PROBLEM_DOT: Record<ProblemKind, string> = {
  sem_conversao: "bg-critical",
  gancho_fraco: "bg-warning",
};

const PROBLEM_BAR: Record<ProblemKind, string> = {
  sem_conversao: "bg-critical",
  gancho_fraco: "bg-warning",
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
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-semibold">As 3 alavancas — ROAS = Ticket × CVR ÷ CPS</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">CPS</p>
            <p className="text-lg font-bold">{brl(cps)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Custo por Sessão = Investimento ÷ Link clicks.</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">CVR</p>
            <p className="text-lg font-bold">{pct(summary.cvr)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Taxa de Conversão = Compras ÷ Link clicks.</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">Ticket médio</p>
            <p className="text-lg font-bold">{brl(summary.ticket)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Faturado ÷ Compras.</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border p-3 text-center">
          <span className="text-sm text-muted-foreground">ROAS resultante </span>
          <span className="text-lg font-bold">{accountRoas.toFixed(2)}x</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Análises Estratégicas</p>
        </div>
        <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">O que está prejudicando o ROI</p>
        <p className="text-xs text-muted-foreground">
          {problemCount} de {rows.length} campanhas com problema · {brl(problemSpend)} em risco
          {totalSpend > 0 ? ` (${pct(problemSpend / totalSpend)} da verba de ${brl(totalSpend)})` : ""}
        </p>
        <div className="mt-2 space-y-2">
          {(["gancho_fraco", "sem_conversao"] as ProblemKind[]).map((kind) => {
            const g = problemGroups[kind]!;
            if (g.count === 0) return null;
            const groupRoas = g.spend > 0 ? g.revenue / g.spend : 0;
            return (
              <div key={kind}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${PROBLEM_DOT[kind]}`} />
                    {PROBLEM_LABEL[kind]}
                  </span>
                  <span className="text-muted-foreground">
                    {brl(g.spend)} · {totalSpend > 0 ? pct(g.spend / totalSpend) : "0%"} · {g.count} camp.
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className={`h-1.5 rounded-full ${PROBLEM_BAR[kind]}`} style={{ width: `${Math.max(2, (g.spend / maxProblemSpend) * 100)}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">ROAS do grupo {groupRoas.toFixed(2)}x</p>
              </div>
            );
          })}
          {problemCount === 0 && <p className="text-sm text-muted-foreground">Nenhuma campanha com problema nesse período.</p>}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          "Gancho fraco" = tem conversão mas ROAS abaixo de 70% do ROAS da conta — leitura nossa, não é o critério exato de nenhuma outra ferramenta.
        </p>

        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Onde está indo a verba</p>
        <div className="mt-2 space-y-2">
          {(["novo", "engajado", "existente"] as const).map((key) => {
            const g = audienceGroups[key]!;
            const groupRoas = g.spend > 0 ? g.revenue / g.spend : 0;
            const groupCpa = g.purchases > 0 ? g.spend / g.purchases : 0;
            return (
              <div key={key}>
                <div className="flex items-center justify-between text-sm">
                  <span>{AUDIENCE_LABEL[key]}</span>
                  <span className="text-muted-foreground">{totalSpend > 0 ? pct(g.spend / totalSpend) : "0%"}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (g.spend / maxAudienceSpend) * 100)}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Gasto {brl(g.spend)} · ROAS {groupRoas.toFixed(2)}x · CPA {g.purchases > 0 ? brl(groupCpa) : "—"} · Compras {g.purchases}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Classificado pelo nome da campanha/conjunto (" LTV" = clientes existentes, " RMKT" = engajado, resto = novo público).
        </p>
      </div>
    </div>
  );
}
