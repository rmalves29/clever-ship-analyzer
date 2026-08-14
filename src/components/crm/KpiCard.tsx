import { Users, ShoppingBag, TrendingUp, Repeat, Truck, Package, Clock, Receipt, CircleDollarSign } from "lucide-react";
import type { Kpi, Status } from "@/lib/crm-mock";
import { cn } from "@/lib/utils";

const ICONS = {
  users: Users,
  bag: ShoppingBag,
  trend: TrendingUp,
  repeat: Repeat,
  truck: Truck,
  box: Package,
  clock: Clock,
  receipt: Receipt,
  dollar: CircleDollarSign,
} as const;

export const statusRing: Record<Status, string> = {
  critico: "before:bg-critical",
  regular: "before:bg-warning",
  meta: "before:bg-success",
};

export const statusText: Record<Status, string> = {
  critico: "text-critical",
  regular: "text-warning",
  meta: "text-success",
};

export const statusChip: Record<Status, string> = {
  critico: "bg-critical-soft text-critical",
  regular: "bg-warning-soft text-warning",
  meta: "bg-success-soft text-success",
};

export const statusLabel: Record<Status, string> = {
  critico: "crítico",
  regular: "regular",
  meta: "na meta",
};

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = ICONS[kpi.icon];
  return (
    <div
      className={cn(
        "surface-card relative overflow-hidden p-5 transition-transform hover:-translate-y-0.5",
        "before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-['']",
        kpi.status ? statusRing[kpi.status] : "before:bg-brand",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="size-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{kpi.label}</span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{kpi.value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{kpi.hint ?? ""}</p>
        {kpi.status && (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", statusChip[kpi.status])}>
            {statusLabel[kpi.status]}
          </span>
        )}
      </div>
    </div>
  );
}
