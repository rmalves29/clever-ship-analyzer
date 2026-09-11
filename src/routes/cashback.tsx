import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, Coins, RefreshCw, Ticket, Wallet } from "lucide-react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
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
  backfillCashbackStartsAt,
  getCashbackSettings,
  listCashbackCoupons,
  reprocessCashbackFailures,
  saveCashbackSettings,
} from "@/lib/cashback.functions";
import {
  CASHBACK_STATUS_LABEL,
  calculateCashbackAmount,
  calculateMinimumPurchase,
  deriveCashbackStatus,
  formatBRL,
  minExpirationDays,
  type CashbackCouponStatus,
} from "@/lib/cashback-shared";

export const Route = createFileRoute("/cashback")({
  head: () => ({
    meta: [
      { title: "Cashback | CRM Insights" },
      {
        name: "description",
        content: "Gere cupons de cashback automáticos na Shopify a cada compra paga e acompanhe liberação, validade e uso.",
      },
      { property: "og:title", content: "Cashback | CRM Insights" },
      {
        property: "og:description",
        content: "Cashback automático por compra paga, com cupom real na Shopify restrito ao cliente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CashbackPage,
});

const STATUS_CHIP_COLOR: Record<CashbackCouponStatus, ChipProps["color"]> = {
  pending: "warning",
  active: "success",
  expired: "default",
  cancel_pending: "warning",
  cancelled: "default",
  failed: "error",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function StatCard({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: valueColor }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function CashbackPage() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCashbackSettings);
  const fetchCoupons = useServerFn(listCashbackCoupons);
  const persistSettings = useServerFn(saveCashbackSettings);
  const reprocess = useServerFn(reprocessCashbackFailures);
  const backfillStartsAt = useServerFn(backfillCashbackStartsAt);

  const settingsQuery = useQuery({ queryKey: ["cashback", "settings"], queryFn: () => fetchSettings() });
  const couponsQuery = useQuery({ queryKey: ["cashback", "coupons"], queryFn: () => fetchCoupons() });

  const [enabled, setEnabled] = useState(false);
  const [percentage, setPercentage] = useState("10");
  const [multiplier, setMultiplier] = useState("3");
  const [expirationDays, setExpirationDays] = useState("30");
  const [activationDelayDays, setActivationDelayDays] = useState("3");
  const [previewTotal, setPreviewTotal] = useState("100");

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setEnabled(Boolean(s.enabled));
    setPercentage(String(s.percentage));
    setMultiplier(String(s.minimum_purchase_multiplier));
    setExpirationDays(String(s.expiration_days));
    setActivationDelayDays(String(s.activation_delay_days));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      persistSettings({
        data: {
          enabled,
          percentage: Number(percentage),
          minimum_purchase_multiplier: Number(multiplier),
          expiration_days: Number(expirationDays),
          activation_delay_days: Number(activationDelayDays),
        },
      }),
    onSuccess: () => {
      toast.success("Configuração de cashback salva.");
      queryClient.invalidateQueries({ queryKey: ["cashback", "settings"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Erro ao salvar configuração."),
  });

  const reprocessMutation = useMutation({
    mutationFn: () => reprocess(),
    onSuccess: (result: any) => {
      toast.success(
        `Reprocessamento concluído: ${result?.retried ?? 0} recriado(s), ${result?.cancelled ?? 0} cancelado(s), ${result?.stillFailing ?? 0} ainda com erro.`,
      );
      queryClient.invalidateQueries({ queryKey: ["cashback", "coupons"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Erro ao reprocessar."),
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      // Cada chamada processa um lote (50) — repete até não sobrar nada, pra rodar tudo em 1 clique.
      for (let i = 0; i < 50; i++) {
        const result = await backfillStartsAt();
        updated += result.updated;
        skipped += result.skipped;
        failed += result.failed;
        if (result.remaining <= 0) break;
      }
      return { updated, skipped, failed };
    },
    onSuccess: (result) => {
      toast.success(
        `Liberação ajustada para a data da compra: ${result.updated} cupom(ns) atualizado(s), ${result.skipped} já estavam corretos, ${result.failed} com erro.`,
      );
      queryClient.invalidateQueries({ queryKey: ["cashback", "coupons"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Erro ao ajustar cupons."),
  });

  const preview = useMemo(() => {
    const total = Number(previewTotal.replace(",", ".")) || 0;
    const amount = calculateCashbackAmount(total, Number(percentage) || 0);
    return { total, amount, minimum: calculateMinimumPurchase(amount, Number(multiplier) || 1) };
  }, [previewTotal, percentage, multiplier]);

  const coupons = (couponsQuery.data ?? []) as any[];
  const derived = useMemo(
    () => coupons.map((row) => ({ ...row, derivedStatus: deriveCashbackStatus(row) })),
    [coupons],
  );

  const summary = useMemo(() => {
    const active = derived.filter((c) => c.derivedStatus === "active");
    const pending = derived.filter((c) => c.derivedStatus === "pending");
    const failed = derived.filter((c) => c.derivedStatus === "failed" || c.derivedStatus === "cancel_pending");
    const outstanding = [...active, ...pending].reduce((sum, c) => sum + Number(c.cashback_amount ?? 0), 0);
    return { total: derived.length, active: active.length, pending: pending.length, failed: failed.length, outstanding };
  }, [derived]);

  const minExpiration = minExpirationDays(Number(activationDelayDays) || 0);
  const expirationInvalid = Number(expirationDays) < minExpiration;

  return (
    <Box sx={{ maxWidth: 1600, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          mb: 3,
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Cashback
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Toda compra paga gera automaticamente um cupom real de cashback na Shopify, restrito ao cliente que comprou.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
          <Button
            variant="outline"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
            startIcon={backfillMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Liberar cupons pendentes na data da compra
          </Button>
          <Button
            variant="outline"
            onClick={() => reprocessMutation.mutate()}
            disabled={reprocessMutation.isPending}
            startIcon={
              reprocessMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />
            }
          >
            Atualizar e reprocessar falhas
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" icon={<AlertCircle size={18} />} sx={{ mb: 3 }}>
        <AlertTitle>Permissão necessária na Shopify</AlertTitle>
        O app da Shopify precisa do escopo <code>write_discounts</code> para criar e remover os cupons de cashback.
      </Alert>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Coins size={16} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Configuração
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
                O cupom é um valor fixo em dinheiro, libera {activationDelayDays || "X"} dias após a compra e expira{" "}
                {expirationDays || "X"} dias após a compra. Uso único, uma vez por cliente.
              </Typography>

              <Stack spacing={2.5}>
                <Stack
                  direction="row"
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    p: 1.5,
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Ativar Cashback
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ao ativar, apenas compras feitas a partir de agora geram cupom. Nenhum pedido antigo é processado.
                    </Typography>
                  </Box>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                    label=""
                  />
                </Stack>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                    <TextField
                      label="Percentual do cashback (%)"
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                      inputMode="decimal"
                      fullWidth
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                    <TextField
                      label="Multiplicador da compra mínima"
                      value={multiplier}
                      onChange={(e) => setMultiplier(e.target.value)}
                      inputMode="decimal"
                      fullWidth
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                    <TextField
                      label="Dias até liberar"
                      value={activationDelayDays}
                      onChange={(e) => setActivationDelayDays(e.target.value)}
                      inputMode="numeric"
                      fullWidth
                      helperText="Tempo após a compra até o cupom ficar utilizável."
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                    <TextField
                      label="Dias até expirar"
                      value={expirationDays}
                      onChange={(e) => setExpirationDays(e.target.value)}
                      inputMode="numeric"
                      fullWidth
                      error={expirationInvalid}
                      helperText={expirationInvalid ? `Mínimo de ${minExpiration} dias para não vencer antes da liberação.` : " "}
                    />
                  </Grid>
                </Grid>

                <Box sx={{ border: "1px solid", borderColor: "divider", bgcolor: "action.hover", borderRadius: 2, p: 2 }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                    <TextField
                      label="Prévia para uma compra de"
                      value={previewTotal}
                      onChange={(e) => setPreviewTotal(e.target.value)}
                      inputMode="decimal"
                      sx={{ width: 160 }}
                    />
                    <Box sx={{ fontSize: 14 }}>
                      <Typography variant="body2">
                        Cashback gerado: <strong>{formatBRL(preview.amount)}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Compra mínima para usar: <strong>{formatBRL(preview.minimum)}</strong>
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Liberação em {activationDelayDays || "—"} dias · validade de {expirationDays || "—"} dias após a compra
                      </Typography>
                    </Box>
                  </Stack>
                </Box>

                <Box>
                  <Button
                    variant="contained"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || expirationInvalid}
                    startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
                  >
                    Salvar configuração
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Cashback em aberto
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5 }}>
                  <Wallet size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {formatBRL(summary.outstanding)}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Soma dos cupons aguardando liberação e ativos.
                </Typography>
              </CardContent>
            </Card>
            <Grid container spacing={2}>
              <Grid size={6}>
                <StatCard label="Ativos" value={summary.active} />
              </Grid>
              <Grid size={6}>
                <StatCard label="Aguardando" value={summary.pending} />
              </Grid>
              <Grid size={6}>
                <StatCard label="Com erro" value={summary.failed} valueColor="error.main" />
              </Grid>
              <Grid size={6}>
                <StatCard label="Total" value={summary.total} />
              </Grid>
            </Grid>
          </Stack>
        </Grid>
      </Grid>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Ticket size={16} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Cupons gerados
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            Use os tokens {"{{CUPOM_CASHBACK}}"}, {"{{VALOR_CASHBACK}}"}, {"{{COMPRA_MINIMA_CASHBACK}}"} e{" "}
            {"{{VALIDADE_CASHBACK}}"} nas campanhas e automações de WhatsApp.
          </Typography>

          {couponsQuery.isLoading ? (
            <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
              Carregando cupons…
            </Typography>
          ) : derived.length === 0 ? (
            <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
              Nenhum cupom gerado ainda. Ative o cashback e sincronize a Shopify.
            </Typography>
          ) : (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Pedido</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell align="right">Compra</TableCell>
                    <TableCell align="right">Cashback</TableCell>
                    <TableCell align="right">Mínimo</TableCell>
                    <TableCell>Liberação</TableCell>
                    <TableCell>Validade</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Erro</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {derived.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{row.code}</TableCell>
                      <TableCell>{row.order_number ?? "—"}</TableCell>
                      <TableCell>{row.customer_name ?? "—"}</TableCell>
                      <TableCell align="right">{formatBRL(Number(row.order_total ?? 0))}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500 }}>
                        {formatBRL(Number(row.cashback_amount ?? 0))}
                      </TableCell>
                      <TableCell align="right">{formatBRL(Number(row.minimum_purchase ?? 0))}</TableCell>
                      <TableCell>{formatDate(row.starts_at)}</TableCell>
                      <TableCell>{formatDate(row.ends_at)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={STATUS_CHIP_COLOR[row.derivedStatus as CashbackCouponStatus]}
                          label={CASHBACK_STATUS_LABEL[row.derivedStatus as CashbackCouponStatus]}
                        />
                      </TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 220,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                          color: "error.main",
                        }}
                        title={row.last_error ?? ""}
                      >
                        {row.last_error ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
