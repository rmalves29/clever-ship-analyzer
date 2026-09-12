import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, RefreshCw, BarChart3, ShoppingBag, CreditCard, ShoppingCart, ArrowUpRight, MapPin } from "lucide-react";
import { lazy, Suspense } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getLiveViewData } from "@/lib/shopify-live-view.functions";
import { brl } from "@/lib/crm-mock";
import { syncShopifyData } from "@/lib/crm-sync.functions";

// Carregamento dinâmico do globo para evitar problemas com SSR e bibliotecas pesadas
const LiveGlobe = lazy(() => import("@/components/crm/LiveGlobe"));

export const Route = createFileRoute("/crm/live-view")({
  component: LiveViewPage,
  head: () => ({
    meta: [
      { title: "Live View | CRM Insights" },
      { name: "description", content: "Monitoramento em tempo real das atividades na loja." },
    ],
  }),
});

function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

function LiveViewPage() {
  const fetchLiveView = useServerFn(getLiveViewData);
  const fetchSync = useServerFn(syncShopifyData);

  const { data, isLoading } = useQuery({
    queryKey: ["live-view-data"],
    queryFn: () => fetchLiveView(),
    refetchInterval: 30_000,
  });

  const funilTotal = data ? Math.max(data.carrinhosAtivosHoje, 1) : 1;

  return (
    <Box sx={{ minHeight: "100vh", pb: 4 }}>
      <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 4 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
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
              <Activity size={20} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>Live View</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "success.main",
                    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    "@keyframes pulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.4 } },
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  Dados reais da Shopify (sessões via ShopifyQL, pedidos sincronizados)
                </Typography>
              </Stack>
            </Box>
          </Stack>
          <Button variant="outline" size="small" startIcon={<RefreshCw size={16} />} onClick={() => fetchSync({ data: { fullSync: false } })}>
            Atualizar agora
          </Button>
        </Stack>

        {data?.sessoesIndisponiveis && (
          <Box sx={{ mb: 3, border: "1px solid", borderColor: "warning.main", bgcolor: "warning.50", borderRadius: 2, p: 1.5 }}>
            <Typography variant="caption" color="warning.main">
              Sessões, visitantes e o funil de carrinho/checkout estão marcados como <strong>indisponível</strong> —
              a consulta de sessões (ShopifyQL) não retornou dados dessa vez, provavelmente um erro temporário da API
              ou de credenciais. Pedidos, vendas, produtos e atividade recente abaixo continuam 100% reais (vêm da
              base sincronizada, não dependem dessa consulta). Tente atualizar a página em alguns minutos.
            </Typography>
          </Box>
        )}

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "success.main", borderRadius: 3, p: 2.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
                Visitantes agora
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, lineHeight: 1 }}>
                {data?.sessoesIndisponiveis ? "—" : (data?.visitantesAgora ?? (isLoading ? "…" : 0))}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, fontSize: 10 }}>
                {data?.sessoesIndisponiveis
                  ? "Indisponível — ver aviso acima."
                  : "Estimativa: sessões iniciadas nos últimos 30 min — a Shopify usa um contador ao vivo interno que nenhuma API pública expõe, então esse número pode divergir do admin."}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "primary.main", borderRadius: 3, p: 2.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
                Total de vendas (hoje)
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, lineHeight: 1 }}>{data ? brl(data.faturamentoHoje) : "R$ 0"}</Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "warning.main", borderRadius: 3, p: 2.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
                Sessões (hoje)
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, lineHeight: 1 }}>{data?.sessoesIndisponiveis ? "—" : (data?.sessoesHoje ?? 0)}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, fontSize: 10 }}>
                {data?.sessoesIndisponiveis ? "Indisponível" : `${data?.visitantesUnicosHoje ?? 0} visitantes únicos`}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "info.main", borderRadius: 3, p: 2.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
                Pedidos (hoje)
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, lineHeight: 1 }}>{data?.pedidosHoje ?? 0}</Typography>
            </Box>
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Box sx={{ position: "relative", minHeight: 500, borderRadius: 3, overflow: "hidden", display: "flex", flexDirection: "column", bgcolor: "action.hover" }}>
              <Box sx={{ position: "absolute", top: 24, left: 24, zIndex: 2 }}>
                <Chip
                  variant="outlined"
                  label="Sessões e pedidos reais de hoje"
                  sx={{ bgcolor: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)", fontSize: 12 }}
                />
              </Box>

              <Box sx={{ flex: 1, width: "100%", minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Suspense
                  fallback={
                    <Stack spacing={1} sx={{ alignItems: "center", color: "text.secondary" }}>
                      <RefreshCw size={32} className="animate-spin" />
                      <Typography variant="body2">Iniciando globo 3D...</Typography>
                    </Stack>
                  }
                >
                  <LiveGlobe markers={data?.marcadoresGlobo ?? []} />
                </Suspense>
              </Box>

              <Stack direction="row" spacing={2} sx={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", bgcolor: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)", px: 1.5, py: 0.5, borderRadius: 999, border: "1px solid", borderColor: "divider" }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#ef4444" }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, fontSize: 10 }}>Sessões</Typography>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", bgcolor: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)", px: 1.5, py: 0.5, borderRadius: 999, border: "1px solid", borderColor: "divider" }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#9333ea" }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, fontSize: 10 }}>Pedidos</Typography>
                </Stack>
              </Stack>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Stack spacing={3}>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 3 }}>Comportamento do cliente (hoje)</Typography>
                {data?.sessoesIndisponiveis ? (
                  <Typography variant="caption" color="text.secondary">Indisponível — ver aviso no topo da página.</Typography>
                ) : (
                  <Stack spacing={3}>
                    <Box>
                      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">Carrinhos com adição</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{data?.carrinhosAtivosHoje ?? 0}</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={100} sx={{ height: 6, borderRadius: 999 }} />
                    </Box>
                    <Box>
                      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">Chegaram no checkout</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{data?.noCheckoutHoje ?? 0}</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={data ? Math.min(100, (data.noCheckoutHoje / funilTotal) * 100) : 0} sx={{ height: 6, borderRadius: 999 }} />
                    </Box>
                    <Box>
                      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">Comprado</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{data?.compradoHoje ?? 0}</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={data ? Math.min(100, (data.compradoHoje / funilTotal) * 100) : 0} sx={{ height: 6, borderRadius: 999 }} />
                    </Box>
                  </Stack>
                )}
              </Box>

              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>Clientes novos x recorrentes (hoje)</Typography>
                <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "info.main" }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10 }}>Novo</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{data?.clientesNovosHoje ?? 0}</Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10 }}>Recorrente</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{data?.clientesRecorrentesHoje ?? 0}</Typography>
                    </Box>
                  </Stack>
                </Stack>
                {data && data.clientesNovosHoje + data.clientesRecorrentesHoje > 0 && (
                  <Stack direction="row" sx={{ width: "100%", height: 32, borderRadius: 1, overflow: "hidden" }}>
                    <Box sx={{ height: "100%", bgcolor: "info.main", width: `${(data.clientesNovosHoje / (data.clientesNovosHoje + data.clientesRecorrentesHoje)) * 100}%` }} />
                    <Box sx={{ height: "100%", bgcolor: "primary.main", width: `${(data.clientesRecorrentesHoje / (data.clientesNovosHoje + data.clientesRecorrentesHoje)) * 100}%` }} />
                  </Stack>
                )}
              </Box>
            </Stack>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Activity size={16} color="var(--mui-palette-success-main, #28C76F)" />
                  <Typography sx={{ fontWeight: 700 }}>Atividade Recente</Typography>
                </Stack>
                <ArrowUpRight size={16} color="var(--mui-palette-text-secondary)" />
              </Stack>
              <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 1 }}>
                {(data?.atividadeRecente ?? []).length === 0 && (
                  <Typography variant="caption" color="text.secondary">Nenhuma atividade ainda hoje.</Typography>
                )}
                {(data?.atividadeRecente ?? []).map((a, i) => (
                  <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: "flex-start", pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: a.tipo === "pedido" ? "success.50" : "warning.50",
                      }}
                    >
                      {a.tipo === "pedido" ? <ShoppingBag size={16} color="var(--mui-palette-success-main, #28C76F)" /> : <ShoppingCart size={16} color="var(--mui-palette-warning-main, #FF9F43)" />}
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 500, display: "block" }}>
                        {a.tipo === "pedido" ? "Novo pedido" : "Carrinho abandonado"}
                        {a.cidade ? ` de ${a.cidade}` : ""}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                        {relativeTime(a.createdAt)}
                        {a.valor != null ? ` · ${brl(a.valor)}` : ""}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 3 }}>
                <MapPin size={16} color="var(--mui-palette-primary-main, #7367F0)" />
                <Typography sx={{ fontWeight: 700 }}>Sessões por local (hoje)</Typography>
              </Stack>
              <Stack spacing={2.5}>
                {data?.sessoesIndisponiveis && (
                  <Typography variant="caption" color="text.secondary">Indisponível — ver aviso no topo da página.</Typography>
                )}
                {!data?.sessoesIndisponiveis && (data?.sessoesPorLocal ?? []).length === 0 && (
                  <Typography variant="caption" color="text.secondary">Sem sessões registradas hoje ainda.</Typography>
                )}
                {(data?.sessoesPorLocal ?? []).slice(0, 5).map((s, i) => {
                  const max = data?.sessoesPorLocal[0]?.sessoes || 1;
                  return (
                    <Box key={i}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Brazil · {s.regiao} · {s.cidade}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>{s.sessoes}</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={(s.sessoes / max) * 100} sx={{ height: 6, borderRadius: 999 }} />
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
                <BarChart3 size={16} color="var(--mui-palette-primary-main, #7367F0)" />
                <Typography sx={{ fontWeight: 700 }}>Total de vendas por produto (hoje)</Typography>
              </Stack>
              <Stack spacing={2} sx={{ maxHeight: 300, overflowY: "auto", pr: 1 }}>
                {(data?.topProdutosHoje ?? []).length === 0 && (
                  <Typography variant="caption" color="text.secondary">Nenhuma venda ainda hoje.</Typography>
                )}
                {(data?.topProdutosHoje ?? []).map((item, i) => (
                  <Stack key={i} direction="row" sx={{ justifyContent: "space-between", alignItems: "center", pb: 1, borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { border: "none", pb: 0 } }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0, maxWidth: 180 }}>
                      <Box sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: 1, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ShoppingBag size={14} color="var(--mui-palette-text-secondary)" />
                      </Box>
                      <Typography variant="caption" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nome}</Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ fontWeight: 700, flexShrink: 0 }}>{brl(item.total)}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Grid>
        </Grid>

        <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center", color: "text.secondary" }}>
          <CreditCard size={12} />
          <Typography variant="caption" sx={{ fontSize: 10 }}>
            Sessões, funil e local via ShopifyQL (Shopify) · pedidos, produtos e novo/recorrente via base sincronizada.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
