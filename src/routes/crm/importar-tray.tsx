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
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
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
    <Box sx={{ minHeight: "100vh" }}>
      <Box sx={{ maxWidth: 1152, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Link to="/crm" search={{ tab: "contatos" }}>
              <IconButton sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <ArrowLeft size={16} />
              </IconButton>
            </Link>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 4,
                background: "linear-gradient(135deg, #7367F0, #9C93F3)",
                color: "#fff",
              }}
            >
              <Database size={20} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>Importar histórico da Tray</Typography>
              <Typography variant="body2" color="text.secondary">
                Pedidos + produtos vendidos são unidos pelo código do pedido antes de entrar no CRM.
              </Typography>
            </Box>
          </Stack>
          <Chip variant="outlined" label="Origem preservada: TRAY" sx={{ px: 1 }} />
        </Stack>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Já no CRM</Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>{formatNumber(currentStatus?.trayOrders ?? 0)}</Typography>
              <Typography variant="caption" color="text.secondary">pedidos históricos da Tray</Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Itens históricos</Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>{formatNumber(currentStatus?.trayItems ?? 0)}</Typography>
              <Typography variant="caption" color="text.secondary">linhas de produtos importadas</Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Vendas válidas</Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>{formatNumber(currentStatus?.trayPaidOrders ?? 0)}</Typography>
              <Typography variant="caption" color="text.secondary">pedidos Tray considerados no RFM</Typography>
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
          <Stack direction="row" spacing={1.5} sx={{ border: "1px solid", borderColor: "divider", bgcolor: "action.hover", borderRadius: 3, p: 2 }}>
            <CheckCircle2 size={20} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-success-main, #28C76F)" />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>A importação acontece somente no banco interno do CRM.</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Nenhum pedido é criado na Shopify. CPF, CNPJ, endereço completo e observações dos pedidos também não são importados.
              </Typography>
            </Box>
          </Stack>

          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box component="label" sx={{ display: "block", border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <FileSpreadsheet size={16} />
                  <Typography sx={{ fontWeight: 600 }}>Arquivo de Pedidos</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  CSV exportado pela Tray com cliente, data, valor e status.
                </Typography>
                <Box
                  component="input"
                  type="file"
                  accept=".csv,text/csv"
                  sx={{ mt: 2, display: "block", width: "100%", fontSize: 14 }}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setOrdersFile(event.target.files?.[0] ?? null);
                    setDataset(null);
                  }}
                />
                {ordersFile && <Typography variant="caption" sx={{ display: "block", mt: 1, fontWeight: 600, color: "primary.main" }}>{ordersFile.name}</Typography>}
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Box component="label" sx={{ display: "block", border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <FileSpreadsheet size={16} />
                  <Typography sx={{ fontWeight: 600 }}>Arquivo de Produtos vendidos</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  CSV com Código pedido, Código produto, referência, quantidade e preço.
                </Typography>
                <Box
                  component="input"
                  type="file"
                  accept=".csv,text/csv"
                  sx={{ mt: 2, display: "block", width: "100%", fontSize: 14 }}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setItemsFile(event.target.files?.[0] ?? null);
                    setDataset(null);
                  }}
                />
                {itemsFile && <Typography variant="caption" sx={{ display: "block", mt: 1, fontWeight: 600, color: "primary.main" }}>{itemsFile.name}</Typography>}
              </Box>
            </Grid>
          </Grid>

          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2.5 }}>
            <Button
              variant="contained"
              startIcon={isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              onClick={analyze}
              disabled={!ordersFile || !itemsFile || isAnalyzing || isImporting}
            >
              {isAnalyzing ? "Conferindo arquivos..." : "Analisar antes de importar"}
            </Button>
          </Box>
        </Box>

        {dataset && (
          <Stack spacing={3} sx={{ mt: 3 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
              <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Conferência concluída</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Período: {formatDate(dataset.stats.periodStart)} até {formatDate(dataset.stats.periodEnd)}
                  </Typography>
                </Box>
                {hasBlockingWarnings ? (
                  <Chip color="error" label="Divergências encontradas" />
                ) : (
                  <Chip color="success" label="Arquivos consistentes" />
                )}
              </Stack>

              <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
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
                  <Grid key={String(label)} size={{ xs: 6, sm: 3 }}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>{formatNumber(Number(value))}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>

              {dataset.warnings.length > 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 2.5, border: "1px solid", borderColor: "error.main", bgcolor: "error.50", borderRadius: 3, p: 2 }}>
                  <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-error-main, #EA5455)" />
                  <Stack spacing={0.5}>
                    {dataset.warnings.map((warning) => (
                      <Typography key={warning} variant="body2">{warning}</Typography>
                    ))}
                  </Stack>
                </Stack>
              )}

              <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", mt: 3, borderTop: "1px solid", borderColor: "divider", pt: 2.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 480 }}>
                  A importação é idempotente: executar novamente os mesmos arquivos atualiza os registros TRAY existentes em vez de duplicá-los. O RFM é recalculado somente ao final.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={isImporting ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                  onClick={importHistory}
                  disabled={isImporting || hasBlockingWarnings}
                >
                  {isImporting ? "Importando histórico..." : "Importar para o CRM"}
                </Button>
              </Stack>

              {isImporting && (
                <Box sx={{ mt: 2.5 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">Importando clientes, pedidos e produtos</Typography>
                    <Typography variant="caption" color="text.secondary">{progress}%</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 999 }} />
                </Box>
              )}
            </Box>

            {result && (
              <Box sx={{ border: "1px solid", borderColor: "success.main", borderRadius: 3, p: 3 }}>
                <Stack direction="row" spacing={1.5}>
                  <CheckCircle2 size={24} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-success-main, #28C76F)" />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Histórico Tray incorporado ao CRM</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {formatNumber(result.trayOrders)} pedidos e {formatNumber(result.trayItems)} itens históricos estão disponíveis para RFM, recorrência, ticket e segmentação.
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 2 }}>
                      <Chip variant="outlined" label={`Novos pedidos: ${formatNumber(result.newOrders)}`} />
                      <Chip variant="outlined" label={`Reimportados: ${formatNumber(result.reimportedOrders)}`} />
                      <Chip variant="outlined" label={`Duplicidades evitadas: ${formatNumber(result.skippedLikelyDuplicates)}`} />
                      <Chip variant="outlined" label={`RFM atualizado: ${formatNumber(result.rfm.updatedCustomers)} clientes`} />
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ mt: 2.5 }}>
                      <Link to="/crm" search={{ tab: "rfm" }}>
                        <Button variant="contained">Ver Análise RFM</Button>
                      </Link>
                      <Link to="/crm" search={{ tab: "contatos" }}>
                        <Button variant="outline">Ver contatos</Button>
                      </Link>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
