import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock3,
  DollarSign,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ReceiptText,
  Repeat2,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tags,
  UserRound,
} from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { getCustomer360 } from "@/lib/crm-customer-360.functions";
import { RFM_SEGMENTS_CONFIG } from "@/lib/crm-rfm-shared";
import { brl } from "@/lib/crm-mock";

export const Route = createFileRoute("/crm/cliente/$customerId")({
  head: () => ({
    meta: [
      { title: "Cliente 360 | CRM" },
      { name: "description", content: "Visão unificada do histórico comercial e relacionamento da cliente." },
    ],
  }),
  component: Customer360Page,
});

function datePt(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" });
}

function MetricCard({ icon: Icon, label, value, hint }: any) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          {label}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 2, bgcolor: "action.hover", color: "text.secondary" }}>
          <Icon size={16} />
        </Box>
      </Stack>
      <Typography variant="h5" sx={{ fontWeight: 700, mt: 1.5 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{hint}</Typography>
    </Box>
  );
}

function stageLabel(stage: string) {
  if (stage === "RECORRENTE") return "Cliente recorrente";
  if (stage === "SEGUNDA_COMPRA_PENDENTE") return "2ª compra pendente";
  return "Sem compra válida";
}

function statusLabel(status: string | null) {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "PAID") return "Pago";
  if (normalized === "PARTIALLY_PAID") return "Parcialmente pago";
  if (normalized === "REFUNDED") return "Reembolsado";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "Cancelado";
  if (normalized === "PENDING") return "Pendente";
  return status || "—";
}

