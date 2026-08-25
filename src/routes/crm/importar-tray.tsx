import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  buildTrayImportDataset,
  decodeTrayCsvBytes,
  parseTrayCsvText,
  type TrayImportDataset,
} from "@/lib/crm-tray-import-shared";
import {
  finalizeTrayHistoryImport,
  getTrayImportStatus,
  importTrayHistoryBatch,
} from "@/lib/crm-tray-import.functions";

export const Route = createFileRoute("/crm/importar-tray")({
  head: () => ({
    meta: [
      { title: "Importar histórico Tray | CRM" },
      {
        name: "description",
        content: "Importe pedidos e produtos vendidos da Tray para enriquecer o histórico comercial do CRM.",
      },
    ],
  }),
  component: TrayImportPage,
});

const BATCH_SIZE = 100;

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

function TrayImportPage() {
  const queryClient = useQueryClient();
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [dataset, setDataset] = useState<TrayImportDataset | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);

  const fetchStatus = useServerFn(getTrayImportStatus);
  const runImportBatch = useServerFn(importTrayHistoryBatch);
  const runFinalize = useServerFn(finalizeTrayHistoryImport);

  const { data: currentStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["tray-import-status"],
    queryFn: () => fetchStatus(),
    retry: 1,
  });

  const analyze = async () => {
    if (!ordersFile || !itemsFile) {
      toast.error("Selecione os dois arquivos: Pedidos e Produtos vendidos.");
      return;
    }

    setIsAnalyzing(true);
    setResult(null);
    try {
      const [ordersBuffer, itemsBuffer] = await Promise.all([
        ordersFile.arrayBuffer(),
        itemsFile.arrayBuffer(),
      ]);
      const orderRows = parseTrayCsvText(decodeTrayCsvBytes(ordersBuffer));
      const itemRows = parseTrayCsvText(decodeTrayCsvBytes(itemsBuffer));
      const parsed = buildTrayImportDataset(orderRows, itemRows);
      setDataset(parsed);
      toast.success(
        `Arquivos conferidos: ${formatNumber(parsed.stats.orderCount)} pedidos e ${formatNumber(parsed.stats.itemLineCount)} linhas de produtos.`,
      );
    } catch (error: any) {
      setDataset(null);
      toast.error(error?.message ?? "Não foi possível analisar os arquivos da Tray.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const importHistory = async () => {
    if (!dataset) return;
    const hasBlockingWarnings =
      dataset.stats.unmatchedItemCount > 0 ||
      dataset.stats.ordersWithoutItems > 0 ||
      dataset.stats.subtotalMismatchCount > 0;
    if (hasBlockingWarnings) {
      toast.error("A importação foi bloqueada porque a conferência encontrou divergências nos arquivos.");
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setResult(null);

    try {
      const customersById = new Map(dataset.customers.map((customer) => [customer.id, customer] as const));
      const itemsByOrder = new Map<string, typeof dataset.items>();
      for (const item of dataset.items) {
        const list = itemsByOrder.get(item.orderId) ?? [];
        list.push(item);
        itemsByOrder.set(item.orderId, list);
      }

      const sentCustomers = new Set<string>();
      let newOrders = 0;
      let reimportedOrders = 0;
      let skippedLikelyDuplicates = 0;
      let itemsProcessed = 0;

      const totalBatches = Math.ceil(dataset.orders.length / BATCH_SIZE);
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const batchOrders = dataset.orders.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
        const customerIds = [...new Set(batchOrders.map((order) => order.customerId))];
        const batchCustomers = customerIds
          .filter((customerId) => !sentCustomers.has(customerId))
          .map((customerId) => customersById.get(customerId))
          .filter((customer): customer is NonNullable<typeof customer> => Boolean(customer));
        const batchItems = batchOrders.flatMap((order) => itemsByOrder.get(order.id) ?? []);

        const batchResult = await runImportBatch({
          data: {
            customers: batchCustomers,
            orders: batchOrders,
            items: batchItems,
          },
        });

        batchCustomers.forEach((customer) => sentCustomers.add(customer.id));
        newOrders += batchResult.newOrders;
        reimportedOrders += batchResult.reimportedOrders;
        skippedLikelyDuplicates += batchResult.skippedLikelyDuplicates;
        itemsProcessed += batchResult.itemsProcessed;
        setProgress(Math.round(((batchIndex + 1) / totalBatches) * 90));
      }

      setProgress(94);
      const finalResult = await runFinalize();
      setProgress(100);
      const completed = {
        ...finalResult,
        newOrders,
        reimportedOrders,
        skippedLikelyDuplicates,
        itemsProcessed,
      };
      setResult(completed);
      await refetchStatus();
      queryClient.invalidateQueries();
      toast.success(
        `Histórico Tray importado: ${formatNumber(finalResult.trayOrders)} pedidos disponíveis no CRM.`,
      );
    } catch (error: any) {
      toast.error("Erro durante a importação: " + (error?.message ?? "falha desconhecida"));
    } finally {
      setIsImporting(false);
    }
  };

  const hasBlockingWarnings = Boolean(
    dataset &&
      (dataset.stats.unmatchedItemCount > 0 ||
        dataset.stats.ordersWithoutItems > 0 ||
        dataset.stats.subtotalMismatchCount > 0),
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/crm" search={{ tab: "contatos" }}>
              <Button variant="outline" size="icon">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <span className="gradient-brand flex size-11 items-center justify-center rounded-2xl text-primary-foreground">
              <Database className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Importar histórico da Tray</h1>
              <p className="text-sm text-muted-foreground">
                Pedidos + produtos vendidos são unidos pelo código do pedido antes de entrar no CRM.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="px-3 py-1.5">
            Origem preservada: TRAY
          </Badge>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="surface-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Já no CRM</p>
            <p className="mt-2 text-3xl font-bold">{formatNumber(currentStatus?.trayOrders ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">pedidos históricos da Tray</p>
          </div>
          <div className="surface-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Itens históricos</p>
            <p className="mt-2 text-3xl font-bold">{formatNumber(currentStatus?.trayItems ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">linhas de produtos importadas</p>
          </div>
          <div className="surface-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Vendas válidas</p>
            <p className="mt-2 text-3xl font-bold">{formatNumber(currentStatus?.trayPaidOrders ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">pedidos Tray considerados no RFM</p>
          </div>
        </div>

        <div className="surface-card p-6">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <p className="font-semibold">A importação acontece somente no banco interno do CRM.</p>
              <p className="mt-1 text-muted-foreground">
                Nenhum pedido é criado na Shopify. CPF, CNPJ, endereço completo e observações dos pedidos também não são importados.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="rounded-xl border border-dashed border-border p-5">
              <span className="flex items-center gap-2 font-semibold">
                <FileSpreadsheet className="size-4" /> Arquivo de Pedidos
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">CSV exportado pela Tray com cliente, data, valor e status.</span>
              <input
                className="mt-4 block w-full text-sm"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setOrdersFile(event.target.files?.[0] ?? null);
                  setDataset(null);
                }}
              />
              {ordersFile && <p className="mt-2 text-xs font-medium text-brand">{ordersFile.name}</p>}
            </label>

            <label className="rounded-xl border border-dashed border-border p-5">
              <span className="flex items-center gap-2 font-semibold">
                <FileSpreadsheet className="size-4" /> Arquivo de Produtos vendidos
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">CSV com Código pedido, Código produto, referência, quantidade e preço.</span>
              <input
                className="mt-4 block w-full text-sm"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setItemsFile(event.target.files?.[0] ?? null);
                  setDataset(null);
                }}
              />
              {itemsFile && <p className="mt-2 text-xs font-medium text-brand">{itemsFile.name}</p>}
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={analyze} disabled={!ordersFile || !itemsFile || isAnalyzing || isImporting} className="gap-2">
              {isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {isAnalyzing ? "Conferindo arquivos..." : "Analisar antes de importar"}
            </Button>
          </div>
        </div>

        {dataset && (
          <div className="mt-6 space-y-6">
            <div className="surface-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Conferência concluída</h2>
                  <p className="text-sm text-muted-foreground">
                    Período: {formatDate(dataset.stats.periodStart)} até {formatDate(dataset.stats.periodEnd)}
                  </p>
                </div>
                {hasBlockingWarnings ? (
                  <Badge variant="destructive">Divergências encontradas</Badge>
                ) : (
                  <Badge className="bg-success-soft text-success hover:bg-success-soft">Arquivos consistentes</Badge>
                )}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Pedidos", dataset.stats.orderCount],
                  ["Clientes", dataset.stats.customerCount],
                  ["Linhas de produtos", dataset.stats.itemLineCount],
                  ["Unidades", dataset.stats.unitCount],
                  ["Vendas válidas", dataset.stats.paidOrderCount],
                  ["Cancelados", dataset.stats.cancelledOrderCount],
                  ["Pendentes", dataset.stats.pendingOrderCount],
                  ["Diferenças de subtotal", dataset.stats.subtotalMismatchCount],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-border p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-bold">{formatNumber(Number(value))}</p>
                  </div>
                ))}
              </div>

              {dataset.warnings.length > 0 && (
                <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div className="space-y-1 text-sm">
                      {dataset.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
                <p className="max-w-2xl text-xs text-muted-foreground">
                  A importação é idempotente: executar novamente os mesmos arquivos atualiza os registros TRAY existentes em vez de duplicá-los. O RFM é recalculado somente ao final.
                </p>
                <Button onClick={importHistory} disabled={isImporting || hasBlockingWarnings} className="gap-2 bg-brand text-white hover:bg-brand/90">
                  {isImporting ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
                  {isImporting ? "Importando histórico..." : "Importar para o CRM"}
                </Button>
              </div>

              {isImporting && (
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>Importando clientes, pedidos e produtos</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-brand transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </div>

            {result && (
              <div className="surface-card border border-success/30 p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" />
                  <div className="flex-1">
                    <h2 className="text-lg font-bold">Histórico Tray incorporado ao CRM</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatNumber(result.trayOrders)} pedidos e {formatNumber(result.trayItems)} itens históricos estão disponíveis para RFM, recorrência, ticket e segmentação.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">Novos pedidos: {formatNumber(result.newOrders)}</Badge>
                      <Badge variant="outline">Reimportados: {formatNumber(result.reimportedOrders)}</Badge>
                      <Badge variant="outline">Duplicidades evitadas: {formatNumber(result.skippedLikelyDuplicates)}</Badge>
                      <Badge variant="outline">RFM atualizado: {formatNumber(result.rfm.updatedCustomers)} clientes</Badge>
                    </div>
                    <div className="mt-5 flex gap-2">
                      <Link to="/crm" search={{ tab: "rfm" }}>
                        <Button className="gap-2">Ver Análise RFM</Button>
                      </Link>
                      <Link to="/crm" search={{ tab: "contatos" }}>
                        <Button variant="outline">Ver contatos</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
