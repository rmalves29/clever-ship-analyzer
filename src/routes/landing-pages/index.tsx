import { createFileRoute, createLink, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, CheckCircle2, ChevronDown, Copy, ExternalLink, Eye, FileText, Files, Lightbulb, MessageSquare, Plus, Send, Star, Target, Trash2, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
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
import { AutomationDialog, type AutomationSeed } from "@/components/crm/AutomationDialog";
import {
  listLandingPages,
  saveLandingPage,
  toggleLandingPageStatus,
  deleteLandingPage,
  duplicateLandingPage,
  listLandingPageLeads,
  getLandingPageFunnelReport,
  getLandingPageRecoverySetup,
  listLandingPageReviews,
  moderateLandingPageReview,
  deleteLandingPageReview,
  DEFAULT_LANDING_PAGE_CONTENT,
  type LandingPageReportPeriod,
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
  const queryClient = useQueryClient();
  const [landingPageId, setLandingPageId] = useState<string>("todas");

  const { data: pages } = useQuery({ queryKey: ["landing-pages"], queryFn: () => runPages() });
  const { data: leads, isLoading } = useQuery({
    queryKey: ["landing-page-leads", landingPageId],
    queryFn: () => runList({ data: { landingPageId: landingPageId === "todas" ? undefined : landingPageId } }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
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

type FunnelStage = {
  label: string;
  description: string;
  value: number;
  icon: ReactNode;
  gradient: string;
  softColor: string;
  accent: string;
};

function LandingPageFunnel({
  visits,
  submissions,
  clicks,
  joins,
  abandoned,
  accessToJoinRate,
}: {
  visits: number;
  submissions: number;
  clicks: number;
  joins: number;
  abandoned: number;
  accessToJoinRate: number;
}) {
  const percentage = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const rate = (value: number, total: number) => total > 0 ? (value / total) * 100 : 0;
  const stages: FunnelStage[] = [
    {
      label: "Acessaram a landing page",
      description: "Pessoas únicas que visitaram a página.",
      value: visits,
      icon: <Eye size={20} />,
      gradient: "linear-gradient(110deg, #4977f4 0%, #315ee9 100%)",
      softColor: "rgba(49, 94, 233, 0.07)",
      accent: "#315ee9",
    },
    {
      label: "Preencheram o formulário",
      description: "Contatos capturados com sucesso.",
      value: submissions,
      icon: <FileText size={20} />,
      gradient: "linear-gradient(110deg, #8b6de9 0%, #6934cf 100%)",
      softColor: "rgba(105, 52, 207, 0.07)",
      accent: "#6934cf",
    },
    {
      label: "Clicaram no link",
      description: "Cliques registrados no botão da página.",
      value: clicks,
      icon: <ExternalLink size={20} />,
      gradient: "linear-gradient(110deg, #df63bb 0%, #ca238d 100%)",
      softColor: "rgba(202, 35, 141, 0.07)",
      accent: "#ca238d",
    },
    {
      label: "Entraram no grupo",
      description: "Conversões confirmadas no grupo selecionado.",
      value: joins,
      icon: <Users size={20} />,
      gradient: "linear-gradient(110deg, #52cba7 0%, #079a70 100%)",
      softColor: "rgba(7, 154, 112, 0.07)",
      accent: "#079a70",
    },
  ];

  const overview = [
    { label: "Total de visitantes", value: visits, detail: "100% da base", stage: stages[0]! },
    { label: "Leads capturados", value: submissions, detail: `${percentage(rate(submissions, visits))} dos visitantes`, stage: stages[1]! },
    { label: "Cliques no link", value: clicks, detail: `${percentage(rate(clicks, submissions))} dos leads`, stage: stages[2]! },
    { label: "Entraram no grupo", value: joins, detail: `${percentage(rate(joins, clicks))} dos cliques`, stage: stages[3]! },
  ];

  return (
    <Box
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 4,
        background: "linear-gradient(145deg, rgba(238,244,255,0.9) 0%, rgba(255,255,255,0.95) 42%, rgba(247,249,255,0.9) 100%)",
        border: "1px solid rgba(148, 163, 184, 0.16)",
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2.5 }}>
        <Box sx={{ width: 46, height: 46, borderRadius: 2.5, display: "grid", placeItems: "center", color: "#315ee9", bgcolor: "rgba(49,94,233,0.1)" }}>
          <BarChart3 size={22} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>Funil de conversão</Typography>
          <Typography variant="caption" color="text.secondary">
            Veja quantas pessoas avançaram desde o acesso à landing page até a entrada no grupo.
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 2.1fr) minmax(330px, 1fr)" } }}>
        <Stack spacing={2}>
          <Box sx={{ p: { xs: 1.25, md: 2 }, borderRadius: 3, bgcolor: "rgba(255,255,255,0.82)", border: "1px solid rgba(148,163,184,0.15)" }}>
            {stages.map((stage, index) => {
              const nextValue = stages[index + 1]?.value;
              const conversion = nextValue === undefined ? null : rate(nextValue, stage.value);
              const baseRate = index === 0 ? 100 : rate(stage.value, visits);

              return (
                <Box key={stage.label}>
                  <Box
                    sx={{
                      display: { xs: "block", md: "flex" },
                      minHeight: { xs: 132, md: 100 },
                      borderRadius: 2.5,
                      overflow: "hidden",
                      bgcolor: stage.softColor,
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: "100%", md: "78%" },
                        color: "common.white",
                        background: stage.gradient,
                        clipPath: { xs: "none", md: "polygon(0 0, 100% 0, 93% 100%, 0 100%)" },
                        px: { xs: 2, md: 2.5 },
                        py: 1.5,
                        pr: { md: 5 },
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Box sx={{ width: 48, height: 48, borderRadius: "50%", bgcolor: "rgba(255,255,255,0.76)", color: stage.accent, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        {stage.icon}
                      </Box>
                      <Box sx={{ ml: 2, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: { xs: 14, md: 15 } }}>{stage.label}</Typography>
                        <Typography sx={{ fontSize: 11.5, opacity: 0.88, mt: 0.35 }}>{stage.description}</Typography>
                      </Box>
                      <Box sx={{ ml: "auto", pl: { xs: 1.5, md: 3 }, minWidth: { xs: 92, md: 150 }, textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.38)" }}>
                        <Typography sx={{ fontWeight: 900, fontSize: { xs: 26, md: 30 }, lineHeight: 1 }}>
                          {stage.value.toLocaleString("pt-BR")}
                        </Typography>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, mt: 0.6, opacity: 0.95 }}>{percentage(baseRate)} da base</Typography>
                      </Box>
                    </Box>

                    <Box sx={{ flex: 1, px: { xs: 2, md: 2.5 }, py: { xs: 1.25, md: 1 }, display: "flex", alignItems: "center", gap: 1.25 }}>
                      <Box sx={{ width: 32, height: 32, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "rgba(255,255,255,0.72)", color: stage.accent, flexShrink: 0 }}>
                        <Users size={16} />
                      </Box>
                      <Box>
                        <Typography sx={{ color: stage.accent, fontWeight: 900, fontSize: 20, lineHeight: 1.1 }}>
                          {conversion === null ? "—" : percentage(conversion)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {conversion === null ? "última etapa" : "avançaram para o próximo passo"}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  {index < stages.length - 1 && (
                    <Box sx={{ height: 32, display: "grid", placeItems: "center", color: "text.secondary" }}>
                      <ChevronDown size={20} />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ px: 2, py: 1.5, borderRadius: 2.5, bgcolor: "rgba(49,94,233,0.06)", alignItems: { sm: "center" } }}>
            <Typography variant="body2" color="text.secondary">
              A conversão total do funil foi de <strong>{percentage(accessToJoinRate)}</strong>.
            </Typography>
            <Typography color="text.disabled" sx={{ display: { xs: "none", sm: "block" } }}>•</Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>{abandoned.toLocaleString("pt-BR")}</strong> pessoa(s) clicaram no link e ainda não entraram no grupo.
            </Typography>
          </Stack>
        </Stack>

        <Box sx={{ p: 2.25, borderRadius: 3, bgcolor: "rgba(255,255,255,0.88)", border: "1px solid rgba(148,163,184,0.22)", alignSelf: "stretch" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
            <Box sx={{ width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center", color: "#315ee9", bgcolor: "rgba(49,94,233,0.09)" }}>
              <Target size={18} />
            </Box>
            <Typography sx={{ fontWeight: 800 }}>Visão geral do funil</Typography>
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(2, minmax(0, 1fr))" }, gap: 1.25 }}>
            {overview.map((item) => (
              <Box key={item.label} sx={{ p: 1.5, minHeight: 118, borderRadius: 2.5, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: item.stage.softColor, color: item.stage.accent, flexShrink: 0 }}>
                    {item.stage.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                    <Typography sx={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15 }}>{item.value.toLocaleString("pt-BR")}</Typography>
                    <Typography sx={{ fontSize: 11, color: item.stage.accent, fontWeight: 700, mt: 0.5 }}>{item.detail}</Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Box>

          <Box sx={{ mt: 2, p: 2, borderRadius: 2.5, bgcolor: "rgba(7,154,112,0.06)" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
              <Lightbulb size={18} color="#079a70" />
              <Typography sx={{ fontWeight: 800 }}>Destaques do período</Typography>
            </Stack>
            <Stack spacing={1.25}>
              {[
                `${percentage(rate(submissions, visits))} dos visitantes preencheram o formulário.`,
                `${percentage(rate(clicks, submissions))} dos leads clicaram no link.`,
                `A conversão final para o grupo foi de ${percentage(accessToJoinRate)}.`,
              ].map((text) => (
                <Stack key={text} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                  <CheckCircle2 size={15} color="#079a70" style={{ marginTop: 2, flexShrink: 0 }} />
                  <Typography variant="caption" color="text.secondary">{text}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function ReportsTab() {
  const queryClient = useQueryClient();
  const runReport = useServerFn(getLandingPageFunnelReport);
  const runRecoverySetup = useServerFn(getLandingPageRecoverySetup);
  const runPages = useServerFn(listLandingPages);
  const [landingPageId, setLandingPageId] = useState<string>("todas");
  const [period, setPeriod] = useState<LandingPageReportPeriod>("30d");
  const [automationSeed, setAutomationSeed] = useState<AutomationSeed | null>(null);
  const [automationOpen, setAutomationOpen] = useState(false);

  const { data: pages } = useQuery({ queryKey: ["landing-pages"], queryFn: () => runPages() });
  const { data: report, isLoading } = useQuery({
    queryKey: ["landing-page-funnel-report", landingPageId, period],
    queryFn: () => runReport({ data: { landingPageId: landingPageId === "todas" ? undefined : landingPageId, period } }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
  const createRecoveryAutomation = async () => {
    if (landingPageId === "todas") return;
    const setup = await queryClient.fetchQuery({
      queryKey: ["landing-page-recovery-setup", landingPageId],
      queryFn: () => runRecoverySetup({ data: { landingPageId } }),
      staleTime: 30_000,
    });
    if (!setup?.groupId) {
      toast.error("Vincule um grupo do WhatsApp a esta landing page antes de criar a automação.");
      return;
    }
    setAutomationSeed({
      nome: `Recuperação · ${setup.nome}`,
      descricao: "Convida novamente quem clicou no link da landing page, mas ainda não entrou no grupo.",
      segmentType: "custom",
      segmentId: setup.clickedSegmentId,
      steps: [
        {
          id: `lp_recovery_${Date.now()}`,
          type: "send",
          waitMinutes: 60,
          waitValue: 60,
          waitUnit: "minutes",
          templateName: "",
          templateLanguage: "pt_BR",
          bodyParams: [],
          nextStepId: null,
        },
      ],
      requerAprovacao: false,
      ativo: true,
      revalidateSegmentBeforeSend: true,
      recoveryLandingPageId: setup.landingPageId,
    });
    setAutomationOpen(true);
  };

  const percentage = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label="Landing page" value={landingPageId} onChange={(e) => setLandingPageId(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="todas">Todas</MenuItem>
          {(pages ?? []).map((p: any) => (
            <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Período" value={period} onChange={(e) => setPeriod(e.target.value as LandingPageReportPeriod)} sx={{ minWidth: 160 }}>
          <MenuItem value="7d">Últimos 7 dias</MenuItem>
          <MenuItem value="30d">Últimos 30 dias</MenuItem>
          <MenuItem value="90d">Últimos 90 dias</MenuItem>
          <MenuItem value="all">Todo o período</MenuItem>
        </TextField>
        {landingPageId !== "todas" && (
          <Button variant="contained" startIcon={<Send size={16} />} onClick={createRecoveryAutomation}>
            Criar automação de recuperação
          </Button>
        )}
      </Stack>

      {landingPageId !== "todas" && (report?.pagesWithoutGroup?.length ?? 0) > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Esta landing page ainda não tem um grupo do WhatsApp vinculado. Selecione o grupo no editor para medir entradas e ativar a recuperação.
        </Alert>
      )}

      {landingPageId !== "todas" && report?.porLandingPage?.[0]?.groupId && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Grupo contabilizado nesta landing page: <strong>{report.porLandingPage[0].groupName ?? report.porLandingPage[0].groupId}</strong>.
          Somente entradas deste grupo são cruzadas com os contatos capturados pela página.
        </Alert>
      )}

      {!isLoading && report?.diagnostics && (!report.diagnostics.eventStoreAvailable || !report.diagnostics.groupEnrichmentAvailable) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {!report.diagnostics.eventStoreAvailable
            ? "O histórico de eventos da landing ainda não está disponível. O relatório está usando os contatos capturados como fallback."
            : "Os dados de entradas no grupo do WhatsApp estão temporariamente indisponíveis. Acessos e cliques continuam sendo exibidos."}
        </Alert>
      )}

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">Carregando...</Typography>
      ) : !report || (report.totals.visits === 0 && report.totals.submissions === 0 && report.totals.clicks === 0 && report.totals.joins === 0) ? (
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 6, textAlign: "center" }}>
          <BarChart3 size={40} style={{ margin: "0 auto", opacity: 0.3 }} />
          <Typography sx={{ fontWeight: 600, mt: 2 }}>Nenhuma atividade registrada neste período.</Typography>
        </Box>
      ) : (
        <Stack spacing={3}>
          <LandingPageFunnel
            visits={report.totals.visits}
            submissions={report.totals.submissions}
            clicks={report.totals.clicks}
            joins={report.totals.joins}
            abandoned={report.totals.abandoned}
            accessToJoinRate={report.totals.accessToJoinRate}
          />

          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, p: 2, pb: 0 }}>Consolidado por landing page</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Landing page</TableCell>
                    <TableCell>Grupo contabilizado</TableCell>
                    <TableCell align="right">Acessos</TableCell>
                    <TableCell align="right">Cadastros</TableCell>
                    <TableCell align="right">Cliques</TableCell>
                    <TableCell align="right">Entradas</TableCell>
                    <TableCell align="right">Não entraram</TableCell>
                    <TableCell align="right">Clique → grupo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.porLandingPage.map((row) => (
                    <TableRow key={row.landingPageId} hover>
                      <TableCell>{row.nome}</TableCell>
                      <TableCell>{row.groupName ?? "Não configurado"}</TableCell>
                      <TableCell align="right">{row.visits}</TableCell>
                      <TableCell align="right">{row.submissions}</TableCell>
                      <TableCell align="right">{row.clicks}</TableCell>
                      <TableCell align="right">{row.joins}</TableCell>
                      <TableCell align="right">{row.abandoned}</TableCell>
                      <TableCell align="right">{percentage(row.clickToJoinRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
            <Box sx={{ p: 2, pb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Entradas recentes nos grupos contabilizados</Typography>
              <Typography variant="caption" color="text.secondary">
                Eventos do Fluxo de Envio cruzados pelo telefone com os contatos que clicaram na landing page.
              </Typography>
            </Box>
            {!report.recentGroupEntries || report.recentGroupEntries.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
                Nenhuma entrada encontrada para o grupo e período selecionados.
              </Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 440 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Telefone</TableCell>
                      <TableCell>Landing page</TableCell>
                      <TableCell>Grupo</TableCell>
                      <TableCell>Identificação</TableCell>
                      <TableCell>Data</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.recentGroupEntries.map((entry, index) => (
                      <TableRow key={`${entry.landingPageId}-${entry.phone}-${entry.joinedAt}-${index}`} hover>
                        <TableCell>{entry.phone}</TableCell>
                        <TableCell>{entry.landingPageName}</TableCell>
                        <TableCell>{entry.groupName}</TableCell>
                        <TableCell>
                          {entry.isLandingContact ? (
                            <Chip size="small" color="success" variant="outlined" icon={<CheckCircle2 size={12} />} label="Contato da landing" />
                          ) : (
                            <Chip size="small" variant="outlined" label="Não identificado na landing" />
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.detectionSource === "current_member"
                            ? "Presente no grupo agora"
                            : new Date(entry.joinedAt).toLocaleString("pt-BR")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Stack>
      )}
      <AutomationDialog
        seed={automationSeed}
        open={automationOpen}
        onOpenChange={setAutomationOpen}
        onSaved={() => toast.success("Automação de recuperação salva.")}
      />
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
