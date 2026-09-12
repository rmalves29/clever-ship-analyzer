import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageOff, Target, MousePointerClick, ShoppingCart, TrendingUp, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";
import { getMetaAdsCreatives, getMetaAdsPreview } from "@/lib/meta-ads.functions";
import { brl } from "@/lib/crm-mock";
import type { MetaAdsDatePreset, CreativeInsight, CreativeFreshness } from "@/lib/meta-ads.server";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

const FRESHNESS_LABEL: Record<CreativeFreshness, string> = {
  fresco: "Fresco",
  maduro: "Maduro",
  fadigado: "Fadigado",
};
const FRESHNESS_COLOR: Record<CreativeFreshness, ChipProps["color"]> = {
  fresco: "success",
  maduro: "warning",
  fadigado: "error",
};

const STATUS_COLOR: Record<string, ChipProps["color"]> = {
  ACTIVE: "success",
  PAUSED: "default",
  ARCHIVED: "default",
  DELETED: "error",
  CAMPAIGN_PAUSED: "default",
  ADSET_PAUSED: "default",
};

type Tone = "good" | "mid" | "bad";
const TONE_SX: Record<Tone, string> = {
  good: "success.main",
  mid: "warning.main",
  bad: "error.main",
};

/** Farol comparando o criativo com a média dos criativos exibidos no período (não um benchmark
 *  fixo de internet) — mesmo espírito do semáforo já usado no Ad Pulse. >=15% melhor que a média
 *  = verde, >=15% pior = vermelho, no meio = amarelo (atenção). */
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

function ageLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "hoje";
  if (days < 30) return `${days} dia${days === 1 ? "" : "s"}`;
  if (days < 365) return `~${Math.round(days / 30)} ${Math.round(days / 30) === 1 ? "mês" : "meses"}`;
  return `~${Math.round(days / 365)} ano${Math.round(days / 365) === 1 ? "" : "s"}`;
}

function Thumb({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <Box sx={{ display: "flex", aspectRatio: "1 / 1", alignItems: "center", justifyContent: "center", borderRadius: 2, bgcolor: "action.hover" }}>
        <ImageOff size={24} color="var(--mui-palette-text-secondary)" />
      </Box>
    );
  }
  return <Box component="img" src={url} alt={name} sx={{ aspectRatio: "1 / 1", width: "100%", borderRadius: 2, objectFit: "cover", display: "block" }} />;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary", fontSize: 11 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, mt: 0.5 }}>{value}</Typography>
    </Box>
  );
}

function TopPerformerCard({
  icon: Icon,
  label,
  creative,
  metric,
}: {
  icon: typeof Target;
  label: string;
  creative: CreativeInsight | null;
  metric: string;
}) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.secondary" }}>
        <Icon size={14} />
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </Typography>
      </Stack>
      {creative ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mt: 1 }}>
          <Box sx={{ width: 56, flexShrink: 0 }}>
            <Thumb url={creative.thumbnailUrl} name={creative.name} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={creative.name}>
              {creative.name}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "success.main" }}>
              {metric}
            </Typography>
          </Box>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Sem dado no período
        </Typography>
      )}
    </Box>
  );
}

