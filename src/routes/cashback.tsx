import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, Coins, Loader2, RefreshCw, Ticket, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getCashbackSettings,
  listCashbackCoupons,
  reprocessCashbackFailures,
  saveCashbackSettings,
} from "@/lib/cashback.functions";
import {
  CASHBACK_ACTIVATION_DELAY_DAYS,
  CASHBACK_MIN_EXPIRATION_DAYS,
  CASHBACK_STATUS_LABEL,
  calculateCashbackAmount,
  calculateMinimumPurchase,
  deriveCashbackStatus,
  formatBRL,
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

const STATUS_VARIANT: Record<CashbackCouponStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500",
  active: "bg-emerald-500/15 text-emerald-500",
  expired: "bg-muted text-muted-foreground",
  cancel_pending: "bg-amber-500/15 text-amber-500",
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function CashbackPage() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCashbackSettings);
  const fetchCoupons = useServerFn(listCashbackCoupons);
  const persistSettings = useServerFn(saveCashbackSettings);
  const reprocess = useServerFn(reprocessCashbackFailures);

  const settingsQuery = useQuery({ queryKey: ["cashback", "settings"], queryFn: () => fetchSettings() });
  const couponsQuery = useQuery({ queryKey: ["cashback", "coupons"], queryFn: () => fetchCoupons() });

  const [enabled, setEnabled] = useState(false);
  const [percentage, setPercentage] = useState("10");
  const [multiplier, setMultiplier] = useState("3");
  const [expirationDays, setExpirationDays] = useState("30");
  const [previewTotal, setPreviewTotal] = useState("100");

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setEnabled(Boolean(s.enabled));
    setPercentage(String(s.percentage));
    setMultiplier(String(s.minimum_purchase_multiplier));
    setExpirationDays(String(s.expiration_days));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      persistSettings({
        data: {
          enabled,
          percentage: Number(percentage),
          minimum_purchase_multiplier: Number(multiplier),
          expiration_days: Number(expirationDays),
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

  const expirationInvalid = Number(expirationDays) < CASHBACK_MIN_EXPIRATION_DAYS;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cashback</h1>
          <p className="text-sm text-muted-foreground">
            Toda compra paga gera automaticamente um cupom real de cashback na Shopify, restrito ao cliente que comprou.
          </p>
        </div>
        <Button variant="outline" onClick={() => reprocessMutation.mutate()} disabled={reprocessMutation.isPending}>
          {reprocessMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Atualizar e reprocessar falhas
        </Button>
      </div>

      <Alert className="mb-6">
        <AlertCircle className="size-4" />
        <AlertTitle>Permissão necessária na Shopify</AlertTitle>
        <AlertDescription>
          O app da Shopify precisa do escopo <code>write_discounts</code> para criar e remover os cupons de cashback.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4" /> Configuração
            </CardTitle>
            <CardDescription>
              O cupom é um valor fixo em dinheiro, libera {CASHBACK_ACTIVATION_DELAY_DAYS} dias após a compra e expira{" "}
              {expirationDays || "X"} dias após a compra. Uso único, uma vez por cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Ativar Cashback</p>
                <p className="text-xs text-muted-foreground">
                  Ao ativar, apenas compras feitas a partir de agora geram cupom. Nenhum pedido antigo é processado.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="percentage">Percentual do cashback (%)</Label>
                <Input id="percentage" value={percentage} onChange={(e) => setPercentage(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="multiplier">Multiplicador da compra mínima</Label>
                <Input id="multiplier" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expiration">Dias até expirar</Label>
                <Input id="expiration" value={expirationDays} onChange={(e) => setExpirationDays(e.target.value)} inputMode="numeric" />
                {expirationInvalid ? (
                  <p className="text-xs text-destructive">
                    Mínimo de {CASHBACK_MIN_EXPIRATION_DAYS} dias para não vencer antes da liberação.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="preview">Prévia para uma compra de</Label>
                  <Input id="preview" className="w-40" value={previewTotal} onChange={(e) => setPreviewTotal(e.target.value)} inputMode="decimal" />
                </div>
                <div className="text-sm">
                  <p>
                    Cashback gerado: <strong>{formatBRL(preview.amount)}</strong>
                  </p>
                  <p>
                    Compra mínima para usar: <strong>{formatBRL(preview.minimum)}</strong>
                  </p>
                  <p className="text-muted-foreground">
                    Liberação em {CASHBACK_ACTIVATION_DELAY_DAYS} dias · validade de {expirationDays || "—"} dias após a compra
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || expirationInvalid}>
              {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Salvar configuração
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Cashback em aberto</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Wallet className="size-5 text-brand" /> {formatBRL(summary.outstanding)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Soma dos cupons aguardando liberação e ativos.</CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ativos</CardDescription>
                <CardTitle className="text-2xl">{summary.active}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Aguardando</CardDescription>
                <CardTitle className="text-2xl">{summary.pending}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Com erro</CardDescription>
                <CardTitle className="text-2xl text-destructive">{summary.failed}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total</CardDescription>
                <CardTitle className="text-2xl">{summary.total}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" /> Cupons gerados
          </CardTitle>
          <CardDescription>Use o token {"{{CUPOM_CASHBACK}}"} nas campanhas e automações de WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent>
          {couponsQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando cupons…</p>
          ) : derived.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum cupom gerado ainda. Ative o cashback e sincronize a Shopify.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Compra</TableHead>
                    <TableHead className="text-right">Cashback</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead>Liberação</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {derived.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell>{row.order_number ?? "—"}</TableCell>
                      <TableCell>{row.customer_name ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatBRL(Number(row.order_total ?? 0))}</TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(Number(row.cashback_amount ?? 0))}</TableCell>
                      <TableCell className="text-right">{formatBRL(Number(row.minimum_purchase ?? 0))}</TableCell>
                      <TableCell>{formatDate(row.starts_at)}</TableCell>
                      <TableCell>{formatDate(row.ends_at)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_VARIANT[row.derivedStatus as CashbackCouponStatus]} variant="secondary">
                          {CASHBACK_STATUS_LABEL[row.derivedStatus as CashbackCouponStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-destructive" title={row.last_error ?? ""}>
                        {row.last_error ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
