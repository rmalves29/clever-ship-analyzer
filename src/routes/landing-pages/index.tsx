import { createFileRoute, createLink, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, CheckCircle2, Copy, ExternalLink, Eye, FileText, Files, MessageSquare, Plus, Star, Trash2, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { BarChart } from "@mui/x-charts/BarChart";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { z } from "zod";
import {
  listLandingPages,
  saveLandingPage,
  toggleLandingPageStatus,
  deleteLandingPage,
  duplicateLandingPage,
  listLandingPageLeads,
  getLandingPageClicksReport,
  listLandingPageReviews,
  moderateLandingPageReview,
  deleteLandingPageReview,
  DEFAULT_LANDING_PAGE_CONTENT,
  type ClicksGranularity,
} from "@/lib/landing-pages.functions";

const VALID_TABS = ["paginas", "contatos", "comentarios", "relatorios"] as const;

export const Route = createFileRoute("/landing-pages/")({
  validateSearch: (search: Record<string, unknown>) => z.object({
    tab: z.enum(VALID_TABS).catch("paginas"),
  }).parse(search),
  head: () => ({
    meta: [
      { title: "Landing Pages | CRM Insights" },
      { name: "description", content: "Crie landing pages para campanhas de anúncios, reutilizando um layout pronto e editável." },
    ],
  }),
  component: LandingPagesIndex,
});

const LinkTypography = createLink(Typography);
const LinkIconButton = createLink(IconButton);

function PagesTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runList = useServerFn(listLandingPages);
  const runSave = useServerFn(saveLandingPage);
  const runToggle = useServerFn(toggleLandingPageStatus);
  const runDelete = useServerFn(deleteLandingPage);
  const runDuplicate = useServerFn(duplicateLandingPage);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: pages, isLoading, refetch } = useQuery({
    queryKey: ["landing-pages"],
    queryFn: () => runList(),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const suffix = Math.random().toString(36).slice(2, 6);
      return runSave({
        data: {
          slug: `nova-landing-${suffix}`,
          nome: "Nova landing page",
          status: "rascunho",
          conteudo: DEFAULT_LANDING_PAGE_CONTENT,
        },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["landing-pages"] });
      navigate({ to: "/landing-pages/$id", params: { id: res.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar landing page."),
  });

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/lp/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  };

  const handleToggle = async (id: string, publish: boolean) => {
    setBusyId(id);
    try {
      await runToggle({ data: { id, status: publish ? "publicada" : "rascunho" } });
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setBusyId(id);
    try {
      const res = await runDuplicate({ data: { id } });
      toast.success("Landing page duplicada.");
      queryClient.invalidateQueries({ queryKey: ["landing-pages"] });
      navigate({ to: "/landing-pages/$id", params: { id: res.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao duplicar.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!window.confirm(`Excluir a landing page "${nome}"?`)) return;
    setBusyId(id);
    try {
      await runDelete({ data: { id } });
      toast.success("Landing page excluída.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "flex-end", mb: 2 }}>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          Nova landing page
        </Button>
      </Stack>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">Carregando...</Typography>
      ) : !pages || pages.length === 0 ? (
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 6, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 600 }}>Nenhuma landing page criada ainda.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Crie a primeira e use o link no seu anúncio do Facebook Ads.
          </Typography>
          <Button variant="contained" startIcon={<Plus size={16} />} sx={{ mt: 2 }} onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            Nova landing page
          </Button>
        </Box>
      ) : (
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Landing page</TableCell>
                <TableCell>Link</TableCell>
                <TableCell align="center">Publicada</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pages.map((p: any) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <LinkTypography
                      to="/landing-pages/$id"
                      params={{ id: p.id }}
                      sx={{ fontWeight: 600, textDecoration: "none", color: "text.primary", "&:hover": { textDecoration: "underline" } }}
                    >
                      {p.nome}
                    </LinkTypography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>/lp/{p.slug}</Typography>
                      <IconButton size="small" onClick={() => copyLink(p.slug)} title="Copiar link"><Copy size={14} /></IconButton>
                      <IconButton size="small" component="a" href={`/lp/${p.slug}`} target="_blank" title="Abrir página"><ExternalLink size={14} /></IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
                      <Switch checked={p.status === "publicada"} disabled={busyId === p.id} onChange={(e) => handleToggle(p.id, e.target.checked)} />
                      <Chip size="small" variant="outlined" color={p.status === "publicada" ? "success" : "default"} label={p.status === "publicada" ? "Publicada" : "Rascunho"} />
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <LinkIconButton size="small" to="/landing-pages/$id" params={{ id: p.id }} title="Editar">
                        <Eye size={16} />
                      </LinkIconButton>
                      <IconButton size="small" disabled={busyId === p.id} onClick={() => handleDuplicate(p.id)} title="Duplicar">
                        <Files size={16} />
                      </IconButton>
                      <IconButton size="small" color="error" disabled={busyId === p.id} onClick={() => handleDelete(p.id, p.nome)} title="Excluir">
                        <Trash2 size={16} />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function ContactsTab() {
  const runList = useServerFn(listLandingPageLeads);
  const runPages = useServerFn(listLandingPages);
  const [landingPageId, setLandingPageId] = useState<string>("todas");

  const { data: pages } = useQuery({ queryKey: ["landing-pages"], queryFn: () => runPages() });
  const { data: leads, isLoading } = useQuery({
    queryKey: ["landing-page-leads", landingPageId],
    queryFn: () => runList({ data: { landingPageId: landingPageId === "todas" ? undefined : landingPageId } }),
  });

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Landing page" value={landingPageId} onChange={(e) => setLandingPageId(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="todas">Todas</MenuItem>
          {(pages ?? []).map((p: any) => (
            <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>
          ))}
        </TextField>
      </Stack>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">Carregando...</Typography>
      ) : !leads || leads.length === 0 ? (
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 6, textAlign: "center" }}>
          <Users size={40} style={{ margin: "0 auto", opacity: 0.3 }} />
          <Typography sx={{ fontWeight: 600, mt: 2 }}>Nenhum contato capturado ainda.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Assim que alguém preencher o telefone numa landing page publicada, aparece aqui.
          </Typography>
        </Box>
      ) : (
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Telefone</TableCell>
                <TableCell>Landing page</TableCell>
                <TableCell>Preenchido em</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leads.map((lead: any) => (
                <TableRow key={lead.id} hover>
                  <TableCell>{lead.phone}</TableCell>
                  <TableCell>{lead.landingPageNome}</TableCell>
                  <TableCell>{new Date(lead.criadoEm).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>
                    {lead.entrouNoGrupo ? (
                      <Chip
                        size="small"
                        color="success"
                        variant="outlined"
                        icon={<CheckCircle2 size={12} />}
                        label={`Entrou · ${lead.grupoNome}`}
                      />
                    ) : (
                      <Chip size="small" variant="outlined" icon={<XCircle size={12} />} label="Não entrou" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function StarsDisplay({ value }: { value: number }) {
  return (
    <Stack direction="row" spacing={0.2}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} fill={n <= value ? "#F5A623" : "none"} color={n <= value ? "#F5A623" : "#D0D0D0"} />
      ))}
    </Stack>
  );
}

function ReviewsTab() {
  const runList = useServerFn(listLandingPageReviews);
  const runPages = useServerFn(listLandingPages);
  const runModerate = useServerFn(moderateLandingPageReview);
  const runDelete = useServerFn(deleteLandingPageReview);
  const [landingPageId, setLandingPageId] = useState<string>("todas");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: pages } = useQuery({ queryKey: ["landing-pages"], queryFn: () => runPages() });
  const { data: reviews, isLoading, refetch } = useQuery({
    queryKey: ["landing-page-reviews", landingPageId],
    queryFn: () => runList({ data: { landingPageId: landingPageId === "todas" ? undefined : landingPageId } }),
  });

  const handleModerate = async (id: string, aprovado: boolean) => {
    setBusyId(id);
    try {
      await runModerate({ data: { id, aprovado } });
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir este comentário?")) return;
    setBusyId(id);
    try {
      await runDelete({ data: { id } });
      toast.success("Comentário excluído.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Landing page" value={landingPageId} onChange={(e) => setLandingPageId(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="todas">Todas</MenuItem>
          {(pages ?? []).map((p: any) => (
            <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>
          ))}
        </TextField>
      </Stack>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">Carregando...</Typography>
      ) : !reviews || reviews.length === 0 ? (
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 6, textAlign: "center" }}>
          <MessageSquare size={40} style={{ margin: "0 auto", opacity: 0.3 }} />
          <Typography sx={{ fontWeight: 600, mt: 2 }}>Nenhum comentário enviado ainda.</Typography>
        </Box>
      ) : (
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Comentário</TableCell>
                <TableCell>Nota</TableCell>
                <TableCell>Landing page</TableCell>
                <TableCell>Enviado em</TableCell>
                <TableCell align="center">Aprovado</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reviews.map((r: any) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>{r.texto}</TableCell>
                  <TableCell><StarsDisplay value={r.estrelas} /></TableCell>
                  <TableCell>{r.landingPageNome}</TableCell>
                  <TableCell>{new Date(r.criadoEm).toLocaleString("pt-BR")}</TableCell>
                  <TableCell align="center">
                    <Switch checked={r.aprovado} disabled={busyId === r.id} onChange={(e) => handleModerate(r.id, e.target.checked)} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="error" disabled={busyId === r.id} onClick={() => handleDelete(r.id)} title="Excluir">
                      <Trash2 size={16} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function ReportsTab() {
  const runReport = useServerFn(getLandingPageClicksReport);
  const runPages = useServerFn(listLandingPages);
  const [landingPageId, setLandingPageId] = useState<string>("todas");
  const [granularity, setGranularity] = useState<ClicksGranularity>("day");

  const { data: pages } = useQuery({ queryKey: ["landing-pages"], queryFn: () => runPages() });
  const { data: report, isLoading } = useQuery({
    queryKey: ["landing-page-clicks-report", landingPageId, granularity],
    queryFn: () => runReport({ data: { landingPageId: landingPageId === "todas" ? undefined : landingPageId, granularity } }),
  });

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: "wrap" }}>
        <TextField select size="small" label="Landing page" value={landingPageId} onChange={(e) => setLandingPageId(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="todas">Todas</MenuItem>
          {(pages ?? []).map((p: any) => (
            <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Agrupar por" value={granularity} onChange={(e) => setGranularity(e.target.value as ClicksGranularity)} sx={{ minWidth: 160 }}>
          <MenuItem value="day">Dia</MenuItem>
          <MenuItem value="month">Mês</MenuItem>
          <MenuItem value="year">Ano</MenuItem>
        </TextField>
      </Stack>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">Carregando...</Typography>
      ) : !report || report.total === 0 ? (
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 6, textAlign: "center" }}>
          <BarChart3 size={40} style={{ margin: "0 auto", opacity: 0.3 }} />
          <Typography sx={{ fontWeight: 600, mt: 2 }}>Nenhum clique registrado ainda.</Typography>
        </Box>
      ) : (
        <Stack spacing={3}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
              Cliques no CTA ({report.total} no total)
            </Typography>
            <BarChart
              height={280}
              xAxis={[{ data: report.timeline.map((t) => t.bucket), scaleType: "band" }]}
              series={[{ data: report.timeline.map((t) => t.total) }]}
            />
          </Box>

          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, p: 2, pb: 0 }}>Consolidado por landing page</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Landing page</TableCell>
                    <TableCell align="right">Cliques</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.porLandingPage.map((row) => (
                    <TableRow key={row.landingPageId} hover>
                      <TableCell>{row.nome}</TableCell>
                      <TableCell align="right">{row.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Stack>
      )}
    </Box>
  );
}

function LandingPagesIndex() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/landing-pages", search: { tab: value as (typeof VALID_TABS)[number] } });

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 4,
              background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              color: "primary.contrastText",
            }}
          >
            <FileText size={20} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Landing Pages</Typography>
            <Typography variant="body2" color="text.secondary">Páginas para campanhas de anúncios, com layout pronto e conteúdo editável.</Typography>
          </Box>
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab value="paginas" label="Páginas" />
        <Tab value="contatos" label="Contatos" />
        <Tab value="comentarios" label="Comentários" />
        <Tab value="relatorios" label="Relatórios" />
      </Tabs>

      {tab === "paginas" && <PagesTab />}
      {tab === "contatos" && <ContactsTab />}
      {tab === "comentarios" && <ReviewsTab />}
      {tab === "relatorios" && <ReportsTab />}
    </Box>
  );
}
