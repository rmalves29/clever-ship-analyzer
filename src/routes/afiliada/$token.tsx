import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { addAffiliatePostFn, getAffiliatePortalFn } from "@/lib/affiliates.functions";
import { affiliateLink, COMMISSION_STATUS_LABEL } from "@/lib/affiliate-commission";
import { brl, dateBr } from "@/components/afiliadas/format";

export const Route = createFileRoute("/afiliada/$token")({
  head: () => ({
    meta: [{ title: "Meu painel de afiliada | Mania de Mulher" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PainelAfiliada,
});

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <Card variant="outlined" sx={{ textAlign: "center", borderColor: highlight ? "primary.main" : undefined }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

function PainelAfiliada() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const portal = useServerFn(getAffiliatePortalFn);
  const addPost = useServerFn(addAffiliatePostFn);
  const { data, isLoading, error } = useQuery({ queryKey: ["affiliate-portal", token], queryFn: () => portal({ data: { token } }) });

  const [postUrl, setPostUrl] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const postMutation = useMutation({
    mutationFn: () => addPost({ data: { token, url: postUrl } }),
    onSuccess: (r) => {
      if (r.success) {
        setPostUrl("");
        setPostError(null);
        void queryClient.invalidateQueries({ queryKey: ["affiliate-portal", token] });
      } else setPostError(r.error);
    },
    onError: (e) => setPostError(e instanceof Error ? e.message : "Não foi possível registrar."),
  });

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* sem permissão de área de transferência */
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: { xs: 3, md: 5 }, px: 2 }}>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        {isLoading && <Typography color="text.secondary">Carregando…</Typography>}
        {error && <Alert severity="error">Não foi possível carregar seu painel. Tente de novo em instantes.</Alert>}
        {!isLoading && !error && !data && <Alert severity="warning">Link inválido. Peça um novo link para a equipe da Mania de Mulher.</Alert>}

        {data && !data.approved && (
          <Alert severity={data.status === "pending" ? "info" : "warning"}>
            {data.status === "pending"
              ? `Oi, ${data.name}! Seu cadastro está em análise. Assim que for aprovado, seu cupom e suas vendas aparecem aqui.`
              : `Oi, ${data.name}. Seu cadastro não está ativo no momento. Fale com a equipe da Mania de Mulher.`}
          </Alert>
        )}

        {data && data.approved && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Oi, {data.name}! 👋
              </Typography>
              <Typography color="text.secondary">Seu painel de afiliada Mania de Mulher.</Typography>
            </Box>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Seu cupom exclusivo
                </Typography>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                  <Typography variant="h4" sx={{ fontWeight: 900, fontFamily: "monospace" }}>
                    {data.code}
                  </Typography>
                  <Button size="small" variant="contained" onClick={() => copy(data.code, "code")}>
                    {copied === "code" ? "Copiado!" : "Copiar cupom"}
                  </Button>
                  {data.storeUrl && (
                    <Button size="small" variant="outlined" onClick={() => copy(affiliateLink(data.storeUrl!, data.code), "link")}>
                      {copied === "link" ? "Copiado!" : "Copiar link com cupom"}
                    </Button>
                  )}
                </Stack>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Quem comprar com o seu cupom ganha <b>{data.discountPct}% de desconto</b> e você ganha <b>{data.commissionPct}%</b> de comissão sobre os produtos.
                </Typography>
              </CardContent>
            </Card>

            <Grid container spacing={1.5}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stat label="Pedidos" value={data.orders} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stat label="Vendas (produtos)" value={brl(data.revenue)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stat label={`Em carência (${data.holdDays} dias)`} value={brl(data.commissionPending)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stat label="Liberada para pagar" value={brl(data.commissionApproved)} highlight />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Stat label="Já paga a você" value={brl(data.commissionPaid)} />
              </Grid>
            </Grid>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                Suas vendas
              </Typography>
              <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Data</TableCell>
                      <TableCell align="right">Produtos</TableCell>
                      <TableCell align="right">Comissão</TableCell>
                      <TableCell>Situação</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.sales.map((s, i) => (
                      <TableRow key={`${s.orderNumber}-${i}`}>
                        <TableCell>{dateBr(s.createdAt)}</TableCell>
                        <TableCell align="right">{brl(s.base)}</TableCell>
                        <TableCell align="right">{brl(s.commission)}</TableCell>
                        <TableCell>
                          <Chip size="small" label={COMMISSION_STATUS_LABEL[s.status]} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.sales.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ color: "text.secondary", py: 3 }}>
                          Nenhuma venda ainda. Divulgue o seu cupom!
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                Registre suas postagens
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                Cole o link de cada post, reels ou vídeo que você fez divulgando a Mania de Mulher. Isso ajuda a equipe a acompanhar a sua divulgação.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField size="small" fullWidth placeholder="https://instagram.com/p/..." value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
                <Button variant="contained" disabled={!postUrl.trim() || postMutation.isPending} onClick={() => postMutation.mutate()}>
                  Registrar
                </Button>
              </Stack>
              {postError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {postError}
                </Alert>
              )}
              <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                {data.posts.map((p) => (
                  <Typography key={p.id} variant="caption" noWrap>
                    {dateBr(p.createdAt)} ·{" "}
                    <Link href={p.url} target="_blank" rel="noreferrer">
                      {p.url}
                    </Link>
                  </Typography>
                ))}
              </Stack>
            </Box>

            <Typography variant="caption" color="text.secondary">
              A comissão é sobre o valor dos produtos (sem frete) de pedidos pagos. Fica liberada {data.holdDays} dias depois do pedido; pedidos cancelados ou devolvidos não geram comissão, e compras feitas por você mesma com o seu cupom não contam. O pagamento é feito por PIX pela equipe da Mania de Mulher.
              {(data.windowStart || data.windowEnd) &&
                ` Vale para vendas ${data.windowStart ? `a partir de ${dateBr(data.windowStart)}` : ""} ${data.windowEnd ? `até ${dateBr(data.windowEnd)}` : ""}.`}
            </Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
