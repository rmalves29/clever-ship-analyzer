import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Play, Pause, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";
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
const STATUS_COLOR: Record<string, ChipProps["color"]> = {
  ACTIVE: "success",
  PAUSED: "default",
  ARCHIVED: "default",
  DELETED: "error",
};

type Tone = "good" | "mid" | "bad";
const TONE_SX: Record<Tone, string> = {
  good: "success.main",
  mid: "warning.main",
  bad: "error.main",
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
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", borderRadius: 2, bgcolor: "action.hover", p: 1.5 }}>
        Sugestões baseadas em CPA, ROAS e volume de conversões — a decisão final é sua. Nenhuma ação é tomada
        automaticamente; pausar, reativar ou escalar é sempre um clique seu.
      </Typography>

      {isLoading && (
        <Typography align="center" color="text.secondary" sx={{ mt: 2 }}>
          Carregando...
        </Typography>
      )}
      {!isLoading && pulseResult && !pulseResult.success && (
        <Typography align="center" color="text.secondary" sx={{ mt: 2 }}>
          {pulseResult.error}
        </Typography>
      )}

      {result && (
        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 6, md: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
                Sem retorno
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: "error.main" }}>
                {brl(result.noReturnSpend)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {result.noReturnCount} anúncio(s) com gasto e 0 compras
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
                Upside estimado ao escalar
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: "success.main" }}>
                {brl(result.upsideEstimate)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Estimativa a partir do ROAS acima da média — não é previsão
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
                Investimento total
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                {brl(result.totalSpend)}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      )}

      <Box sx={{ mt: 2, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography sx={{ fontWeight: 600 }}>Regras automatizadas</Typography>
          <Button size="small" variant="outline" startIcon={<Plus size={14} />} onClick={() => setRuleOpen(true)}>
            Criar regra
          </Button>
        </Stack>
        {(!rules || rules.length === 0) && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Nenhuma regra ativa — crie uma regra de CPA ou ROAS pra vigiar os anúncios.
          </Typography>
        )}
        {rules && rules.length > 0 && (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {rules.map((r) => (
              <Stack key={r.id} direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" sx={{ color: r.ativa ? "text.primary" : "text.secondary", textDecoration: r.ativa ? "none" : "line-through" }}>
                  {ruleLabel(r)}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Switch size="small" checked={r.ativa} onChange={(e) => handleToggleRule(r.id, e.target.checked)} />
                  <IconButton size="small" onClick={() => handleDeleteRule(r.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>

      <Stack direction="row" sx={{ justifyContent: "flex-end", alignItems: "center", mt: 2 }} spacing={1}>
        <Typography variant="body2">Só ativas</Typography>
        <Switch checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
      </Stack>

      <TableContainer sx={{ mt: 1, border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow>
              <TableCell>Anúncio</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Gasto</TableCell>
              <TableCell align="right">% Conta</TableCell>
              <TableCell align="right">CPM</TableCell>
              <TableCell align="right">ThumbStop</TableCell>
              <TableCell align="right">CTR</TableCell>
              <TableCell align="right">CPS</TableCell>
              <TableCell align="right">CVR</TableCell>
              <TableCell align="right">Ticket</TableCell>
              <TableCell align="right">CPA</TableCell>
              <TableCell align="right">Compras</TableCell>
              <TableCell align="right">ROAS</TableCell>
              <TableCell align="right">Ação</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  Nenhum anúncio nesse período.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const cpsTone = metricTone(r.cps, averages.cps, true);
              const cvrTone = metricTone(r.cvr, averages.cvr, false);
              const ticketTone = metricTone(r.ticket, averages.ticket, false);
              const roasTone = metricTone(r.roas, averages.roas, false);
              return (
                <TableRow key={r.id} sx={r.brokenRules.length > 0 ? { bgcolor: "error.50" } : undefined}>
                  <TableCell sx={{ maxWidth: 260, fontWeight: 500 }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                      {r.brokenRules.length > 0 && <AlertTriangle size={14} color="var(--mui-palette-error-main, #EA5455)" style={{ flexShrink: 0 }} />}
                      <Typography
                        variant="body2"
                        sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={r.brokenRules.length > 0 ? r.brokenRules.map(ruleLabel).join(" · ") : r.name}
                      >
                        {r.name}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[r.status] ?? "default"} label={r.status} />
                  </TableCell>
                  <TableCell align="right">{brl(r.spend)}</TableCell>
                  <TableCell align="right">{pct(r.pctAccount)}</TableCell>
                  <TableCell align="right">{brl(r.cpm)}</TableCell>
                  <TableCell align="right">{pct(r.thumbstop)}</TableCell>
                  <TableCell align="right">{pct(r.ctr / 100)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: TONE_SX[cpsTone] }}>{brl(r.cps)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: TONE_SX[cvrTone] }}>{pct(r.cvr)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: TONE_SX[ticketTone] }}>{brl(r.ticket)}</TableCell>
                  <TableCell align="right">{brl(r.cpa)}</TableCell>
                  <TableCell align="right">{r.purchases}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: TONE_SX[roasTone] }}>{r.roas.toFixed(2)}x</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" title={r.status === "ACTIVE" ? "Pausar" : "Ativar"} onClick={() => handleToggleStatus(r)}>
                      {r.status === "ACTIVE" ? <Pause size={16} /> : <Play size={16} />}
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={ruleOpen} onClose={() => setRuleOpen(false)} maxWidth="xs" fullWidth>
        <DialogContent>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Nova regra
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Anúncios que baterem essa condição ficam destacados na tabela.
          </Typography>
          <Grid container spacing={1.5}>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Métrica
              </Typography>
              <Select size="small" fullWidth value={ruleMetric} onChange={(e) => setRuleMetric(e.target.value as typeof ruleMetric)}>
                <MenuItem value="roas">ROAS</MenuItem>
                <MenuItem value="cpa">CPA</MenuItem>
              </Select>
            </Grid>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Condição
              </Typography>
              <Select size="small" fullWidth value={ruleOperator} onChange={(e) => setRuleOperator(e.target.value as typeof ruleOperator)}>
                <MenuItem value="lt">Abaixo de</MenuItem>
                <MenuItem value="gt">Acima de</MenuItem>
              </Select>
            </Grid>
          </Grid>
          <TextField
            fullWidth
            size="small"
            sx={{ mt: 1.5 }}
            label={`Valor ${ruleMetric === "roas" ? "(x)" : "(R$)"}`}
            value={ruleValue}
            onChange={(e) => setRuleValue(e.target.value)}
            placeholder={ruleMetric === "roas" ? "ex: 2" : "ex: 50"}
          />
          <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={handleCreateRule} disabled={creating}>
            {creating ? "Criando..." : "Criar regra"}
          </Button>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
