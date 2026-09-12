import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Info, Save, Sparkles, Target, Users } from "lucide-react";
import { toast } from "sonner";
// WhatsappSendDialog ainda é shadcn — componente compartilhado com o módulo de WhatsApp
// (Grupo 3, migrado por último no plano). Deixado como está de propósito: migrar a
// tela mas manter esse diálogo intacto até chegar a vez do módulo de WhatsApp.
import { WhatsappSendDialog, type SendDialogSeed } from "@/components/whatsapp/WhatsappSendDialog";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  createRepurchaseCampaignDraft,
  getRepurchaseCustomers,
  getRepurchaseDashboard,
  saveRepurchaseSettings,
  suggestRepurchaseCampaign,
} from "@/lib/crm-repurchase.functions";
import {
  REPURCHASE_TARGET_WINDOWS,
  REPURCHASE_WINDOWS,
  type RepurchaseTargetWindowDays,
  type RepurchaseWindow,
} from "@/lib/crm-repurchase-shared";

export const Route = createFileRoute("/crm/reguas/primeira-segunda")({
  head: () => ({
    meta: [
      { title: "1ª compra → 2ª compra | CRM" },
      { name: "description", content: "Régua inteligente para aumentar a segunda compra e a recorrência." },
    ],
  }),
  component: RepurchasePage,
});

const PAGE_SIZE = 50;
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;

type StageFilter = RepurchaseWindow | "Convertido";
type PeriodPreset = "all" | "7" | "15" | "30" | "60" | "90" | "custom";

const PERIODS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "all", label: "Todo histórico" },
  { value: "7", label: "7 dias" },
  { value: "15", label: "15 dias" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
];

const SOURCE_LABELS: Record<string, string> = {
  web: "Site",
  pos: "Venda manual/POS",
  shopify_draft_order: "Pedido rascunho",
  "Não informado": "Não informado",
};

function MetricCard({ label, value, hint, explanation }: { label: string; value: string | number; hint: string; explanation: string }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5, height: "100%" }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          {label}
        </Typography>
        <Tooltip title={explanation} arrow>
          <IconButton size="small" sx={{ p: 0.25 }} aria-label={`Como é calculado: ${label}`}>
            <Info size={14} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{hint}</Typography>
    </Box>
  );
}

