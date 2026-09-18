import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getPublicLandingPage, type LandingPageContent } from "@/lib/landing-pages.functions";

export const Route = createFileRoute("/lp/$slug")({
  head: () => ({ meta: [{ title: "Oferta especial" }] }),
  component: PublicLandingPage,
});

function Ticker({ items, corPrimaria }: { items: string[]; corPrimaria: string }) {
  if (items.length === 0) return null;
  const loop = [...items, ...items, ...items];
  return (
    <Box sx={{ bgcolor: corPrimaria, color: "#fff", overflow: "hidden", py: 1 }}>
      <style>{`
        @keyframes lp-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }
      `}</style>
      <Box sx={{ display: "flex", width: "300%", animation: "lp-ticker-scroll 22s linear infinite" }}>
        {loop.map((item, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", flexShrink: 0, px: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap" }}>{item}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function CtaButton({ label, url, bgColor }: { label: string; url: string; bgColor: string }) {
  return (
    <Button
      component={url ? "a" : "button"}
      href={url || undefined}
      variant="contained"
      size="large"
      fullWidth
      sx={{
        bgcolor: bgColor,
        color: "#fff",
        borderRadius: 999,
        py: 1.75,
        fontWeight: 700,
        letterSpacing: 0.5,
        "&:hover": { bgcolor: bgColor, opacity: 0.9 },
      }}
    >
      {label}
    </Button>
  );
}

function PublicLandingPage() {
  const { slug } = Route.useParams();
  const runGet = useServerFn(getPublicLandingPage);

  const { data: page, isLoading } = useQuery({
    queryKey: ["public-landing-page", slug],
    queryFn: () => runGet({ data: { slug } }),
  });

  if (isLoading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!page) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", p: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Página não encontrada</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Esse link não existe mais ou a página ainda não foi publicada.
          </Typography>
        </Box>
      </Box>
    );
  }

  const c = page.conteudo as LandingPageContent;

  return (
    <Box sx={{ bgcolor: c.tema.corFundo, minHeight: "100vh" }}>
      <Ticker items={c.ticker} corPrimaria={c.tema.corPrimaria} />

      {/* Hero */}
      <Box sx={{ maxWidth: 1120, mx: "auto", px: { xs: 3, md: 6 }, py: { xs: 4, md: 8 } }}>
        <Typography sx={{ fontWeight: 800, letterSpacing: 1, mb: { xs: 3, md: 5 } }}>{c.hero.logoTexto}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr 1fr" }, gap: { xs: 4, md: 6 }, alignItems: "start" }}>
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "text.secondary", mb: 2 }}>
              {c.hero.selo}
            </Typography>
            <Typography sx={{ fontSize: { xs: 32, md: 44 }, fontWeight: 800, lineHeight: 1.15, mb: 3 }}>
              {c.hero.headlineNormal}{" "}
              <Box component="span" sx={{ color: c.tema.corPrimaria }}>{c.hero.headlineDestaque}</Box>
            </Typography>
            <Typography sx={{ fontSize: 16, color: "text.secondary", mb: 4, maxWidth: 440 }}>{c.hero.subcopy}</Typography>
            <Box sx={{ maxWidth: 360 }}>
              <CtaButton label={c.hero.ctaLabel} url={c.hero.ctaUrl} bgColor={c.tema.corDestaque} />
            </Box>
            {c.hero.ctaLegenda && (
              <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>{c.hero.ctaLegenda}</Typography>
            )}
          </Box>
          {c.hero.imagemUrl && (
            <Box>
              <Box
                component="img"
                src={c.hero.imagemUrl}
                alt={c.hero.imagemLegenda || c.hero.headlineDestaque}
                sx={{ width: "100%", borderRadius: 3, objectFit: "cover", aspectRatio: "4 / 5" }}
              />
              {c.hero.imagemLegenda && (
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "text.secondary", mt: 1.5 }}>
                  {c.hero.imagemLegenda}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Estatísticas */}
      <Box sx={{ maxWidth: 1120, mx: "auto", px: { xs: 3, md: 6 }, pb: { xs: 4, md: 6 } }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 3, md: 4 }} sx={{ alignItems: { md: "center" } }}>
          <Box sx={{ flex: 1 }}>
            <Box
              component="span"
              sx={{ display: "inline-block", bgcolor: c.tema.corPrimaria, color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 1, px: 1.5, py: 0.5, borderRadius: 999, mb: 1.5 }}
            >
              {c.estatisticas.seloTexto}
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{c.estatisticas.tituloTexto}</Typography>
          </Box>
          <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 32, fontWeight: 800 }}>{c.estatisticas.item1Valor}</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary", maxWidth: 100 }}>{c.estatisticas.item1Label}</Typography>
            </Box>
            <Box
              sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: `${c.tema.corPrimaria}22`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: c.tema.corPrimaria }}
            >
              +
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 32, fontWeight: 800 }}>{c.estatisticas.item2Valor}</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary", maxWidth: 100 }}>{c.estatisticas.item2Label}</Typography>
            </Box>
            <Box sx={{ textAlign: "center", pl: { xs: 0, sm: 2 } }}>
              <Typography sx={{ fontSize: 36, fontWeight: 800, color: c.tema.corPrimaria }}>{c.estatisticas.totalValor}</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: "text.secondary" }}>
                {c.estatisticas.totalLabel}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Box>

      {/* Benefícios */}
      <Box sx={{ maxWidth: 1120, mx: "auto", px: { xs: 3, md: 6 }, pb: { xs: 6, md: 10 } }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: { xs: 4, md: 6 } }}>
          {c.beneficios.imagemUrl && (
            <Box>
              <Box component="img" src={c.beneficios.imagemUrl} alt={c.beneficios.imagemLegenda} sx={{ width: "100%", borderRadius: 3, objectFit: "cover", aspectRatio: "4 / 3" }} />
              {c.beneficios.imagemLegenda && (
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "text.secondary", mt: 1.5 }}>
                  {c.beneficios.imagemLegenda}
                </Typography>
              )}
            </Box>
          )}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "text.secondary", mb: 2.5 }}>
              {c.beneficios.seloTexto}
            </Typography>
            <Stack spacing={3}>
              {c.beneficios.itens.map((item, i) => (
                <Box key={i}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Box component="span" sx={{ color: c.tema.corPrimaria, fontWeight: 700 }}>◆</Box>
                    <Typography sx={{ fontWeight: 700 }}>{item.titulo}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 0.5, ml: 3 }}>{item.descricao}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>

      {/* Como funciona */}
      <Box sx={{ maxWidth: 1120, mx: "auto", px: { xs: 3, md: 6 }, pb: { xs: 6, md: 10 } }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "text.secondary", textAlign: "center", mb: 4 }}>
          {c.comoFunciona.seloTexto}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: `repeat(${Math.max(c.comoFunciona.passos.length, 1)}, 1fr)` }, gap: 4, mb: { xs: 5, md: 7 } }}>
          {c.comoFunciona.passos.map((passo, i) => (
            <Box key={i}>
              <Box
                sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: c.tema.corDestaque, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, mb: 1.5 }}
              >
                {i + 1}
              </Box>
              <Typography sx={{ fontSize: 14 }}>
                <Box component="span" sx={{ fontWeight: 700 }}>{passo.titulo}</Box>{passo.titulo && passo.descricao ? " — " : ""}{passo.descricao}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: { xs: 4, md: 6 }, alignItems: "center" }}>
          {c.comoFunciona.imagemUrl && (
            <Box>
              <Box component="img" src={c.comoFunciona.imagemUrl} alt={c.comoFunciona.imagemLegenda} sx={{ width: "100%", borderRadius: 3, objectFit: "cover", aspectRatio: "4 / 5" }} />
              {c.comoFunciona.imagemLegenda && (
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "text.secondary", mt: 1.5 }}>
                  {c.comoFunciona.imagemLegenda}
                </Typography>
              )}
            </Box>
          )}
          <Box>
            {c.comoFunciona.numeroGrande && (
              <Typography sx={{ fontSize: 72, fontWeight: 800, color: c.tema.corDourada, lineHeight: 1 }}>
                {c.comoFunciona.numeroGrande}
                {c.comoFunciona.numeroGrandeLabel && (
                  <Box component="span" sx={{ fontSize: 16, fontWeight: 700, ml: 1, letterSpacing: 2 }}>
                    {c.comoFunciona.numeroGrandeLabel}
                  </Box>
                )}
              </Typography>
            )}
            {c.comoFunciona.logoTexto && (
              <Typography sx={{ fontWeight: 800, letterSpacing: 1, color: c.tema.corDourada, mb: 2 }}>{c.comoFunciona.logoTexto}</Typography>
            )}
            <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 3, maxWidth: 380 }}>{c.comoFunciona.headline}</Typography>
            <Box sx={{ maxWidth: 340 }}>
              <CtaButton label={c.comoFunciona.ctaLabel} url={c.comoFunciona.ctaUrl} bgColor={c.tema.corDestaque} />
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Rodapé */}
      <Box sx={{ bgcolor: c.tema.corDestaque, color: "#fff", py: { xs: 4, md: 5 }, px: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{c.rodape.linhaEndereco}</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, mt: 0.5, opacity: 0.85 }}>{c.rodape.linhaBadges}</Typography>
        {c.rodape.textoLegal && (
          <Typography sx={{ fontSize: 11, opacity: 0.7, mt: 2, maxWidth: 640, mx: "auto" }}>{c.rodape.textoLegal}</Typography>
        )}
      </Box>
    </Box>
  );
}
