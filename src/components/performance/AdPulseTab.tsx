import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Play, Pause, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getMetaAdsPulse,
  listMetaAdsRules,
  createMetaAdsRule,
  toggleMetaAdsRule,
  deleteMetaAdsRule,
  setMetaAdsStatus,
} from "@/lib/meta-ads.functions";
import { brl } from "@/lib/crm-mock";
import type { MetaAdsDatePreset, MetaAdsRule, AdPulseRow } from "@/lib/meta-ads.server";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "bg-success-soft text-success",
  PAUSED: "bg-muted text-muted-foreground",
  ARCHIVED: "bg-muted text-muted-foreground",
  DELETED: "bg-critical-soft text-critical",
};

type Tone = "good" | "mid" | "bad";
const TONE_CLASS: Record<Tone, string> = {
  good: "bg-success-soft text-success",
  mid: "bg-warning-soft text-warning",
  bad: "bg-critical-soft text-critical",
};

/** Compara o valor do anúncio com a média do que está sendo exibido na tabela (não um benchmark
 *  fixo) — mesmo espírito do semáforo de cores visto na Axoly. >=15% melhor que a média = verde,
 *  >=15% pior = vermelho, no meio = laranja. */
function metricTone(value: number, avg: number, lowerIsBetter: boolean): Tone {
  if (avg <= 0) return "mid";
  const ratio = value / avg;
  if (lowerIsBetter) {
    if (ratio <= 0.85) return "good";
    if (ratio >= 1.15) return "bad";
    return "mid";
  }
  if (ratio >= 1.15) return "good";
  if (ratio <= 0.85) return "bad";
  return "mid";
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function ruleLabel(r: MetaAdsRule): string {
  const metric = r.metric === "roas" ? "ROAS" : "CPA";
  const op = r.operator === "gt" ? "acima de" : "abaixo de";
  const value = r.metric === "roas" ? `${r.value.toFixed(2)}x` : brl(r.value);
  return `${metric} ${op} ${value}`;
}

export function AdPulseTab({ datePreset }: { datePreset: MetaAdsDatePreset }) {
  const queryClient = useQueryClient();
  const runPulse = useServerFn(getMetaAdsPulse);
  const runRules = useServerFn(listMetaAdsRules);
  const runCreateRule = useServerFn(createMetaAdsRule);
  const runToggleRule = useServerFn(toggleMetaAdsRule);
  const runDeleteRule = useServerFn(deleteMetaAdsRule);
  const runSetStatus = useServerFn(setMetaAdsStatus);

  const [onlyActive, setOnlyActive] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleMetric, setRuleMetric] = useState<"cpa" | "roas">("roas");
  const [ruleOperator, setRuleOperator] = useState<"gt" | "lt">("lt");
  const [ruleValue, setRuleValue] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: pulseResult, isLoading } = useQuery({
    queryKey: ["meta-ads-pulse", datePreset],
    queryFn: () => runPulse({ data: { datePreset } }),
  });

  const { data: rules } = useQuery({ queryKey: ["meta-ads-rules"], queryFn: () => runRules() });

  const handleCreateRule = async () => {
    const value = Number(ruleValue.replace(",", "."));
    if (!value || value <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setCreating(true);
    try {
      const res = await runCreateRule({ data: { metric: ruleMetric, operator: ruleOperator, value } });
      if (!res.success) {
        toast.error(res.error || "Falha ao criar regra.");
        return;
      }
      toast.success("Regra criada.");
      setRuleOpen(false);
      setRuleValue("");
      queryClient.invalidateQueries({ queryKey: ["meta-ads-rules"] });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRule = async (id: string, ativa: boolean) => {
    await runToggleRule({ data: { id, ativa } });
    queryClient.invalidateQueries({ queryKey: ["meta-ads-rules"] });
  };

  const handleDeleteRule = async (id: string) => {
    await runDeleteRule({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["meta-ads-rules"] });
    toast.success("Regra removida.");
  };

  const handleToggleStatus = async (row: AdPulseRow) => {
    const next = row.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await runSetStatus({ data: { id: row.id, status: next } });
      if (!res.success) {
        toast.error(res.error || "Falha ao atualizar status.");
        return;
      }
      toast.success(next === "ACTIVE" ? "Reativado na Meta." : "Pausado na Meta.");
      queryClient.invalidateQueries({ queryKey: ["meta-ads-pulse"] });
    } catch (err: any) {
      toast.error("Erro: " + (err?.message ?? "falha desconhecida"));
    }
  };

  const result = pulseResult?.success ? pulseResult.result : null;

  const rows = useMemo(() => {
    const all = result?.rows ?? [];
    return onlyActive ? all.filter((r) => r.status === "ACTIVE") : all;
  }, [result, onlyActive]);

  const averages = useMemo(() => {
    const withSpend = rows.filter((r) => r.spend > 0);
    return {
      cps: average(withSpend.map((r) => r.cps)),
      cvr: average(withSpend.map((r) => r.cvr)),
      ticket: average(withSpend.map((r) => r.ticket)),
      roas: average(withSpend.map((r) => r.roas)),
    };
  }, [rows]);

  return (
    <div className="mt-4">
      <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        Sugestões baseadas em CPA, ROAS e volume de conversões — a decisão final é sua. Nenhuma ação é tomada
        automaticamente; pausar, reativar ou escalar é sempre um clique seu.
      </p>

      {isLoading && <p className="mt-4 text-center text-muted-foreground">Carregando...</p>}
      {!isLoading && pulseResult && !pulseResult.success && (
        <p className="mt-4 text-center text-muted-foreground">{pulseResult.error}</p>
      )}

      {result && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sem retorno</p>
            <p className="mt-1 text-2xl font-bold text-critical">{brl(result.noReturnSpend)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{result.noReturnCount} anúncio(s) com gasto e 0 compras</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Upside estimado ao escalar</p>
            <p className="mt-1 text-2xl font-bold text-success">{brl(result.upsideEstimate)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Estimativa a partir do ROAS acima da média — não é previsão</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Investimento total</p>
            <p className="mt-1 text-2xl font-bold">{brl(result.totalSpend)}</p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Regras automatizadas</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRuleOpen(true)}>
            <Plus className="size-3.5" /> Criar regra
          </Button>
        </div>
        {(!rules || rules.length === 0) && (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma regra ativa — crie uma regra de CPA ou ROAS pra vigiar os anúncios.</p>
        )}
        {rules && rules.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span className={r.ativa ? "" : "text-muted-foreground line-through"}>{ruleLabel(r)}</span>
                <div className="flex items-center gap-2">
                  <Switch checked={r.ativa} onCheckedChange={(v) => handleToggleRule(r.id, v)} />
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => handleDeleteRule(r.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyActive} onCheckedChange={setOnlyActive} /> Só ativas
        </label>
      </div>

      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Anúncio</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Gasto</th>
              <th className="px-4 py-3 text-right font-medium">% Conta</th>
              <th className="px-4 py-3 text-right font-medium">CPM</th>
              <th className="px-4 py-3 text-right font-medium">ThumbStop</th>
              <th className="px-4 py-3 text-right font-medium">CTR</th>
              <th className="px-4 py-3 text-right font-medium">CPS</th>
              <th className="px-4 py-3 text-right font-medium">CVR</th>
              <th className="px-4 py-3 text-right font-medium">Ticket</th>
              <th className="px-4 py-3 text-right font-medium">CPA</th>
              <th className="px-4 py-3 text-right font-medium">Compras</th>
              <th className="px-4 py-3 text-right font-medium">ROAS</th>
              <th className="px-4 py-3 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">Nenhum anúncio nesse período.</td>
              </tr>
            )}
            {rows.map((r) => {
              const cpsTone = metricTone(r.cps, averages.cps, true);
              const cvrTone = metricTone(r.cvr, averages.cvr, false);
              const ticketTone = metricTone(r.ticket, averages.ticket, false);
              const roasTone = metricTone(r.roas, averages.roas, false);
              return (
                <tr key={r.id} className={`border-t border-border ${r.brokenRules.length > 0 ? "bg-critical-soft/30" : ""}`}>
                  <td className="max-w-[260px] px-4 py-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      {r.brokenRules.length > 0 && (
                        <AlertTriangle className="size-3.5 shrink-0 text-critical" />
                      )}
                      <span className="truncate" title={r.brokenRules.length > 0 ? r.brokenRules.map(ruleLabel).join(" · ") : r.name}>
                        {r.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[r.status] ?? "bg-muted text-muted-foreground"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{brl(r.spend)}</td>
                  <td className="px-4 py-3 text-right">{pct(r.pctAccount)}</td>
                  <td className="px-4 py-3 text-right">{brl(r.cpm)}</td>
                  <td className="px-4 py-3 text-right">{pct(r.thumbstop)}</td>
                  <td className="px-4 py-3 text-right">{pct(r.ctr / 100)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${TONE_CLASS[cpsTone]}`}>{brl(r.cps)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${TONE_CLASS[cvrTone]}`}>{pct(r.cvr)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${TONE_CLASS[ticketTone]}`}>{brl(r.ticket)}</td>
                  <td className="px-4 py-3 text-right">{brl(r.cpa)}</td>
                  <td className="px-4 py-3 text-right">{r.purchases}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${TONE_CLASS[roasTone]}`}>{r.roas.toFixed(2)}x</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title={r.status === "ACTIVE" ? "Pausar" : "Ativar"}
                      onClick={() => handleToggleStatus(r)}
                    >
                      {r.status === "ACTIVE" ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-sm">
          <h2 className="text-lg font-semibold">Nova regra</h2>
          <p className="text-sm text-muted-foreground">Anúncios que baterem essa condição ficam destacados na tabela.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Métrica</label>
              <Select value={ruleMetric} onValueChange={(v) => setRuleMetric(v as typeof ruleMetric)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="roas">ROAS</SelectItem>
                  <SelectItem value="cpa">CPA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Condição</label>
              <Select value={ruleOperator} onValueChange={(v) => setRuleOperator(v as typeof ruleOperator)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lt">Abaixo de</SelectItem>
                  <SelectItem value="gt">Acima de</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Valor {ruleMetric === "roas" ? "(x)" : "(R$)"}</label>
            <Input value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} placeholder={ruleMetric === "roas" ? "ex: 2" : "ex: 50"} />
          </div>
          <Button onClick={handleCreateRule} disabled={creating} className="w-full">
            {creating ? "Criando..." : "Criar regra"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
