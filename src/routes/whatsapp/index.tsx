import { useMemo, useState } from "react";
import { createFileRoute, createLink, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Search, Check, X, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { listWaCampaigns, type WaCampaignListRow } from "@/lib/wa-campaigns.functions";
import { approveCampaign, rejectCampaign } from "@/lib/whatsapp-meta.functions";

const LinkTypography = createLink(Typography);
const LinkIconButton = createLink(IconButton);

export const Route = createFileRoute("/whatsapp/")({
  head: () => ({
    meta: [
      { title: "Campanhas de WhatsApp | CRM Insights" },
      { name: "description", content: "Lista única de campanhas de WhatsApp com envio, entrega, leitura e falhas em tempo real." },
      { property: "og:title", content: "Campanhas de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Acompanhe e aprove suas campanhas de WhatsApp em uma única tela." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignsPage,
});

const STATUS_LABEL: Record<string, string> = {
  aguardando_aprovacao: "Aguardando aprovação",
  rejeitada: "Rejeitada",
  enviando: "Enviando",
  agendada: "Agendada",
  finalizada: "Finalizada",
  erro: "Erro",
  cancelada: "Cancelada",
};

const STATUS_COLOR: Record<string, "warning" | "error" | "info" | "success" | "default"> = {
  aguardando_aprovacao: "warning",
  rejeitada: "error",
  enviando: "warning",
  agendada: "info",
  finalizada: "success",
  erro: "error",
  cancelada: "default",
};

const FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação" },
  { value: "enviando", label: "Enviando" },
  { value: "agendada", label: "Agendadas" },
  { value: "finalizada", label: "Finalizadas" },
  { value: "erro", label: "Com erro" },
];

const DATE_PERIODS = [
  { key: "tudo", label: "Tudo" },
  { key: "dia", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "mes", label: "Este mês" },
  { key: "ano", label: "Este ano" },
  { key: "personalizado", label: "Personalizado" },
] as const;

type DatePeriodKey = (typeof DATE_PERIODS)[number]["key"];

function campaignDate(c: WaCampaignListRow): Date {
  return new Date(c.sentAt ?? c.createdAt);
}

function inPeriod(c: WaCampaignListRow, period: DatePeriodKey, range: DateRange | undefined): boolean {
  if (period === "tudo") return true;
  const d = campaignDate(c);
  const now = new Date();
  if (period === "dia") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  if (period === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (period === "mes") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === "ano") return d.getFullYear() === now.getFullYear();
  if (range?.from) {
    const end = range.to ?? range.from;
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);
    return d >= range.from && d <= endOfDay;
  }
  return true;
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function pct(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <Box sx={{ textAlign: "right" }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xl: "none" }, textTransform: "uppercase", fontSize: 11 }}>{label}</Typography>
      <Typography sx={{ fontWeight: 600, lineHeight: 1.2 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{hint}</Typography>}
    </Box>
  );
}

function CampaignsPage() {
  const navigate = useNavigate();
  const runApprove = useServerFn(approveCampaign);
  const runReject = useServerFn(rejectCampaign);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [datePeriod, setDatePeriod] = useState<DatePeriodKey>("tudo");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["wa-campaigns"],
    queryFn: () => listWaCampaigns(),
    refetchInterval: 20_000,
  });

  const list: WaCampaignListRow[] = data ?? [];

  const filtered = useMemo(
    () =>
      list.filter((c) => {
        if (filter !== "todas" && c.status !== filter) return false;
        if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (!inPeriod(c, datePeriod, range)) return false;
        return true;
      }),
    [list, filter, search, datePeriod, range],
  );

  const filteredTotals = useMemo(
    () =>
      filtered.reduce(
        (acc, c) => ({
          sent: acc.sent + c.sent,
          delivered: acc.delivered + c.delivered,
          read: acc.read + c.read,
          failed: acc.failed + c.failed,
          pending: acc.pending + c.pending,
          revenue: acc.revenue + c.revenue,
          orders: acc.orders + c.orders,
        }),
        { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0, revenue: 0, orders: 0 },
      ),
    [filtered],
  );

  const totals = filteredTotals;

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const res: any = await runApprove({ data: { campaignId: id } });
      if (res?.success === false) toast.error(res.error);
      else toast.success("Campanha aprovada e enfileirada.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao aprovar.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Motivo da rejeição (opcional):", "") ?? undefined;
    setBusyId(id);
    try {
      const res: any = await runReject({ data: { campaignId: id, reason } });
      if (res?.success === false) toast.error(res.error);
      else toast.success("Campanha rejeitada.");
      refetch();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, 1fr)", lg: "repeat(6, 1fr)" } }}>
        <Box sx={{ gridColumn: { lg: "span 2" }, border: "1px solid", borderColor: "success.light", bgcolor: "success.50", borderRadius: 3, p: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "success.dark" }}>Valor vendido (30 dias após o envio)</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, color: "success.dark", mt: 0.5 }}>{money(totals.revenue)}</Typography>
          <Typography variant="caption" color="text.secondary">{totals.orders.toLocaleString("pt-BR")} pedidos atribuídos</Typography>
        </Box>
        {[
          { label: "Enviadas", value: totals.sent },
          { label: "Entregues", value: totals.delivered },
          { label: "Lidas", value: totals.read },
          { label: "Falhas", value: totals.failed },
        ].map((card) => (
          <Box key={card.label} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
            <Typography variant="caption" color="text.secondary">{card.label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{card.value.toLocaleString("pt-BR")}</Typography>
          </Box>
        ))}
      </Box>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar campanha…"
          size="small"
          sx={{ minWidth: 220, flex: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> } }}
        />
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 0.5 }}>
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="small"
              variant={filter === f.value ? "contained" : "text"}
              color={filter === f.value ? "primary" : "inherit"}
              sx={{ borderRadius: 2 }}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 0.5 }}>
          {DATE_PERIODS.map((p) => (
            <Button
              key={p.key}
              size="small"
              variant={datePeriod === p.key ? "contained" : "text"}
              color={datePeriod === p.key ? "primary" : "inherit"}
              sx={{ borderRadius: 2 }}
              onClick={() => setDatePeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </Stack>
        {/* Popover/Calendar (shadcn) mantidos de propósito: date-range picker não tem
            equivalente MUI instalado (precisaria de @mui/x-date-pickers, fora do escopo
            desta migração de biblioteca de componentes de UI). */}
        {datePeriod === "personalizado" && (
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
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={2}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        )}
        <Button variant="outlined" startIcon={<RefreshCw size={14} className={isFetching ? "animate-spin" : undefined} />} onClick={() => refetch()} disabled={isFetching}>
          Atualizar
        </Button>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => navigate({ to: "/whatsapp/nova" })}>
          Nova campanha
        </Button>
      </Stack>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">Carregando campanhas…</Typography>
      ) : filtered.length === 0 ? (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 5, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 600 }}>Nenhuma campanha aqui.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Crie a primeira e acompanhe entrega e leitura em tempo real.</Typography>
          <Button variant="contained" startIcon={<Plus size={16} />} sx={{ mt: 2 }} onClick={() => navigate({ to: "/whatsapp/nova" })}>
            Nova campanha
          </Button>
        </Box>
      ) : (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ display: { xs: "none", xl: "flex" }, alignItems: "center", borderBottom: "1px solid", borderColor: "divider", bgcolor: "action.hover", px: 2, py: 1.25 }}
          >
            <Box sx={{ minWidth: 220, flex: 1 }}><Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.secondary" }}>Campanha</Typography></Box>
            <Box sx={{ width: 560, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1.5, textAlign: "right" }}>
              {["Público", "Enviadas", "Entregues", "Lidas", "Falhas"].map((label) => (
                <Typography key={label} variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.secondary" }}>{label}</Typography>
              ))}
            </Box>
            <Box sx={{ width: 130, flexShrink: 0, textAlign: "right" }}><Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.secondary" }}>Valor vendido</Typography></Box>
            <Box sx={{ width: 120, flexShrink: 0 }} />
          </Stack>

          <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
            {filtered.map((c) => (
              <Stack
                key={c.id}
                direction="row"
                spacing={2}
                sx={{ flexWrap: "wrap", alignItems: "center", px: 2, py: 1.75, "&:hover": { bgcolor: "action.hover" } }}
              >
                <Box sx={{ minWidth: 220, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
                    <LinkTypography to="/whatsapp/$campaignId" params={{ campaignId: c.id }} sx={{ fontWeight: 600, textDecoration: "none", color: "text.primary", "&:hover": { textDecoration: "underline" } }}>
                      {c.name}
                    </LinkTypography>
                    <Chip size="small" color={STATUS_COLOR[c.status] ?? "default"} label={STATUS_LABEL[c.status] ?? c.status} />
                    {c.origin === "automacao" && <Chip size="small" variant="outlined" label="Automação" />}
                    {c.queuePaused && <Chip size="small" variant="outlined" label="Pausada" />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    {c.audienceLabel ?? "Público"} · modelo {c.templateName || "—"} ·{" "}
                    {new Date(c.sentAt ?? c.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </Typography>
                </Box>

                <Box sx={{ width: { xs: "100%", xl: 560 }, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1.5, textAlign: "right" }}>
                  <Metric label="Público" value={c.total.toLocaleString("pt-BR")} />
                  <Metric label="Enviadas" value={c.sent.toLocaleString("pt-BR")} hint={pct(c.sent, c.total)} />
                  <Metric label="Entregues" value={c.delivered.toLocaleString("pt-BR")} hint={pct(c.delivered, c.sent)} />
                  <Metric label="Lidas" value={c.read.toLocaleString("pt-BR")} hint={pct(c.read, c.delivered)} />
                  <Metric label="Falhas" value={c.failed.toLocaleString("pt-BR")} hint={c.pending ? `${c.pending} na fila` : undefined} />
                </Box>

                <Box sx={{ width: 130, flexShrink: 0, textAlign: "right" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xl: "none" }, textTransform: "uppercase", fontSize: 11 }}>Valor vendido</Typography>
                  <Typography sx={{ fontWeight: 600, lineHeight: 1.2, color: c.revenue > 0 ? "success.main" : "text.secondary" }}>
                    {c.revenue > 0 ? money(c.revenue) : "—"}
                  </Typography>
                  {c.orders > 0 && <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{c.orders} pedidos</Typography>}
                </Box>

                <Stack direction="row" spacing={1} sx={{ minWidth: 120, flexShrink: 0, alignItems: "center", justifyContent: "flex-end" }}>
                  {c.status === "aguardando_aprovacao" && (
                    <>
                      <Button size="small" variant="contained" startIcon={<Check size={14} />} disabled={busyId === c.id} onClick={() => approve(c.id)}>
                        Aprovar
                      </Button>
                      <Button size="small" variant="outlined" startIcon={<X size={14} />} disabled={busyId === c.id} onClick={() => reject(c.id)}>
                        Rejeitar
                      </Button>
                    </>
                  )}
                  <LinkIconButton to="/whatsapp/$campaignId" params={{ campaignId: c.id }} size="small">
                    <ChevronRight size={16} />
                  </LinkIconButton>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