function Customer360Page() {
  const { customerId } = Route.useParams();
  const fetchCustomer = useServerFn(getCustomer360);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["crm-customer-360", customerId],
    queryFn: () => fetchCustomer({ data: { customerId } }),
    retry: 1,
  });

  if (isLoading) {
    return (
      <Box sx={{ minHeight: "100vh", p: 4 }}>
        <Box sx={{ maxWidth: 1400, mx: "auto" }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, display: "flex", minHeight: 288, alignItems: "center", justifyContent: "center" }}>
            <Typography variant="body2" color="text.secondary">Carregando ficha 360 da cliente...</Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box sx={{ minHeight: "100vh", p: 4 }}>
        <Box sx={{ maxWidth: 768, mx: "auto" }}>
          <Box sx={{ border: "1px solid", borderColor: "error.main", borderRadius: 3, p: 3 }}>
            <Stack direction="row" spacing={1.5}>
              <AlertTriangle size={20} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-error-main, #EA5455)" />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Não foi possível abrir a cliente</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{(error as any)?.message ?? "Falha ao carregar a ficha 360."}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
                  <Link to="/crm" search={{ tab: "contatos" }}>
                    <Button variant="contained">Voltar aos contatos</Button>
                  </Link>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Box>
      </Box>
    );
  }

  const { customer, metrics, segments, products, recentOrders, engagement } = data;
  const rfmColor = customer.rfmSegment
    ? RFM_SEGMENTS_CONFIG[customer.rfmSegment as keyof typeof RFM_SEGMENTS_CONFIG]?.color
    : undefined;
  const initials = customer.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("") || "CL";

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
            <Link to="/crm" search={{ tab: "contatos" }}>
              <IconButton sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <ArrowLeft size={16} />
              </IconButton>
            </Link>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 4, bgcolor: "action.hover", color: "primary.main", fontSize: 18, fontWeight: 700 }}>
              {initials}
            </Box>
            <Box>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{customer.name}</Typography>
                {customer.rfmSegment && (
                  <Chip
                    variant="outlined"
                    label={customer.rfmSegment}
                    sx={{ fontWeight: 700, color: rfmColor, borderColor: rfmColor ? `${rfmColor}80` : undefined }}
                  />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Ficha 360 · histórico comercial unificado do CRM</Typography>
              <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", mt: 1.5, color: "text.secondary" }}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}><Mail size={14} /><Typography variant="body2">{customer.email || "Sem e-mail"}</Typography></Stack>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}><Phone size={14} /><Typography variant="body2">{customer.phone || "Sem telefone"}</Typography></Stack>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}><MapPin size={14} /><Typography variant="body2">{[customer.city, customer.province].filter(Boolean).join(" / ") || "Localização não informada"}</Typography></Stack>
              </Stack>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Chip label={stageLabel(metrics.purchaseStage)} sx={{ px: 1 }} />
            {metrics.recurrence && <Chip color="success" label="Recorrente" />}
          </Stack>
        </Stack>

        <Grid container spacing={2} sx={{ mt: 3 }}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <MetricCard icon={ShoppingBag} label="Compras válidas" value={metrics.totalOrders} hint={`${metrics.trayOrders} Tray · ${metrics.shopifyOrders} Shopify`} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <MetricCard icon={DollarSign} label="Total gasto" value={brl(metrics.totalSpent)} hint="Somente pedidos válidos para receita" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <MetricCard icon={ReceiptText} label="Ticket médio" value={brl(metrics.averageTicket)} hint="Média por compra válida" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <MetricCard icon={Clock3} label="Última compra" value={datePt(metrics.lastOrderAt)} hint={metrics.daysSinceLastPurchase == null ? "Sem compra válida" : `${metrics.daysSinceLastPurchase} dia(s) desde a compra`} />
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, lg: 5 }}>
            <Stack spacing={3}>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <UserRound size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Perfil comercial</Typography>
                </Stack>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid size={6}><Typography variant="caption" color="text.secondary">Primeira compra</Typography><Typography sx={{ fontWeight: 600 }}>{datePt(metrics.firstOrderAt)}</Typography></Grid>
                  <Grid size={6}><Typography variant="caption" color="text.secondary">Última compra</Typography><Typography sx={{ fontWeight: 600 }}>{datePt(metrics.lastOrderAt)}</Typography></Grid>
                  <Grid size={6}><Typography variant="caption" color="text.secondary">Origem Tray</Typography><Typography sx={{ fontWeight: 600 }}>{metrics.trayOrders} compra(s)</Typography></Grid>
                  <Grid size={6}><Typography variant="caption" color="text.secondary">Origem Shopify</Typography><Typography sx={{ fontWeight: 600 }}>{metrics.shopifyOrders} compra(s)</Typography></Grid>
                  <Grid size={6}><Typography variant="caption" color="text.secondary">Situação de recompra</Typography><Typography sx={{ fontWeight: 600 }}>{stageLabel(metrics.purchaseStage)}</Typography></Grid>
                  <Grid size={6}><Typography variant="caption" color="text.secondary">Tempo até 2ª compra</Typography><Typography sx={{ fontWeight: 600 }}>{metrics.daysToSecondPurchase == null ? "—" : `${metrics.daysToSecondPurchase} dia(s)`}</Typography></Grid>
                </Grid>

                <Box sx={{ mt: 3, borderTop: "1px solid", borderColor: "divider", pt: 2.5 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.secondary" }}>
                    <Tags size={14} />
                    <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Tags</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 1.5 }}>
                    {[...(customer.tags || []), ...(customer.tagsCustom || [])].length === 0 ? (
                      <Typography variant="body2" color="text.secondary">Nenhuma tag.</Typography>
                    ) : (
                      [...new Set([...(customer.tags || []), ...(customer.tagsCustom || [])])].map((tag: string) => (
                        <Chip key={tag} size="small" variant="outlined" label={tag} />
                      ))
                    )}
                  </Stack>
                </Box>
              </Box>

              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Repeat2 size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Segmentos atuais</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Calculados agora com as regras salvas no CRM.</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 1.5 }}>
                  {segments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">Esta cliente não está em nenhum segmento salvo.</Typography>
                  ) : segments.map((segment: any) => (
                    <Chip key={segment.id} size="small" variant="outlined" color="primary" label={segment.name} />
                  ))}
                </Stack>
              </Box>

              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <MessageCircle size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Relacionamento</Typography>
                </Stack>
                <Grid container spacing={1.5} sx={{ mt: 1 }}>
                  <Grid size={4}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5, textAlign: "center" }}>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{engagement.campaigns.length}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Campanhas</Typography>
                    </Box>
                  </Grid>
                  <Grid size={4}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5, textAlign: "center" }}>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{engagement.automations.length}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Automações</Typography>
                    </Box>
                  </Grid>
                  <Grid size={4}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5, textAlign: "center" }}>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{engagement.abandonedCheckouts.length}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Abandonos</Typography>
                    </Box>
                  </Grid>
                </Grid>

                {engagement.campaigns.length > 0 && (
                  <Stack spacing={1} sx={{ mt: 2.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Últimas campanhas</Typography>
                    {engagement.campaigns.slice(0, 5).map((campaign: any, index: number) => (
                      <Stack key={`${campaign.campaignId}-${index}`} direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "center", borderRadius: 3, bgcolor: "action.hover", px: 1.5, py: 1 }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{campaign.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{datePt(campaign.sentAt, true)}</Typography>
                        </Box>
                        <Chip size="small" variant="outlined" label={campaign.status || "—"} />
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, lg: 7 }}>
            <Stack spacing={3}>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
                <Box sx={{ borderBottom: "1px solid", borderColor: "divider", p: 3 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Package size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Produtos comprados</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Tray e Shopify unificados por SKU quando disponível.</Typography>
                </Box>
                <TableContainer sx={{ maxHeight: 430, overflow: "auto" }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>PRODUTO</TableCell>
                        <TableCell>ORIGEM</TableCell>
                        <TableCell align="center">QTD.</TableCell>
                        <TableCell align="right">GASTO</TableCell>
                        <TableCell align="right">ÚLTIMA</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {products.length === 0 ? (
                        <TableRow><TableCell colSpan={5} align="center" sx={{ height: 96, color: "text.secondary" }}>Nenhum produto em pedido válido.</TableCell></TableRow>
                      ) : products.map((product: any, index: number) => (
                        <TableRow key={`${product.sku || product.productId || product.title}-${index}`}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{product.title}</Typography>
                            <Typography variant="caption" color="text.secondary">{product.sku || "Sem SKU"} · {product.orderCount} pedido(s)</Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                              {product.sources.map((source: string) => <Chip key={source} size="small" variant="outlined" label={source} sx={{ fontSize: 10, height: 20 }} />)}
                            </Stack>
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>{product.quantity}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>{brl(product.spent)}</TableCell>
                          <TableCell align="right" sx={{ color: "text.secondary" }}>{datePt(product.lastPurchasedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <CalendarDays size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Histórico de pedidos</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Últimos pedidos registrados no CRM, incluindo status não válidos para receita.</Typography>
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {recentOrders.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">Nenhum pedido encontrado.</Typography>
                  ) : recentOrders.map((order: any) => (
                    <Box key={order.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Box>
                          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
                            <Typography sx={{ fontWeight: 700 }}>{order.orderNumber || order.id}</Typography>
                            <Chip
                              size="small"
                              variant="outlined"
                              label={order.source}
                              sx={order.source === "TRAY" ? { color: "#b45309", borderColor: "rgba(180,83,9,0.4)" } : { color: "primary.main", borderColor: "primary.light" }}
                            />
                            <Chip size="small" variant={order.validRevenue ? "filled" : "outlined"} label={statusLabel(order.financialStatus)} />
                          </Stack>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                            {datePt(order.date, true)}{order.paymentType ? ` · ${order.paymentType}` : ""}{order.coupon ? ` · Cupom ${order.coupon}` : ""}
                          </Typography>
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{brl(order.total)}</Typography>
                      </Stack>
                      {order.items.length > 0 && (
                        <Stack spacing={0.5} sx={{ mt: 1.5, borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                          {order.items.map((item: any) => (
                            <Stack key={item.id} direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                              <Typography variant="body2" color="text.secondary">{item.quantity}× {item.title}{item.sku ? ` · ${item.sku}` : ""}</Typography>
                              <Typography variant="body2">{brl(item.unitPrice * item.quantity)}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>

              {engagement.abandonedCheckouts.length > 0 && (
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <ShoppingCart size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Checkouts abandonados</Typography>
                  </Stack>
                  <Stack spacing={1} sx={{ mt: 1.5 }}>
                    {engagement.abandonedCheckouts.slice(0, 10).map((checkout: any) => (
                      <Stack key={checkout.id} direction="row" sx={{ justifyContent: "space-between", alignItems: "center", borderRadius: 3, bgcolor: "action.hover", px: 1.5, py: 1 }}>
                        <Typography variant="body2">{datePt(checkout.createdAt, true)}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{brl(checkout.total)}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          </Grid>
        </Grid>

        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 3, alignItems: "center", color: "text.secondary" }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Store size={14} />
            <Typography variant="caption">Base comercial: Tray + Shopify</Typography>
          </Stack>
          <Typography variant="caption">·</Typography>
          <Typography variant="caption">Atualizado no CRM: {datePt(customer.updatedAt, true)}</Typography>
        </Stack>
      </Box>
    </Box>
  );
}