function RepurchasePage() {
  const queryClient = useQueryClient();
  const fetchDashboard = useServerFn(getRepurchaseDashboard);
  const fetchCustomers = useServerFn(getRepurchaseCustomers);
  const runSuggestion = useServerFn(suggestRepurchaseCampaign);
  const runCampaignDraft = useServerFn(createRepurchaseCampaignDraft);
  const runSaveSettings = useServerFn(saveRepurchaseSettings);

  const [stage, setStage] = useState<StageFilter | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [targetPercent, setTargetPercent] = useState("10");
  const [targetWindow, setTargetWindow] = useState<RepurchaseTargetWindowDays>(30);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSeed, setSendSeed] = useState<SendDialogSeed | null>(null);
  const [preparedSegment, setPreparedSegment] = useState<{ id: string; nome: string } | null>(null);
  const [suggestion, setSuggestion] = useState<{
    approach: string;
    message: string;
    incentive: string;
    cta: string;
    offer: string;
    rationale: string;
  } | null>(null);

  const selectedRange = useMemo(() => {
    if (period === "all") return {};
    if (period === "custom") return { from: customFrom || undefined, to: customTo || undefined };
    const days = Number(period);
    return { from: format(subDays(new Date(), days - 1), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") };
  }, [customFrom, customTo, period]);

  useEffect(() => setPage(0), [stage, search, selectedRange.from, selectedRange.to]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["repurchase-dashboard", selectedRange.from ?? "all", selectedRange.to ?? "all"],
    queryFn: () => fetchDashboard({ data: selectedRange }),
  });

  useEffect(() => {
    if (!data?.settings) return;
    setTargetPercent(String(Number((data.settings.targetConversionRate * 100).toFixed(2))));
    setTargetWindow(data.settings.targetWindowDays);
  }, [data?.settings]);

  const { data: customerResult, isLoading: customersLoading } = useQuery({
    queryKey: ["repurchase-customers", stage ?? "all", search, page, selectedRange.from ?? "all", selectedRange.to ?? "all"],
    queryFn: () => {
      const base = { search, limit: PAGE_SIZE, offset: page * PAGE_SIZE, ...selectedRange };
      return stage ? fetchCustomers({ data: { ...base, stage } }) : fetchCustomers({ data: base });
    },
  });

  const aiMutation = useMutation({
    mutationFn: async (selectedStage: RepurchaseWindow) => runSuggestion({ data: { stage: selectedStage } }),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSuggestion(result.suggestion);
      toast.success("Sugestão de campanha criada para revisão.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const campaignMutation = useMutation({
    mutationFn: async (selectedStage: RepurchaseWindow) => runCampaignDraft({ data: { stage: selectedStage } }),
    onSuccess: (draft) => {
      setPreparedSegment(draft.segment);
      setSendSeed({ nome: draft.name, segmentType: "custom", segmentId: draft.segment.id, oferta: suggestion?.offer ?? "" });
      setSendOpen(true);
      toast.success("Segmento dinâmico preparado. Agora configure e revise a campanha.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const rate = Number(targetPercent.replace(",", ".")) / 100;
      if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new Error("Informe uma meta entre 0,1% e 100%.");
      return runSaveSettings({ data: { targetConversionRate: rate, targetWindowDays: targetWindow } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repurchase-dashboard"] });
      toast.success("Meta de recompra atualizada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <Typography color="text.secondary" sx={{ p: 4 }}>
        Carregando régua de recompra…
      </Typography>
    );
  }
  if (error || !data) {
    return (
      <Typography color="error.main" sx={{ p: 4 }}>
        Não foi possível carregar a régua de recompra.
      </Typography>
    );
  }

  const summary = data.summary;
  const customers = customerResult?.customers ?? [];
  const totalCustomers = customerResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));
  const actionableStage = stage && stage !== "Convertido" ? stage : null;
  const targetProgress = summary.targetConversionRate > 0 ? Math.min(100, (summary.matureConversionRate / summary.targetConversionRate) * 100) : 0;
  const coverageFrom = data.dataCoverage.from ? new Date(data.dataCoverage.from).toLocaleDateString("pt-BR") : "—";
  const coverageTo = data.dataCoverage.to ? new Date(data.dataCoverage.to).toLocaleDateString("pt-BR") : "—";

  const selectStage = (value: StageFilter) => {
    setStage(value);
    setSuggestion(null);
  };

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, lg: 4 } }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="body2" color="text.secondary">CRM → Réguas</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>1ª compra → 2ª compra</Typography>
          <Typography variant="body2" color="text.secondary">Acompanhe clientes desde a primeira compra e meça a segunda compra com uma janela justa.</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Button variant="outline" startIcon={<Sparkles size={16} />} disabled={!actionableStage || aiMutation.isPending} onClick={() => actionableStage && aiMutation.mutate(actionableStage)}>
            {aiMutation.isPending ? "Gerando…" : "Sugerir campanha com IA"}
          </Button>
          <Button variant="contained" startIcon={<Target size={16} />} disabled={!actionableStage || campaignMutation.isPending} onClick={() => actionableStage && campaignMutation.mutate(actionableStage)}>
            {campaignMutation.isPending ? "Preparando…" : "Criar campanha"}
          </Button>
        </Stack>
      </Stack>

      <Stack spacing={2} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>Período da primeira compra</Typography>
            <Typography variant="caption" color="text.secondary">O filtro define quais coortes e clientes entram nos cards abaixo.</Typography>
          </Box>
          <Chip variant="outlined" label={`Dados disponíveis: ${coverageFrom} até ${coverageTo} · ${data.dataCoverage.historyDays} dias`} />
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          {PERIODS.map((item) => (
            <Button key={item.value} size="small" variant={period === item.value ? "contained" : "outline"} onClick={() => setPeriod(item.value)}>
              {item.label}
            </Button>
          ))}
        </Stack>
        {period === "custom" && (
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
            <TextField size="small" type="date" label="De" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Até" value={customTo} onChange={(event) => setCustomTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        )}
        {data.dataCoverage.historyDays < targetWindow && (
          <Typography variant="body2" sx={{ border: "1px solid", borderColor: "warning.main", bgcolor: "warning.50", borderRadius: 2, px: 1.5, py: 1, color: "warning.main" }}>
            O histórico ainda tem {data.dataCoverage.historyDays} dias. A métrica de {targetWindow} dias ficará completa quando houver clientes com essa janela inteira de observação.
          </Typography>
        )}
      </Stack>

      {!actionableStage && (
        <Typography variant="body2" color="text.secondary" sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, px: 2, py: 1.5 }}>
          Selecione uma etapa pendente na jornada. "Criar campanha" abrirá o assistente oficial para escolher template, revisar o público e decidir entre aprovação, envio ou agendamento.
        </Typography>
      )}

      <Grid container spacing={2}>
        {[
          { label: "Aguardando 2ª compra", value: summary.pending, hint: "Exatamente 1 pedido válido", explanation: "Clientes do período selecionado que possuem exatamente uma compra paga e não cancelada." },
          { label: "Converteram", value: summary.converted, hint: "Já fizeram a 2ª compra", explanation: "Clientes do período que possuem pelo menos duas compras válidas. A terceira compra e seguintes não aumentam esta contagem." },
          { label: "Taxa geral", value: pct(summary.conversionRate), hint: `${summary.converted} de ${summary.buyers} clientes`, explanation: "Clientes que já fizeram a segunda compra divididos por toda a base, inclusive clientes recém-chegados que ainda não tiveram tempo para recomprar." },
          { label: `Taxa madura em ${summary.targetWindowDays}d`, value: summary.matureEligible ? pct(summary.matureConversionRate) : "Aguardando", hint: `${summary.matureConverted} de ${summary.matureEligible} elegíveis`, explanation: `Considera somente clientes que já tiveram ${summary.targetWindowDays} dias completos desde a primeira compra. Conta como conversão apenas a segunda compra feita dentro dessa janela.` },
          { label: "Base da jornada", value: summary.buyers, hint: "Clientes com compra válida", explanation: "Total de clientes com pelo menos um pedido PAID ou PARTIALLY_PAID, sem cancelamento, dentro do período de primeira compra selecionado." },
          { label: "Receita da 1ª compra", value: brl(summary.firstRevenue), hint: `Ticket médio ${brl(summary.firstAverageTicket)}`, explanation: "Soma somente o valor da primeira compra válida de cada cliente da base." },
          { label: "Receita da 2ª compra", value: brl(summary.secondRevenue), hint: `Ticket médio ${brl(summary.secondAverageTicket)}`, explanation: "Soma somente a segunda compra válida. Terceira compra e posteriores não entram neste card." },
          { label: "Tempo até 2ª compra", value: `${summary.averageDaysToSecondOrder.toFixed(1)} dias`, hint: "Média de quem converteu", explanation: "Quantidade média de dias entre a primeira e a segunda compra válida dos clientes que já converteram." },
          { label: "Espera dos pendentes", value: `${summary.averageDaysSinceFirstOrderPending.toFixed(1)} dias`, hint: "Média sem segunda compra", explanation: "Dias médios desde a primeira compra dos clientes que ainda não realizaram a segunda." },
          { label: "Faltam para a meta", value: summary.matureEligible ? summary.customersMissingToTarget : "—", hint: `Meta ${pct(summary.targetConversionRate)} em ${summary.targetWindowDays} dias`, explanation: "Quantidade adicional de clientes elegíveis que precisariam recomprar dentro da janela para atingir a meta atual." },
        ].map((card) => (
          <Grid key={card.label} size={{ xs: 12, sm: 6, xl: 12 / 5 }}>
            <MetricCard {...card} />
          </Grid>
        ))}
      </Grid>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Grid container spacing={2} sx={{ alignItems: "flex-end" }}>
          <Grid size={{ xs: 12, lg: "grow" }}>
            <Typography sx={{ fontWeight: 600 }}>Meta operacional de segunda compra</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              Taxa madura atual {summary.matureEligible ? pct(summary.matureConversionRate) : "sem coorte madura"} · meta {pct(summary.targetConversionRate)} em até {summary.targetWindowDays} dias.
            </Typography>
            <LinearProgress variant="determinate" value={targetProgress} sx={{ height: 6, borderRadius: 999, mt: 1.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {summary.matureEligible ? `${targetProgress.toFixed(0)}% da meta` : "Aguardando clientes completarem a janela"}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, lg: "auto" }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "flex-end" }}>
              <TextField size="small" label="Meta (%)" sx={{ width: 112 }} inputMode="decimal" value={targetPercent} onChange={(event) => setTargetPercent(event.target.value)} />
              <Select size="small" sx={{ width: 128 }} value={String(targetWindow)} onChange={(e) => setTargetWindow(Number(e.target.value) as RepurchaseTargetWindowDays)}>
                {REPURCHASE_TARGET_WINDOWS.map((days) => <MenuItem key={days} value={String(days)}>{days} dias</MenuItem>)}
              </Select>
              <Button variant="contained" startIcon={<Save size={16} />} onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>
                Salvar meta
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
          <Users size={16} />
          <Typography sx={{ fontWeight: 600 }}>Jornada dos clientes ainda pendentes</Typography>
        </Stack>
        <Grid container spacing={1.5}>
          {REPURCHASE_WINDOWS.map((name) => (
            <Grid key={name} size={{ xs: 6, lg: 12 / 7 }}>
              <Box
                component="button"
                onClick={() => selectStage(name)}
                sx={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  outline: stage === name ? "2px solid" : "none",
                  outlineColor: "primary.main",
                  p: 2,
                  bgcolor: "transparent",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Typography variant="caption" color="text.secondary">{name}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>{summary.windows[name]}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Sem 2ª compra</Typography>
              </Box>
            </Grid>
          ))}
          <Grid size={{ xs: 6, lg: 12 / 7 }}>
            <Box
              component="button"
              onClick={() => selectStage("Convertido")}
              sx={{
                display: "block",
                width: "100%",
                textAlign: "left",
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                outline: stage === "Convertido" ? "2px solid" : "none",
                outlineColor: "primary.main",
                p: 2,
                bgcolor: "transparent",
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography variant="caption" color="text.secondary">2ª compra</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>{summary.converted}</Typography>
              <Typography variant="caption" color="text.secondary">Convertido</Typography>
            </Box>
          </Grid>
        </Grid>
      </Box>

      {suggestion && (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
            <Sparkles size={16} />
            <Typography sx={{ fontWeight: 600 }}>Sugestão da IA — revisão humana</Typography>
          </Stack>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Stack spacing={1.5}>
                <Typography variant="body2"><strong>Abordagem:</strong> {suggestion.approach}</Typography>
                <Box sx={{ border: "1px solid", borderColor: "divider", bgcolor: "action.hover", borderRadius: 2, p: 1.5 }}>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{suggestion.message}</Typography>
                </Box>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Stack spacing={1}>
                <Typography variant="body2"><strong>Incentivo sugerido:</strong> {suggestion.incentive}</Typography>
                <Typography variant="body2"><strong>Oferta sugerida:</strong> {suggestion.offer}</Typography>
                <Typography variant="body2"><strong>CTA:</strong> {suggestion.cta}</Typography>
                <Typography variant="body2" color="text.secondary"><strong>Por quê:</strong> {suggestion.rationale}</Typography>
              </Stack>
            </Grid>
          </Grid>
        </Box>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
            <Typography sx={{ fontWeight: 600 }}>Produtos da 1ª compra com mais conversões</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>Correlação por produto da primeira compra; não representa causalidade.</Typography>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Produto</TableCell>
                    <TableCell>Clientes</TableCell>
                    <TableCell>2ª compra</TableCell>
                    <TableCell>Taxa</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.products.length ? data.products.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell sx={{ maxWidth: 288 }}>
                        <Typography variant="body2" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{row.name}</Typography>
                      </TableCell>
                      <TableCell>{row.customers}</TableCell>
                      <TableCell>{row.converted}</TableCell>
                      <TableCell>{pct(row.conversionRate)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} align="center" sx={{ color: "text.secondary" }}>Sem dados no período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
            <Typography sx={{ fontWeight: 600 }}>Recompra por origem da 1ª compra</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>Compara a origem registrada pela Shopify.</Typography>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Origem</TableCell>
                    <TableCell>Clientes</TableCell>
                    <TableCell>2ª compra</TableCell>
                    <TableCell>Taxa</TableCell>
                    <TableCell>Receita 2ª</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.sources.length ? data.sources.map((row) => (
                    <TableRow key={row.source}>
                      <TableCell>{SOURCE_LABELS[row.source] ?? row.source}</TableCell>
                      <TableCell>{row.customers}</TableCell>
                      <TableCell>{row.converted}</TableCell>
                      <TableCell>{pct(row.conversionRate)}</TableCell>
                      <TableCell>{brl(row.secondRevenue)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ color: "text.secondary" }}>Sem dados no período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Grid>
      </Grid>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>Clientes {stage ? `— ${stage}` : "— toda a jornada"}</Typography>
            <Typography variant="caption" color="text.secondary">{totalCustomers} cliente(s) no período e filtro atuais.</Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <TextField size="small" sx={{ width: 288 }} placeholder="Buscar cliente ou produto…" value={search} onChange={(event) => setSearch(event.target.value)} />
            {stage && <Button variant="outline" onClick={() => setStage(undefined)}>Limpar etapa</Button>}
          </Stack>
        </Stack>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cliente</TableCell>
                <TableCell>1ª compra</TableCell>
                <TableCell>Dias</TableCell>
                <TableCell>Valor</TableCell>
                <TableCell>Produtos</TableCell>
                <TableCell>Local</TableCell>
                <TableCell>Canal</TableCell>
                <TableCell>Estágio</TableCell>
                <TableCell>2ª compra</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customersLoading ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>Carregando clientes…</TableCell></TableRow>
              ) : customers.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>Nenhum cliente encontrado.</TableCell></TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow key={customer.customerId}>
                    <TableCell sx={{ fontWeight: 500 }}>{customer.name}</TableCell>
                    <TableCell>{new Date(customer.firstOrderAt).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{customer.daysSinceFirstOrder}</TableCell>
                    <TableCell>{brl(customer.firstOrderRevenue)}</TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="caption" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {customer.products.join(", ") || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>{[customer.city, customer.province].filter(Boolean).join("/") || "—"}</TableCell>
                    <TableCell>{SOURCE_LABELS[customer.sourceName ?? ""] ?? customer.sourceName ?? "—"}</TableCell>
                    <TableCell>{customer.stage}</TableCell>
                    <TableCell>
                      {customer.secondOrderAt ? (
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", whiteSpace: "nowrap" }}>
                          {new Date(customer.secondOrderAt).toLocaleDateString("pt-BR")}
                          <ArrowRight size={12} />
                          {brl(customer.secondOrderRevenue ?? 0)}
                        </Stack>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mt: 2 }}>
          <Typography variant="caption" color="text.secondary">Página {page + 1} de {totalPages}</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outline" size="small" startIcon={<ChevronLeft size={16} />} disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
              Anterior
            </Button>
            <Button variant="outline" size="small" endIcon={<ChevronRight size={16} />} disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>
              Próxima
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Typography sx={{ fontWeight: 600 }}>Coortes de primeira compra</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          "Taxa madura" usa apenas clientes que já completaram a janela de {summary.targetWindowDays} dias, evitando penalizar meses recentes.
        </Typography>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Mês</TableCell>
                <TableCell>Clientes</TableCell>
                <TableCell>Elegíveis maduros</TableCell>
                <TableCell>Converteram na janela</TableCell>
                <TableCell>Taxa madura</TableCell>
                <TableCell>Situação</TableCell>
                <TableCell>Tempo médio</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.cohorts.map((cohort) => (
                <TableRow key={cohort.month}>
                  <TableCell>{cohort.month}</TableCell>
                  <TableCell>{cohort.customers}</TableCell>
                  <TableCell>{cohort.matureCustomers}</TableCell>
                  <TableCell>{cohort.matureConverted}</TableCell>
                  <TableCell>{pct(cohort.matureConversionRate)}</TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={cohort.maturityStatus === "completa" ? "Completa" : cohort.maturityStatus === "parcial" ? "Parcial" : "Aguardando"} />
                  </TableCell>
                  <TableCell>{cohort.averageDaysToSecondOrder.toFixed(1)} dias</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <WhatsappSendDialog seed={sendSeed} open={sendOpen} onOpenChange={setSendOpen} segments={preparedSegment ? [preparedSegment] : []} onDone={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] })} />
    </Stack>
  );
}
