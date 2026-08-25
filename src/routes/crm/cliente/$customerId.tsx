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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div className="surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
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
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-7xl">
          <div className="surface-card flex min-h-72 items-center justify-center text-sm text-muted-foreground">
            Carregando ficha 360 da cliente...
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-4xl">
          <div className="surface-card border border-destructive/30 p-6">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-destructive" />
              <div>
                <h1 className="font-bold">Não foi possível abrir a cliente</h1>
                <p className="mt-1 text-sm text-muted-foreground">{(error as any)?.message ?? "Falha ao carregar a ficha 360."}</p>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
                  <Link to="/crm" search={{ tab: "contatos" }}><Button>Voltar aos contatos</Button></Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link to="/crm" search={{ tab: "contatos" }}>
              <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
            </Link>
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand/10 text-lg font-bold text-brand">{initials}</div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
                {customer.rfmSegment && (
                  <Badge
                    variant="outline"
                    className="font-bold"
                    style={{ color: rfmColor, borderColor: rfmColor ? `${rfmColor}50` : undefined }}
                  >
                    {customer.rfmSegment}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Ficha 360 · histórico comercial unificado do CRM</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Mail className="size-3.5" /> {customer.email || "Sem e-mail"}</span>
                <span className="flex items-center gap-1.5"><Phone className="size-3.5" /> {customer.phone || "Sem telefone"}</span>
                <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {[customer.city, customer.province].filter(Boolean).join(" / ") || "Localização não informada"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="px-3 py-1.5">{stageLabel(metrics.purchaseStage)}</Badge>
            {metrics.recurrence && <Badge className="bg-success-soft text-success hover:bg-success-soft">Recorrente</Badge>}
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={ShoppingBag} label="Compras válidas" value={metrics.totalOrders} hint={`${metrics.trayOrders} Tray · ${metrics.shopifyOrders} Shopify`} />
          <MetricCard icon={DollarSign} label="Total gasto" value={brl(metrics.totalSpent)} hint="Somente pedidos válidos para receita" />
          <MetricCard icon={ReceiptText} label="Ticket médio" value={brl(metrics.averageTicket)} hint="Média por compra válida" />
          <MetricCard icon={Clock3} label="Última compra" value={datePt(metrics.lastOrderAt)} hint={metrics.daysSinceLastPurchase == null ? "Sem compra válida" : `${metrics.daysSinceLastPurchase} dia(s) desde a compra`} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-6">
            <section className="surface-card p-6">
              <div className="flex items-center gap-2">
                <UserRound className="size-5 text-brand" />
                <h2 className="text-lg font-bold">Perfil comercial</h2>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Primeira compra</p><p className="mt-1 font-semibold">{datePt(metrics.firstOrderAt)}</p></div>
                <div><p className="text-xs text-muted-foreground">Última compra</p><p className="mt-1 font-semibold">{datePt(metrics.lastOrderAt)}</p></div>
                <div><p className="text-xs text-muted-foreground">Origem Tray</p><p className="mt-1 font-semibold">{metrics.trayOrders} compra(s)</p></div>
                <div><p className="text-xs text-muted-foreground">Origem Shopify</p><p className="mt-1 font-semibold">{metrics.shopifyOrders} compra(s)</p></div>
                <div><p className="text-xs text-muted-foreground">Situação de recompra</p><p className="mt-1 font-semibold">{stageLabel(metrics.purchaseStage)}</p></div>
                <div><p className="text-xs text-muted-foreground">Tempo até 2ª compra</p><p className="mt-1 font-semibold">{metrics.daysToSecondPurchase == null ? "—" : `${metrics.daysToSecondPurchase} dia(s)`}</p></div>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Tags className="size-3.5" /> Tags</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...(customer.tags || []), ...(customer.tagsCustom || [])].length === 0 ? (
                    <span className="text-sm text-muted-foreground">Nenhuma tag.</span>
                  ) : (
                    [...new Set([...(customer.tags || []), ...(customer.tagsCustom || [])])].map((tag: string) => <Badge key={tag} variant="outline">{tag}</Badge>)
                  )}
                </div>
              </div>
            </section>

            <section className="surface-card p-6">
              <div className="flex items-center gap-2">
                <Repeat2 className="size-5 text-brand" />
                <h2 className="text-lg font-bold">Segmentos atuais</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Calculados agora com as regras salvas no CRM.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {segments.length === 0 ? <span className="text-sm text-muted-foreground">Esta cliente não está em nenhum segmento salvo.</span> : segments.map((segment: any) => (
                  <Badge key={segment.id} variant="outline" className="border-brand/20 bg-brand/5 text-brand">{segment.name}</Badge>
                ))}
              </div>
            </section>

            <section className="surface-card p-6">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-5 text-brand" />
                <h2 className="text-lg font-bold">Relacionamento</h2>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border p-3 text-center"><p className="text-xl font-bold">{engagement.campaigns.length}</p><p className="text-[11px] text-muted-foreground">Campanhas</p></div>
                <div className="rounded-xl border border-border p-3 text-center"><p className="text-xl font-bold">{engagement.automations.length}</p><p className="text-[11px] text-muted-foreground">Automações</p></div>
                <div className="rounded-xl border border-border p-3 text-center"><p className="text-xl font-bold">{engagement.abandonedCheckouts.length}</p><p className="text-[11px] text-muted-foreground">Abandonos</p></div>
              </div>

              {engagement.campaigns.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Últimas campanhas</p>
                  {engagement.campaigns.slice(0, 5).map((campaign: any, index: number) => (
                    <div key={`${campaign.campaignId}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2 text-sm">
                      <div><p className="font-medium">{campaign.name}</p><p className="text-xs text-muted-foreground">{datePt(campaign.sentAt, true)}</p></div>
                      <Badge variant="outline">{campaign.status || "—"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="surface-card overflow-hidden">
              <div className="border-b border-border p-6">
                <div className="flex items-center gap-2"><Package className="size-5 text-brand" /><h2 className="text-lg font-bold">Produtos comprados</h2></div>
                <p className="mt-1 text-sm text-muted-foreground">Tray e Shopify unificados por SKU quando disponível.</p>
              </div>
              <div className="max-h-[430px] overflow-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>PRODUTO</TableHead><TableHead>ORIGEM</TableHead><TableHead className="text-center">QTD.</TableHead><TableHead className="text-right">GASTO</TableHead><TableHead className="text-right">ÚLTIMA</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {products.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Nenhum produto em pedido válido.</TableCell></TableRow>
                    ) : products.map((product: any, index: number) => (
                      <TableRow key={`${product.sku || product.productId || product.title}-${index}`}>
                        <TableCell><p className="font-medium">{product.title}</p><p className="text-xs text-muted-foreground">{product.sku || "Sem SKU"} · {product.orderCount} pedido(s)</p></TableCell>
                        <TableCell><div className="flex flex-wrap gap-1">{product.sources.map((source: string) => <Badge key={source} variant="outline" className="text-[10px]">{source}</Badge>)}</div></TableCell>
                        <TableCell className="text-center font-semibold">{product.quantity}</TableCell>
                        <TableCell className="text-right font-semibold">{brl(product.spent)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{datePt(product.lastPurchasedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="surface-card p-6">
              <div className="flex items-center gap-2"><CalendarDays className="size-5 text-brand" /><h2 className="text-lg font-bold">Histórico de pedidos</h2></div>
              <p className="mt-1 text-sm text-muted-foreground">Últimos pedidos registrados no CRM, incluindo status não válidos para receita.</p>
              <div className="mt-5 space-y-3">
                {recentOrders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido encontrado.</p> : recentOrders.map((order: any) => (
                  <div key={order.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">{order.orderNumber || order.id}</p>
                          <Badge variant="outline" className={order.source === "TRAY" ? "border-amber-300/50 text-amber-700" : "border-brand/20 text-brand"}>{order.source}</Badge>
                          <Badge variant={order.validRevenue ? "secondary" : "outline"}>{statusLabel(order.financialStatus)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{datePt(order.date, true)}{order.paymentType ? ` · ${order.paymentType}` : ""}{order.coupon ? ` · Cupom ${order.coupon}` : ""}</p>
                      </div>
                      <p className="text-lg font-bold">{brl(order.total)}</p>
                    </div>
                    {order.items.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        {order.items.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 py-1 text-sm">
                            <span className="text-muted-foreground">{item.quantity}× {item.title}{item.sku ? ` · ${item.sku}` : ""}</span>
                            <span>{brl(item.unitPrice * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {engagement.abandonedCheckouts.length > 0 && (
              <section className="surface-card p-6">
                <div className="flex items-center gap-2"><ShoppingCart className="size-5 text-brand" /><h2 className="text-lg font-bold">Checkouts abandonados</h2></div>
                <div className="mt-4 space-y-2">
                  {engagement.abandonedCheckouts.slice(0, 10).map((checkout: any) => (
                    <div key={checkout.id} className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 text-sm">
                      <span>{datePt(checkout.createdAt, true)}</span><span className="font-semibold">{brl(checkout.total)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Store className="size-3.5" /> Base comercial: Tray + Shopify</span>
          <span>·</span>
          <span>Atualizado no CRM: {datePt(customer.updatedAt, true)}</span>
        </div>
      </div>
    </div>
  );
}
