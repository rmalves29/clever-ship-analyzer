import { Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERIODS, type PeriodKey } from "@/lib/crm-mock";
import { cn } from "@/lib/utils";

type Props = {
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  range: DateRange | undefined;
  onRangeChange: (r: DateRange | undefined) => void;
  onRefresh: () => void;
  loading: boolean;
};

export function PeriodFilter({ period, onPeriodChange, range, onRangeChange, onRefresh, loading }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPeriodChange(p.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              period === p.key ? "gradient-brand text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === "personalizado" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="size-4" />
              {range?.from
                ? range.to
                  ? `${format(range.from, "dd/MM", { locale: ptBR })} – ${format(range.to, "dd/MM", { locale: ptBR })}`
                  : format(range.from, "dd/MM/yyyy", { locale: ptBR })
                : "Escolher datas"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={range} onSelect={onRangeChange} numberOfMonths={2} locale={ptBR} />
          </PopoverContent>
        </Popover>
      )}

      <Button onClick={onRefresh} disabled={loading} className="ml-auto gap-2">
        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        {loading ? "Analisando..." : "Refazer análise"}
      </Button>
    </div>
  );
}