export function InsightsCriativosTab({ datePreset }: { datePreset: MetaAdsDatePreset }) {
  const runCreatives = useServerFn(getMetaAdsCreatives);
  const runPreview = useServerFn(getMetaAdsPreview);
  const [onlyActive, setOnlyActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  const handleViewAd = async (adId: string) => {
    setLoadingPreviewId(adId);
    try {
      const res = await runPreview({ data: { adId } });
      if (!res.success) {
        toast.error(res.error || "Falha ao gerar a prévia do anúncio.");
        return;
      }
      setPreviewUrl(res.previewUrl);
      setPreviewOpen(true);
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const { data: result, isLoading } = useQuery({
    queryKey: ["meta-ads-creatives", datePreset],
    queryFn: () => runCreatives({ data: { datePreset } }),
  });

  const data = result?.success ? result.result : null;

  const creatives = useMemo(() => {
    const all = data?.creatives ?? [];
    return onlyActive ? all.filter((c) => c.status === "ACTIVE") : all;
  }, [data, onlyActive]);

  const averages = useMemo(() => {
    const withPurchases = creatives.filter((c) => c.purchases > 0);
    return {
      cpm: average(creatives.map((c) => c.cpm)),
      thumbstop: average(creatives.map((c) => c.thumbstop)),
      ctrAll: average(creatives.map((c) => c.ctrAll)),
      ctrLink: average(creatives.map((c) => c.ctrLink)),
      cps: average(creatives.map((c) => c.cps)),
      cvr: average(withPurchases.map((c) => c.cvr)),
      cpa: average(withPurchases.map((c) => c.cpa)),
      roas: average(creatives.map((c) => c.roas)),
    };
  }, [creatives]);

  if (isLoading) {
    return (
      <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
        Carregando...
      </Typography>
    );
  }
  if (result && !result.success) {
    return (
      <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
        {result.error}
      </Typography>
    );
  }
  if (!data) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, md: 3, lg: 12 / 8 }}>
          <StatCard label="CPM" value={brl(data.summary.cpm)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3, lg: 12 / 8 }}>
          <StatCard label="Thumb Stop Rate" value={pct(data.summary.thumbstop)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3, lg: 12 / 8 }}>
          <StatCard label="CTR (Todos)" value={pct(data.summary.ctrAll)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3, lg: 12 / 8 }}>
          <StatCard label="CTR (Link)" value={pct(data.summary.ctrLink)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3, lg: 12 / 8 }}>
          <StatCard label="Compras" value={String(data.summary.purchases)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3, lg: 12 / 8 }}>
          <StatCard label="CPA" value={brl(data.summary.cpa)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3, lg: 12 / 8 }}>
          <StatCard label="ROAS" value={`${data.summary.roas.toFixed(2)}x`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3, lg: 12 / 8 }}>
          <StatCard label="Valor Gasto" value={brl(data.summary.spend)} />
        </Grid>
      </Grid>

      <Typography variant="caption" sx={{ display: "block", mt: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
        Top Performers
      </Typography>
      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <TopPerformerCard icon={Target} label="Melhor Gancho" creative={data.topGancho} metric={data.topGancho ? pct(data.topGancho.thumbstop) : ""} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <TopPerformerCard icon={MousePointerClick} label="Melhor CTR" creative={data.topCtr} metric={data.topCtr ? pct(data.topCtr.ctrAll) : ""} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <TopPerformerCard icon={ShoppingCart} label="Mais Compras" creative={data.topCompras} metric={data.topCompras ? String(data.topCompras.purchases) : ""} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <TopPerformerCard icon={TrendingUp} label="Maior ROAS" creative={data.topRoas} metric={data.topRoas ? `${data.topRoas.roas.toFixed(2)}x` : ""} />
        </Grid>
      </Grid>

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mt: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Todos os criativos ({creatives.length})
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="body2">Só ativas</Typography>
          <Switch checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
        </Stack>
      </Stack>

      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
        {creatives.length === 0 && (
          <Grid size={12}>
            <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
              Nenhum criativo nesse período.
            </Typography>
          </Grid>
        )}
        {creatives.map((c) => {
          const cpmTone = metricTone(c.cpm, averages.cpm, true);
          const thumbstopTone = metricTone(c.thumbstop, averages.thumbstop, false);
          const ctrAllTone = metricTone(c.ctrAll, averages.ctrAll, false);
          const ctrLinkTone = metricTone(c.ctrLink, averages.ctrLink, false);
          const cpsTone = metricTone(c.cps, averages.cps, true);
          const cvrTone = c.purchases > 0 ? metricTone(c.cvr, averages.cvr, false) : "mid";
          const cpaTone = c.purchases > 0 ? metricTone(c.cpa, averages.cpa, true) : "mid";
          const roasTone = metricTone(c.roas, averages.roas, false);
          return (
            <Grid key={c.id} size={{ xs: 6, sm: 4, lg: 3, xl: 12 / 5 }}>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5, height: "100%" }}>
                <Thumb url={c.thumbnailUrl} name={c.name} />
                <Typography variant="body2" sx={{ fontWeight: 500, mt: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>
                  {c.name}
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", mt: 0.5 }}>
                  <Chip size="small" color={STATUS_COLOR[c.status] ?? "default"} label={c.status} sx={{ fontSize: 10, height: 20 }} />
                  {c.freshness && (
                    <Chip
                      size="small"
                      color={FRESHNESS_COLOR[c.freshness]}
                      label={`${FRESHNESS_LABEL[c.freshness]} · Freq ${c.frequency.toFixed(1)}x · ${ageLabel(c.ageDays)}`}
                      sx={{ fontSize: 10, height: 20 }}
                    />
                  )}
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">CPM</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: TONE_SX[cpmTone] }}>{brl(c.cpm)}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">Thumb Stop Rate</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: TONE_SX[thumbstopTone] }}>{pct(c.thumbstop)}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">CTR (Todos)</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: TONE_SX[ctrAllTone] }}>{pct(c.ctrAll)}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">CTR (Link)</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: TONE_SX[ctrLinkTone] }}>{pct(c.ctrLink)}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">CPS</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: TONE_SX[cpsTone] }}>{brl(c.cps)}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">Taxa de Conversão</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: c.purchases > 0 ? TONE_SX[cvrTone] : "text.primary" }}>
                      {c.purchases > 0 ? pct(c.cvr) : "—"}
                    </Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">Compras</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{c.purchases}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">CPA</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: c.purchases > 0 ? TONE_SX[cpaTone] : "text.primary" }}>
                      {c.purchases > 0 ? brl(c.cpa) : brl(0)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">ROAS</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: TONE_SX[roasTone] }}>{c.roas.toFixed(2)}x</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography variant="caption" color="text.secondary">Valor Gasto</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{brl(c.spend)}</Typography>
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", alignItems: "center", mt: 1 }}>
                  <Chip
                    size="small"
                    color={c.suggestion === "escalar" ? "success" : "default"}
                    label={c.suggestion === "escalar" ? "Escalar" : "Testar mais"}
                    sx={{ fontSize: 11, height: 22 }}
                  />
                  <Chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    icon={<PlayCircle size={12} />}
                    label={loadingPreviewId === c.id ? "Carregando..." : "Ver anúncio"}
                    onClick={() => handleViewAd(c.id)}
                    disabled={loadingPreviewId === c.id}
                    sx={{ fontSize: 11, height: 22 }}
                  />
                </Stack>
              </Box>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Prévia do anúncio</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Prévia oficial da Meta — mostra o criativo real, sem precisar de login na conta de anúncios.
          </Typography>
          {previewUrl && (
            <Box
              component="iframe"
              src={previewUrl}
              title="Prévia do anúncio"
              sx={{ height: 600, width: "100%", borderRadius: 2, border: "1px solid", borderColor: "divider" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
