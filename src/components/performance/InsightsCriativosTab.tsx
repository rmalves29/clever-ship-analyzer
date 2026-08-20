import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageOff, Target, MousePointerClick, ShoppingCart, TrendingUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getMetaAdsCreatives } from "@/lib/meta-ads.functions";
import { brl } from "@/lib/crm-mock";
import type { MetaAdsDatePreset, CreativeInsight, CreativeFreshness } from "@/lib/meta-ads.server";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

const FRESHNESS_LABEL: Record<CreativeFreshness, string> = {
  fresco: "Fresco",
  maduro: "Maduro",
  fadigado: "Fadigado",
};
const FRESHNESS_CLASS: Record<CreativeFreshness, string> = {
  fresco: "bg-success-soft text-success",
  maduro: "bg-warning-soft text-warning",
  fadigado: "bg-critical-soft text-critical",
};

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "bg-success-soft text-success",
  PAUSED: "bg-muted text-muted-foreground",
  ARCHIVED: "bg-muted text-muted-foreground",
  DELETED: "bg-critical-soft text-critical",
  CAMPAIGN_PAUSED: "bg-muted text-muted-foreground",
  ADSET_PAUSED: "bg-muted text-muted-foreground",
};

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
      <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
        <ImageOff className="size-6 text-muted-foreground" />
      </div>
    );
  }
  return <img src={url} alt={name} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
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
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      {creative ? (
        <div className="mt-2 flex items-center gap-3">
          <div className="w-14 shrink-0">
            <Thumb url={creative.thumbnailUrl} name={creative.name} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={creative.name}>{creative.name}</p>
            <p className="text-sm font-bold text-success">{metric}</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Sem dado no período</p>
      )}
    </div>
  );
}

export function InsightsCriativosTab({ datePreset }: { datePreset: MetaAdsDatePreset }) {
  const runCreatives = useServerFn(getMetaAdsCreatives);
  const [onlyActive, setOnlyActive] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["meta-ads-creatives", datePreset],
    queryFn: () => runCreatives({ data: { datePreset } }),
  });

  const data = result?.success ? result.result : null;

  const creatives = useMemo(() => {
    const all = data?.creatives ?? [];
    return onlyActive ? all.filter((c) => c.status === "ACTIVE") : all;
  }, [data, onlyActive]);

  if (isLoading) return <p className="mt-6 text-center text-muted-foreground">Carregando...</p>;
  if (result && !result.success) return <p className="mt-6 text-center text-muted-foreground">{result.error}</p>;
  if (!data) return null;

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <StatCard label="CPM" value={brl(data.summary.cpm)} />
        <StatCard label="Thumb Stop Rate" value={pct(data.summary.thumbstop)} />
        <StatCard label="CTR (Todos)" value={pct(data.summary.ctrAll)} />
        <StatCard label="CTR (Link)" value={pct(data.summary.ctrLink)} />
        <StatCard label="Compras" value={String(data.summary.purchases)} />
        <StatCard label="CPA" value={brl(data.summary.cpa)} />
        <StatCard label="ROAS" value={`${data.summary.roas.toFixed(2)}x`} />
        <StatCard label="Valor Gasto" value={brl(data.summary.spend)} />
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">Top Performers</p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TopPerformerCard icon={Target} label="Melhor Gancho" creative={data.topGancho} metric={data.topGancho ? pct(data.topGancho.thumbstop) : ""} />
        <TopPerformerCard icon={MousePointerClick} label="Melhor CTR" creative={data.topCtr} metric={data.topCtr ? pct(data.topCtr.ctrAll) : ""} />
        <TopPerformerCard icon={ShoppingCart} label="Mais Compras" creative={data.topCompras} metric={data.topCompras ? String(data.topCompras.purchases) : ""} />
        <TopPerformerCard icon={TrendingUp} label="Maior ROAS" creative={data.topRoas} metric={data.topRoas ? `${data.topRoas.roas.toFixed(2)}x` : ""} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Todos os criativos ({creatives.length})</p>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyActive} onCheckedChange={setOnlyActive} /> Só ativas
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {creatives.length === 0 && <p className="col-span-full py-8 text-center text-muted-foreground">Nenhum criativo nesse período.</p>}
        {creatives.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-3">
            <Thumb url={c.thumbnailUrl} name={c.name} />
            <p className="mt-2 truncate text-sm font-medium" title={c.name}>{c.name}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[c.status] ?? "bg-muted text-muted-foreground"}`}>
                {c.status}
              </span>
              {c.freshness && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${FRESHNESS_CLASS[c.freshness]}`}>
                  {FRESHNESS_LABEL[c.freshness]} · Freq {c.frequency.toFixed(1)}x · {ageLabel(c.ageDays)}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>CPM {brl(c.cpm)}</span>
              <span>ThumbStop {pct(c.thumbstop)}</span>
              <span>CTR {pct(c.ctrAll)}</span>
              <span>CPS {brl(c.cps)}</span>
              <span>CVR {pct(c.cvr)}</span>
              <span>CPA {brl(c.cpa)}</span>
              <span>Compras {c.purchases}</span>
              <span className="font-semibold text-foreground">ROAS {c.roas.toFixed(2)}x</span>
            </div>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                c.suggestion === "escalar" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
              }`}
            >
              {c.suggestion === "escalar" ? "Escalar" : "Testar mais"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
