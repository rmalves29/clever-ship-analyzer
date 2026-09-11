import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCw,
  Users,
  Grid3x3,
  Eye,
  Heart,
  UserCheck,
  MousePointerClick,
  Image as ImageIcon,
  Sparkles,
  MessageCircle,
  Share2,
  Bookmark,
} from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";
import { getInstagramConnectionStatus, connectInstagram, getInstagramOverview, getInstagramAudience, getInstagramTopContent } from "@/lib/instagram.functions";
import { getLatestInstagramAnalysis, generateInstagramAnalysis } from "@/lib/instagram-ai.functions";
import type { InstagramDatePreset } from "@/lib/instagram.server";

export const Route = createFileRoute("/instagram")({
  component: InstagramPage,
  head: () => ({
    meta: [
      { title: "Instagram | Performance" },
      { name: "description", content: "Insights reais da conta do Instagram — alcance, engajamento, público e conteúdo." },
    ],
  }),
});

const DATE_PRESETS: { value: InstagramDatePreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_7d", label: "7 dias" },
  { value: "last_14d", label: "14 dias" },
  { value: "last_30d", label: "30 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
];

const TONE_COLOR: Record<string, ChipProps["color"]> = {
  positivo: "success",
  atencao: "warning",
  critico: "error",
};

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.secondary" }}>
          <Icon size={14} />
          <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {label}
          </Typography>
        </Stack>
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function BarRow({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {value.toLocaleString("pt-BR")} <Box component="span" sx={{ fontSize: 11 }}>({(pct * 100).toFixed(1)}%)</Box>
        </Typography>
      </Stack>
      <Box sx={{ mt: 0.5, height: 8, borderRadius: 999, bgcolor: "action.hover" }}>
        <Box sx={{ height: 8, borderRadius: 999, bgcolor: "primary.main", width: `${Math.max(2, pct * 100)}%` }} />
      </Box>
    </Box>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      {children}
    </Card>
  );
}

function InstagramPage() {
  const [view, setView] = useState<"geral" | "conteudo" | "publico" | "ia">("geral");
  const [datePreset, setDatePreset] = useState<InstagramDatePreset>("last_7d");
  const runStatus = useServerFn(getInstagramConnectionStatus);
  const runConnect = useServerFn(connectInstagram);
  const runOverview = useServerFn(getInstagramOverview);
  const runAudience = useServerFn(getInstagramAudience);
  const runTopContent = useServerFn(getInstagramTopContent);
  const runLatestAnalysis = useServerFn(getLatestInstagramAnalysis);
  const runGenerateAnalysis = useServerFn(generateInstagramAnalysis);

  const { data: connection, isLoading: loadingConnection, refetch: refetchStatus } = useQuery({
    queryKey: ["instagram-connection"],
    queryFn: () => runStatus(),
  });

  const { data: overviewResult, isLoading: loadingOverview, refetch: refetchOverview } = useQuery({
    queryKey: ["instagram-overview", datePreset],
    queryFn: () => runOverview({ data: { datePreset } }),
    enabled: Boolean(connection?.connected) && view === "geral",
  });

  const { data: audienceResult, isLoading: loadingAudience } = useQuery({
    queryKey: ["instagram-audience"],
    queryFn: () => runAudience(),
    enabled: Boolean(connection?.connected) && view === "publico",
  });

  const { data: topContentResult, isLoading: loadingTopContent } = useQuery({
    queryKey: ["instagram-top-content", datePreset],
    queryFn: () => runTopContent({ data: { datePreset } }),
    enabled: Boolean(connection?.connected) && (view === "conteudo" || view === "geral"),
  });

  const { data: latestAnalysis, refetch: refetchAnalysis } = useQuery({
    queryKey: ["instagram-analysis"],
    queryFn: () => runLatestAnalysis(),
    enabled: Boolean(connection?.connected) && view === "ia",
  });

  const [generating, setGenerating] = useState(false);
  const handleGenerateAnalysis = async () => {
    setGenerating(true);
    try {
      const res = await runGenerateAnalysis({ data: { datePreset } });
      if (!res.success) {
        toast.error(res.error || "Falha ao gerar análise.");
        return;
      }
      toast.success("Análise gerada.");
      refetchAnalysis();
    } finally {
      setGenerating(false);
    }
  };

  const [connecting, setConnecting] = useState(false);
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await runConnect();
      if (!res.success) {
        toast.error(res.error || "Falha ao conectar.");
        return;
      }
      toast.success(`Conectado a @${res.username}.`);
      refetchStatus();
    } finally {
      setConnecting(false);
    }
  };

  if (!loadingConnection && !connection?.connected) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Instagram
        </Typography>
        <Card variant="outlined" sx={{ mt: 3, p: 4, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 500 }}>Instagram ainda não conectado.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {connection?.error || "Usa o mesmo token do Meta Ads — só precisa achar qual Página tem o Instagram profissional vinculado."}
          </Typography>
          <Button variant="contained" onClick={handleConnect} disabled={connecting} sx={{ mt: 2 }}>
            {connecting ? "Conectando..." : "Conectar Instagram"}
          </Button>
        </Card>
      </Box>
    );
  }

  const overview = overviewResult?.success ? overviewResult.overview : null;
  const maxReach = overview ? Math.max(...overview.reachByDay.map((d) => d.value), 1) : 1;
  const audience = audienceResult?.success ? audienceResult.audience : null;
  const topContent = topContentResult?.success ? topContentResult.media : [];
  const analysis = latestAnalysis?.analysis ?? null;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Instagram
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {loadingConnection ? "Verificando conexão..." : connection?.username ? `@${connection.username}` : "Conectado"}
          </Typography>
        </Box>
        <Button
          variant="outline"
          size="small"
          startIcon={<RefreshCw size={14} />}
          onClick={() => {
            if (view === "geral") refetchOverview();
            else if (view === "ia") refetchAnalysis();
          }}
        >
          Atualizar
        </Button>
      </Stack>

      <Box sx={{ mt: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={view} onChange={(_, v) => setView(v)}>
          <Tab value="geral" icon={<Eye size={14} />} iconPosition="start" label="Visão Geral" sx={{ minHeight: 40 }} />
          <Tab value="conteudo" icon={<ImageIcon size={14} />} iconPosition="start" label="Conteúdo" sx={{ minHeight: 40 }} />
          <Tab value="publico" icon={<Users size={14} />} iconPosition="start" label="Público" sx={{ minHeight: 40 }} />
          <Tab value="ia" icon={<Sparkles size={14} />} iconPosition="start" label="Análise IA" sx={{ minHeight: 40 }} />
        </Tabs>
      </Box>

      {(view === "geral" || view === "conteudo") && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
          {DATE_PRESETS.map((p) => (
            <Button
              key={p.value}
              variant={datePreset === p.value ? "contained" : "outline"}
              size="small"
              onClick={() => setDatePreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </Stack>
      )}

      {view === "geral" && (
        <>
          {loadingOverview && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              Carregando...
            </Typography>
          )}
          {!loadingOverview && overviewResult && !overviewResult.success && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              {overviewResult.error}
            </Typography>
          )}
          {overview && (
            <>
              <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
                  <StatCard icon={Users} label="Seguidores" value={overview.followersCount.toLocaleString("pt-BR")} />
                </Grid>
                <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
                  <StatCard icon={Grid3x3} label="Publicações" value={overview.mediaCount.toLocaleString("pt-BR")} />
                </Grid>
                <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
                  <StatCard icon={Eye} label="Alcance" value={overview.reachTotal.toLocaleString("pt-BR")} />
                </Grid>
                <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
                  <StatCard icon={UserCheck} label="Contas engajadas" value={overview.accountsEngaged.toLocaleString("pt-BR")} />
                </Grid>
                <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
                  <StatCard icon={Heart} label="Interações" value={overview.totalInteractions.toLocaleString("pt-BR")} />
                </Grid>
                <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
                  <StatCard icon={Eye} label="Visitas ao perfil" value={overview.profileViews.toLocaleString("pt-BR")} />
                </Grid>
                <Grid size={{ xs: 6, md: 3, lg: 12 / 7 }}>
                  <StatCard icon={MousePointerClick} label="Cliques no link" value={overview.websiteClicks.toLocaleString("pt-BR")} />
                </Grid>
              </Grid>

              <SectionCard>
                <Typography sx={{ fontWeight: 600 }}>Alcance por dia</Typography>
                {overview.reachByDay.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Sem dados diários nesse período.
                  </Typography>
                )}
                <Stack spacing={0.75} sx={{ mt: 1.5 }}>
                  {overview.reachByDay.map((d) => (
                    <Stack key={d.date} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 80, flexShrink: 0 }}>
                        {new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </Typography>
                      <Box sx={{ height: 8, flex: 1, borderRadius: 999, bgcolor: "action.hover" }}>
                        <Box
                          sx={{
                            height: 8,
                            borderRadius: 999,
                            bgcolor: "primary.main",
                            width: `${Math.max(2, (d.value / maxReach) * 100)}%`,
                          }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 64, flexShrink: 0, textAlign: "right" }}>
                        {d.value.toLocaleString("pt-BR")}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </SectionCard>

              <SectionCard>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Typography sx={{ fontWeight: 600 }}>Posts que mais engajaram no período</Typography>
                  <Button variant="link" size="small" onClick={() => setView("conteudo")}>
                    Ver todos
                  </Button>
                </Stack>
                {loadingTopContent && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Carregando...
                  </Typography>
                )}
                {!loadingTopContent && topContent.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Nenhuma publicação nesse período.
                  </Typography>
                )}
                <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                  {topContent.slice(0, 3).map((m, i) => (
                    <Grid key={m.id} size={{ xs: 12, sm: 4 }}>
                      <Box
                        component="a"
                        href={m.permalink ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        sx={{
                          display: "flex",
                          gap: 1.5,
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 2,
                          p: 1.25,
                          textDecoration: "none",
                          color: "inherit",
                          transition: "border-color 0.15s",
                          "&:hover": { borderColor: "primary.main" },
                        }}
                      >
                        <Box sx={{ position: "relative", width: 64, flexShrink: 0 }}>
                          {m.thumbnailUrl ? (
                            <Box
                              component="img"
                              src={m.thumbnailUrl}
                              alt=""
                              sx={{ aspectRatio: "1 / 1", width: "100%", borderRadius: 1.5, objectFit: "cover", display: "block" }}
                            />
                          ) : (
                            <Box
                              sx={{
                                aspectRatio: "1 / 1",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 1.5,
                                bgcolor: "action.hover",
                              }}
                            >
                              <ImageIcon size={20} color="var(--mui-palette-text-secondary)" />
                            </Box>
                          )}
                          <Box
                            sx={{
                              position: "absolute",
                              left: 4,
                              top: 4,
                              borderRadius: 999,
                              bgcolor: "rgba(0,0,0,0.6)",
                              color: "#fff",
                              px: 0.75,
                              py: 0.25,
                              fontSize: 9,
                              fontWeight: 600,
                            }}
                          >
                            #{i + 1}
                          </Box>
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                          >
                            {m.caption || "(sem legenda)"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                            {m.productType}
                          </Typography>
                          <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontWeight: 600 }}>
                            {m.totalInteractions.toLocaleString("pt-BR")} interações
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
                {topContent.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                    O post #1 puxou o engajamento do período — {topContent[0]!.productType === "FEED" ? "um post de Feed" : topContent[0]!.productType === "REELS" ? "um Reel" : "uma publicação"}{" "}
                    com {topContent[0]!.likes.toLocaleString("pt-BR")} curtidas, {topContent[0]!.comments.toLocaleString("pt-BR")} comentários e{" "}
                    {topContent[0]!.shares.toLocaleString("pt-BR")} compartilhamentos.
                  </Typography>
                )}
              </SectionCard>
            </>
          )}
        </>
      )}

      {view === "conteudo" && (
        <>
          {loadingTopContent && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              Carregando...
            </Typography>
          )}
          {!loadingTopContent && topContentResult && !topContentResult.success && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              {topContentResult.error}
            </Typography>
          )}
          {!loadingTopContent && topContentResult?.success && topContent.length === 0 && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              Nenhuma publicação nesse período.
            </Typography>
          )}
          <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
            {topContent.map((m, i) => (
              <Grid key={m.id} size={{ xs: 12, sm: 6, lg: 4, xl: 12 / 5 }}>
                <Box
                  component="a"
                  href={m.permalink ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    display: "block",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    p: 1.5,
                    textDecoration: "none",
                    color: "inherit",
                    transition: "border-color 0.15s",
                    "&:hover": { borderColor: "primary.main" },
                  }}
                >
                  <Box sx={{ position: "relative" }}>
                    {m.thumbnailUrl ? (
                      <Box
                        component="img"
                        src={m.thumbnailUrl}
                        alt=""
                        sx={{ aspectRatio: "1 / 1", width: "100%", borderRadius: 2, objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <Box
                        sx={{
                          aspectRatio: "1 / 1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 2,
                          bgcolor: "action.hover",
                        }}
                      >
                        <ImageIcon size={24} color="var(--mui-palette-text-secondary)" />
                      </Box>
                    )}
                    <Box
                      sx={{
                        position: "absolute",
                        left: 6,
                        top: 6,
                        borderRadius: 999,
                        bgcolor: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        px: 0.75,
                        py: 0.25,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      #{i + 1}
                    </Box>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", mt: 1 }}
                  >
                    {m.caption || "(sem legenda)"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                    {m.productType}
                  </Typography>
                  <Grid container spacing={0.5} sx={{ mt: 1 }}>
                    <Grid size={6}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
                        <Eye size={12} />
                        <Typography variant="caption">{m.reach.toLocaleString("pt-BR")}</Typography>
                      </Stack>
                    </Grid>
                    <Grid size={6}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
                        <Heart size={12} />
                        <Typography variant="caption">{m.likes.toLocaleString("pt-BR")}</Typography>
                      </Stack>
                    </Grid>
                    <Grid size={6}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
                        <MessageCircle size={12} />
                        <Typography variant="caption">{m.comments.toLocaleString("pt-BR")}</Typography>
                      </Stack>
                    </Grid>
                    <Grid size={6}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
                        <Share2 size={12} />
                        <Typography variant="caption">{m.shares.toLocaleString("pt-BR")}</Typography>
                      </Stack>
                    </Grid>
                    <Grid size={6}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
                        <Bookmark size={12} />
                        <Typography variant="caption">{m.saved.toLocaleString("pt-BR")}</Typography>
                      </Stack>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {m.totalInteractions.toLocaleString("pt-BR")} intr.
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {view === "publico" && (
        <>
          {loadingAudience && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              Carregando...
            </Typography>
          )}
          {!loadingAudience && audienceResult && !audienceResult.success && (
            <Typography align="center" color="text.secondary" sx={{ mt: 3 }}>
              {audienceResult.error}
            </Typography>
          )}
          {audience && (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, lg: 6 }}>
                <SectionCard>
                  <Typography sx={{ fontWeight: 600 }}>Faixa etária</Typography>
                  <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                    {audience.age.map((a) => (
                      <BarRow key={a.label} label={a.label} value={a.value} pct={a.pct} />
                    ))}
                  </Stack>
                </SectionCard>
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <SectionCard>
                  <Typography sx={{ fontWeight: 600 }}>Gênero</Typography>
                  <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                    {audience.gender.map((g) => (
                      <BarRow key={g.label} label={g.label} value={g.value} pct={g.pct} />
                    ))}
                  </Stack>
                </SectionCard>
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <SectionCard>
                  <Typography sx={{ fontWeight: 600 }}>Top 10 países</Typography>
                  <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                    {audience.topCountries.map((c) => (
                      <BarRow key={c.label} label={c.label} value={c.value} pct={c.pct} />
                    ))}
                  </Stack>
                </SectionCard>
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <SectionCard>
                  <Typography sx={{ fontWeight: 600 }}>Top 10 estados</Typography>
                  <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                    {audience.topStates.map((c) => (
                      <BarRow key={c.label} label={c.label} value={c.value} pct={c.pct} />
                    ))}
                  </Stack>
                </SectionCard>
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <SectionCard>
                  <Typography sx={{ fontWeight: 600 }}>Top 10 cidades</Typography>
                  <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                    {audience.topCities.map((c) => (
                      <BarRow key={c.label} label={c.label} value={c.value} pct={c.pct} />
                    ))}
                  </Stack>
                </SectionCard>
              </Grid>
            </Grid>
          )}
        </>
      )}

      {view === "ia" && (
        <Box sx={{ mt: 2 }}>
          <Card variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography sx={{ fontWeight: 600 }}>Análise gerada por IA</Typography>
                <Typography variant="caption" color="text.secondary">
                  {latestAnalysis?.generatedAt
                    ? `Última análise: ${new Date(latestAnalysis.generatedAt).toLocaleString("pt-BR")} (${latestAnalysis.period})`
                    : "Nenhuma análise gerada ainda."}
                </Typography>
              </Box>
              <Button variant="contained" startIcon={<Sparkles size={16} />} onClick={handleGenerateAnalysis} disabled={generating}>
                {generating ? "Analisando..." : "Gerar análise"}
              </Button>
            </Stack>
          </Card>

          {analysis && (
            <Stack spacing={2} sx={{ mt: 2 }}>
              <SectionCard>
                <Typography sx={{ fontWeight: 600 }}>Resumo</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {analysis.resumo}
                </Typography>
              </SectionCard>

              <Grid container spacing={1.5}>
                {analysis.insights.map((ins, i) => (
                  <Grid key={i} size={{ xs: 12, md: 6 }}>
                    <SectionCard>
                      <Chip size="small" color={TONE_COLOR[ins.tone] ?? "default"} label={ins.title} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {ins.text}
                      </Typography>
                    </SectionCard>
                  </Grid>
                ))}
              </Grid>

              {analysis.recomendacoes.length > 0 && (
                <SectionCard>
                  <Typography sx={{ fontWeight: 600 }}>Recomendações</Typography>
                  <Box component="ul" sx={{ mt: 1, pl: 2.5, mb: 0 }}>
                    {analysis.recomendacoes.map((r, i) => (
                      <Typography key={i} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {r}
                      </Typography>
                    ))}
                  </Box>
                </SectionCard>
              )}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  );
}
