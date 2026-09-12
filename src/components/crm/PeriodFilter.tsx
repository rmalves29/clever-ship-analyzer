import { Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { PERIODS, type PeriodKey } from "@/lib/crm-mock";

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
    <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 0.5 }}>
        {PERIODS.map((p) => (
          <Button
            key={p.key}
            size="small"
            variant={period === p.key ? "contained" : "text"}
            color={period === p.key ? "primary" : "inherit"}
            sx={{ borderRadius: 2 }}
            onClick={() => onPeriodChange(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </Stack>

      {/* Popover/Calendar (shadcn) mantidos de propósito: date-range picker não tem
          equivalente MUI instalado (precisaria de @mui/x-date-pickers, fora do escopo
          desta migração de biblioteca de componentes de UI). */}
      {period === "personalizado" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outlined" startIcon={<CalendarIcon size={16} />}>
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

      <Button
        variant="contained"
        startIcon={<RefreshCw size={16} className={loading ? "animate-spin" : undefined} />}
        onClick={onRefresh}
        disabled={loading}
        sx={{ ml: "auto" }}
      >
        {loading ? "Analisando..." : "Refazer análise"}
      </Button>
    </Stack>
  );
}
