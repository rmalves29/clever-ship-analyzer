import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
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
import {
  approveAffiliateFn,
  listAffiliatePostsFn,
  listAffiliatesFn,
  retryAffiliateCouponFn,
  setAffiliateStatusFn,
  updateAffiliateFn,
} from "@/lib/affiliates.functions";
import { affiliateShortLink } from "@/lib/affiliate-commission";
import { brl, dateBr, formatWhatsapp, whatsappLink } from "./format";

type Row = Awaited<ReturnType<typeof listAffiliatesFn>>["affiliates"][number];

const STATUS: Record<Row["status"], { label: string; color: "default" | "success" | "warning" | "error" }> = {
  pending: { label: "Aguardando aprovação", color: "warning" },
  approved: { label: "Aprovada", color: "success" },
  rejected: { label: "Recusada", color: "default" },
  blocked: { label: "Bloqueada", color: "error" },
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card variant="outlined" sx={{ textAlign: "center" }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

const handleLink = (network: "instagram" | "tiktok", handle: string) =>
  network === "instagram" ? `https://instagram.com/${handle}` : `https://tiktok.com/@${handle}`;

export function AffiliatesManager() {
  const queryClient = useQueryClient();
  const list = useServerFn(listAffiliatesFn);
  const approve = useServerFn(approveAffiliateFn);
  const retry = useServerFn(retryAffiliateCouponFn);
  const setStatus = useServerFn(setAffiliateStatusFn);
  const update = useServerFn(updateAffiliateFn);
  const listPosts = useServerFn(listAffiliatePostsFn);

  const { data, isLoading, error } = useQuery({ queryKey: ["affiliates"], queryFn: () => list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["affiliates"] });

  const [filter, setFilter] = useState<"all" | Row["status"]>("all");
  const rows = useMemo(() => (data?.affiliates ?? []).filter((a) => filter === "all" || a.status === filter), [data, filter]);

  const [approving, setApproving] = useState<Row | null>(null);
  const [approveCommission, setApproveCommission] = useState("15");
  const [approveDiscount, setApproveDiscount] = useState("5");
  const [approveCode, setApproveCode] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ name: "", email: "", instagram: "", tiktok: "", pixKey: "", commissionPct: "15", notes: "" });

  const openApprove = (a: Row) => {
    setApproving(a);
    setApproveCommission(String(a.commissionPct));
    setApproveDiscount(String(a.discountPct));
    setApproveCode(a.code ?? "");
  };
  const openEdit = (a: Row) => {
    setEditing(a);
    setForm({
      name: a.name,
      email: a.email ?? "",
      instagram: a.instagram ?? "",
      tiktok: a.tiktok ?? "",
      pixKey: a.pixKey ?? "",
      commissionPct: String(a.commissionPct),
      notes: a.notes ?? "",
    });
  };

  const approveMutation = useMutation({
    mutationFn: () =>
      approve({
        data: {
          id: approving!.id,
          commissionPct: Number(approveCommission.replace(",", ".")),
          discountPct: Number(approveDiscount.replace(",", ".")),
          code: approveCode.trim() || null,
        },
      }),
    onSuccess: (result) => {
      if (result.couponCreated) toast.success(`Afiliada aprovada. Cupom ${result.code} criado na Shopify.`);
      else toast.warning(`Afiliada aprovada com o cupom ${result.code}, mas a Shopify não criou o cupom: ${result.shopifyError ?? "erro desconhecido"}. Use "Criar cupom de novo".`);
      setApproving(null);
      void refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível aprovar."),
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: "pending" | "rejected" | "blocked" }) => setStatus({ data: v }),
    onSuccess: () => void refresh(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível alterar."),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: (r) => {
      if (r.success) toast.success("Cupom criado na Shopify.");
      else toast.error(`A Shopify recusou: ${r.error}`);
      void refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar o cupom."),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      update({
        data: {
          id: editing!.id,
          name: form.name,
          email: form.email.trim() || null,
          instagram: form.instagram.trim() || null,
          tiktok: form.tiktok.trim() || null,
          pixKey: form.pixKey.trim() || null,
          commissionPct: Number(form.commissionPct.replace(",", ".")),
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Dados salvos.");
      setEditing(null);
      void refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const posts = useQuery({
    queryKey: ["affiliate-posts", editing?.id],
    queryFn: () => listPosts({ data: { id: editing!.id } }),
    enabled: Boolean(editing),
  });

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiado.`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const portalUrl = (a: Row) => `${window.location.origin}/afiliada/${a.accessToken}`;
  const welcomeText = (a: Row) =>
    `Oi, ${a.name.split(" ")[0]}! Seu cadastro no programa de afiliadas da Mania de Mulher foi aprovado 🎉\n\n` +
    `Seu cupom exclusivo: *${a.code}*\n` +
    (a.code ? `Seu link: ${affiliateShortLink(window.location.origin, a.code)}\n` : "") +
    `\nAcompanhe suas vendas e comissões no seu painel: ${portalUrl(a)}`;

  if (isLoading) return <Typography sx={{ p: 3 }} color="text.secondary">Carregando…</Typography>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error instanceof Error ? error.message : "Erro ao carregar."}</Alert>;
  const summary = data!.summary;
  const signupUrl = `${window.location.origin}/seja-afiliada`;

  return (
    <Stack spacing={2.5} sx={{ py: 2 }}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, sm: 3 }}><StatCard label="Afiliadas aprovadas" value={summary.approved} /></Grid>
        <Grid size={{ xs: 6, sm: 3 }}><StatCard label="Aguardando aprovação" value={summary.pending} /></Grid>
        <Grid size={{ xs: 6, sm: 3 }}><StatCard label="Pedidos com cupom" value={summary.orders} /></Grid>
        <Grid size={{ xs: 6, sm: 3 }}><StatCard label="Vendas (produtos)" value={brl(summary.revenue)} /></Grid>
        <Grid size={{ xs: 6, sm: 4 }}><StatCard label="Comissão em carência" value={brl(summary.commissionPending)} /></Grid>
        <Grid size={{ xs: 6, sm: 4 }}><StatCard label="Comissão a pagar" value={brl(summary.commissionApproved)} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard label="Comissão já paga" value={brl(summary.commissionPaid)} /></Grid>
      </Grid>

      <Alert severity="info" action={<Button size="small" onClick={() => copy(signupUrl, "Link de cadastro")}>Copiar link</Button>}>
        Link para as interessadas se cadastrarem: <b>{signupUrl}</b>
      </Alert>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        {([["all", "Todas"], ["pending", "Aguardando"], ["approved", "Aprovadas"], ["rejected", "Recusadas"], ["blocked", "Bloqueadas"]] as const).map(([value, label]) => (
          <Button key={value} size="small" variant={filter === value ? "contained" : "outlined"} onClick={() => setFilter(value)}>
            {label}
          </Button>
        ))}
      </Stack>

      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Afiliada</TableCell>
              <TableCell>Redes</TableCell>
              <TableCell>Cupom</TableCell>
              <TableCell align="right">Pedidos</TableCell>
              <TableCell align="right">Vendas</TableCell>
              <TableCell align="right">Comissão</TableCell>
              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.name}</Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {formatWhatsapp(a.whatsapp)} · cadastro em {dateBr(a.createdAt)}
                  </Typography>
                  <Chip size="small" label={STATUS[a.status].label} color={STATUS[a.status].color} sx={{ mt: 0.5 }} />
                  {a.campaignName && (
                    <Typography variant="caption" color="text.secondary" component="div">
                      Campanha: {a.campaignName}
                    </Typography>
                  )}
                  {a.adsAuthorizationAt && (
                    <Typography variant="caption" color="text.secondary" component="div" title="Autorização de uso dos vídeos em anúncios aceita no cadastro">
                      Autoriza uso em Ads por {a.adsAuthorizationDays} dias (aceite em {dateBr(a.adsAuthorizationAt)})
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {a.instagram && <Link href={handleLink("instagram", a.instagram)} target="_blank" rel="noreferrer" variant="caption" sx={{ display: "block" }}>@{a.instagram} (Instagram)</Link>}
                  {a.tiktok && <Link href={handleLink("tiktok", a.tiktok)} target="_blank" rel="noreferrer" variant="caption" sx={{ display: "block" }}>@{a.tiktok} (TikTok)</Link>}
                </TableCell>
                <TableCell>
                  {a.code ? (
                    <>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: "monospace" }}>{a.code}</Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {a.discountPct}% p/ cliente · {a.commissionPct}% comissão
                      </Typography>
                      {a.shopifyError && !a.shopifyDiscountId && (
                        <Typography variant="caption" color="error" component="div" title={a.shopifyError}>
                          Cupom não criado na Shopify
                        </Typography>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell align="right">
                  {a.orders}
                  {a.status === "approved" && (
                    <Typography variant="caption" color="text.secondary" component="div" title="Cliques no link curto (total · últimos 7 dias)">
                      {a.clicks} cliques ({a.clicks7d} em 7d)
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">{brl(a.revenue)}</TableCell>
                <TableCell align="right">
                  <Typography variant="caption" component="div">carência {brl(a.commissionPending)}</Typography>
                  <Typography variant="caption" component="div" sx={{ fontWeight: 600 }}>a pagar {brl(a.commissionApproved)}</Typography>
                  <Typography variant="caption" color="text.secondary" component="div">paga {brl(a.commissionPaid)}</Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {(a.status === "pending" || a.status === "rejected") && (
                      <Button size="small" variant="contained" onClick={() => openApprove(a)}>Aprovar</Button>
                    )}
                    {a.status === "pending" && (
                      <Button size="small" variant="outlined" color="inherit" onClick={() => statusMutation.mutate({ id: a.id, status: "rejected" })}>Recusar</Button>
                    )}
                    {a.status === "approved" && a.code && (
                      <>
                        <Button size="small" variant="outlined" onClick={() => copy(a.code!, "Cupom")}>Copiar cupom</Button>
                        <Button size="small" variant="outlined" onClick={() => copy(affiliateShortLink(window.location.origin, a.code!), "Link")}>Copiar link</Button>
                        <Button size="small" variant="outlined" onClick={() => copy(portalUrl(a), "Link do painel")}>Link do painel</Button>
                        <Button size="small" variant="outlined" component="a" href={whatsappLink(a.whatsapp, welcomeText(a))} target="_blank" rel="noreferrer">Enviar no WhatsApp</Button>
                        {a.shopifyError && !a.shopifyDiscountId && (
                          <Button size="small" color="warning" variant="outlined" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate(a.id)}>Criar cupom de novo</Button>
                        )}
                      </>
                    )}
                    <Button size="small" variant="text" onClick={() => openEdit(a)}>Editar</Button>
                    {a.status === "approved" && (
                      <Button size="small" variant="text" color="error" onClick={() => statusMutation.mutate({ id: a.id, status: "blocked" })}>Bloquear</Button>
                    )}
                    {a.status === "blocked" && (
                      <Button size="small" variant="text" onClick={() => openApprove(a)}>Reativar</Button>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: "text.secondary", py: 4 }}>
                  Nenhuma afiliada nesse filtro. Compartilhe o link de cadastro acima.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(approving)} onClose={() => setApproving(null)} fullWidth maxWidth="xs">
        <DialogTitle>Aprovar {approving?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Vamos criar um cupom exclusivo na Shopify. Quem usar o cupom ganha o desconto abaixo, e a venda fica ligada a essa afiliada.
            </Typography>
            <TextField label="Comissão da afiliada (%)" value={approveCommission} onChange={(e) => setApproveCommission(e.target.value)} size="small" />
            <TextField
              label="Desconto para o cliente (%)"
              value={approveDiscount}
              onChange={(e) => setApproveDiscount(e.target.value)}
              size="small"
              disabled={Boolean(approving?.shopifyDiscountId)}
              helperText="A Shopify exige no mínimo 1%. Não muda depois que o cupom é criado."
            />
            <TextField
              label="Código do cupom (opcional)"
              value={approveCode}
              onChange={(e) => setApproveCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              size="small"
              disabled={Boolean(approving?.code)}
              helperText="Em branco = gerado a partir do primeiro nome (ex.: ANA)."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproving(null)}>Cancelar</Button>
          <Button variant="contained" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
            {approveMutation.isPending ? "Criando cupom…" : "Aprovar e criar cupom"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>Editar {editing?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Nome" size="small" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField label="E-mail" size="small" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Stack direction="row" spacing={1.5}>
              <TextField label="Instagram (sem @)" size="small" fullWidth value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
              <TextField label="TikTok (sem @)" size="small" fullWidth value={form.tiktok} onChange={(e) => setForm({ ...form, tiktok: e.target.value })} />
            </Stack>
            <TextField label="Chave PIX" size="small" value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} />
            <TextField label="Comissão (%)" size="small" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} helperText="Vale para todos os pedidos ainda não pagos dessa afiliada." />
            <TextField label="Observações internas" size="small" multiline minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Postagens que ela registrou</Typography>
              {posts.isLoading && <Typography variant="caption" color="text.secondary">Carregando…</Typography>}
              {(posts.data ?? []).map((p) => (
                <Typography key={p.id} variant="caption" component="div" noWrap>
                  {dateBr(p.createdAt)} · <Link href={p.url} target="_blank" rel="noreferrer">{p.url}</Link>
                </Typography>
              ))}
              {posts.data && posts.data.length === 0 && <Typography variant="caption" color="text.secondary">Nenhuma ainda.</Typography>}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="contained" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
