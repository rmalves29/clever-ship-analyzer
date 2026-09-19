import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  getPublicLandingPage,
  getPublicLandingPageReviews,
  submitLandingPageLead,
  submitLandingPageReview,
  type ImageAspect,
  type LandingPageContent,
} from "@/lib/landing-pages.functions";

const HERO_PHONE_FIELD_ID = "lp-phone-input-hero";

function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (digits.length <= 2) return ddd;
  if (rest.length <= 5) return `(${ddd}) ${rest}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
}

function isValidPhoneBR(formatted: string): boolean {
  const digits = formatted.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

function callFbq(...args: unknown[]) {
  const w = window as unknown as { fbq?: (...a: unknown[]) => void };
  w.fbq?.(...args);
}

/** Destaca em negrito a chamada pro sorteio (ex.: "concorrer a um iPhone") dentro do texto de
 *  apoio do hero — funciona pra qualquer landing page que use essa frase, sem exigir um campo
 *  de conteúdo novo só pra isso. */
function renderWithIphoneHighlight(text: string) {
  const match = text.match(/concorrer a (?:um |1 )?iphone\.?/i);
  if (!match || match.index === undefined) return text;
  const start = match.index;
  const end = start + match[0].length;
  return (
    <>
      {text.slice(0, start)}
      <Box component="span" sx={{ fontWeight: 800, color: "text.primary" }}>{text.slice(start, end)}</Box>
      {text.slice(end)}
    </>
  );
}

/** "original" não fixa proporção nem corta a imagem (evita cortar cartazes com texto desenhado);
 *  as demais opções recortam pra caber num formato consistente ao lado do texto. */
function imageAspectSx(proporcao: ImageAspect) {
  if (proporcao === "original") return { objectFit: "contain" as const };
  const aspectRatio = proporcao === "quadrada" ? "1 / 1" : proporcao === "paisagem" ? "4 / 3" : "4 / 5";
  return { objectFit: "cover" as const, aspectRatio };
}

/** Carrega o Pixel do Meta uma vez por pixelId e dispara PageView — cada landing page roda numa
 *  conta de anúncio diferente, então o ID vem do conteúdo da própria página, não de env global. */
function useMetaPixel(pixelId: string) {
  useEffect(() => {
    if (!pixelId) return;
    const w = window as any;
    if (!w.fbq) {
      const fbq: any = function (...args: unknown[]) {
        fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
      };
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = "2.0";
      w.fbq = fbq;
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }
    callFbq("init", pixelId);
    callFbq("track", "PageView");
  }, [pixelId]);
}

/** Reduz a fonte quando o valor é uma palavra/frase em vez de um número curto (ex.: "14%") —
 *  sem isso, um texto longo fica do tamanho de um título e briga visualmente com o resto. */
function statFontSize(text: string, shortSize: number, longSize: number): number {
  return text.length > 8 ? longSize : shortSize;
}

/** Traço — texto — traço, no estilo de https://bazar.maniadmulher.com/ ("— O QUE VOCÊ RECEBE —"). */
function SectionDivider({ label }: { label: string }) {
  if (!label) return null;
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 4 }}>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "text.secondary", whiteSpace: "nowrap" }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
    </Stack>
  );
}

function StarRating({ value, onChange, size = 16 }: { value: number; size?: number; onChange?: (value: number) => void }) {
  return (
    <Stack direction="row" spacing={0.3}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Box
          key={n}
          component={onChange ? "button" : "span"}
          type={onChange ? "button" : undefined}
          onClick={onChange ? () => onChange(n) : undefined}
          sx={{ border: "none", bgcolor: "transparent", p: 0, cursor: onChange ? "pointer" : "default", display: "flex", lineHeight: 0 }}
        >
          <Star size={size} fill={n <= value ? "#F5A623" : "none"} color={n <= value ? "#F5A623" : "#D0D0D0"} />
        </Box>
      ))}
    </Stack>
  );
}

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

/** CTA com telefone obrigatório antes de seguir: é a única forma de saber quem visitou a página
 *  (o WhatsApp não avisa este app quando alguém entra no grupo pelo link de convite). */
function PhoneGateCta({
  label,
  url,
  bgColor,
  phone,
  onPhoneChange,
  onSubmit,
  submitting,
  fieldId,
}: {
  label: string;
  url: string;
  bgColor: string;
  phone: string;
  onPhoneChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  fieldId?: string;
}) {
  const valid = isValidPhoneBR(phone);
  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}>
        Digite seu WhatsApp e clique no botão para entrar no grupo
      </Typography>
      <TextField
        id={fieldId}
        size="small"
        placeholder="(DDD) XXXXX-XXXX"
        value={phone}
        onChange={(e) => onPhoneChange(formatPhoneBR(e.target.value))}
        fullWidth
        slotProps={{ htmlInput: { inputMode: "tel" } }}
      />
      <Button
        onClick={onSubmit}
        disabled={!valid || submitting}
        component={url ? "a" : "button"}
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
          "&.Mui-disabled": { bgcolor: `${bgColor}55`, color: "#fff" },
        }}
      >
        {submitting ? "Enviando..." : label}
      </Button>
    </Stack>
  );
}

function PublicLandingPage() {
  const { slug } = Route.useParams();
  const runGet = useServerFn(getPublicLandingPage);
  const runSubmitLead = useServerFn(submitLandingPageLead);
  const runGetReviews = useServerFn(getPublicLandingPageReviews);
  const runSubmitReview = useServerFn(submitLandingPageReview);
  const [phone, setPhone] = useState("");
  const [reviewNome, setReviewNome] = useState("");
  const [reviewTexto, setReviewTexto] = useState("");
  const [reviewEstrelas, setReviewEstrelas] = useState(5);
  const [reviewSent, setReviewSent] = useState(false);

  const { data: page, isLoading } = useQuery({
    queryKey: ["public-landing-page", slug],
    queryFn: () => runGet({ data: { slug } }),
  });

  const { data: approvedReviews } = useQuery({
    queryKey: ["public-landing-page-reviews", slug],
    queryFn: () => runGetReviews({ data: { slug } }),
    enabled: Boolean(page?.conteudo.secoesVisiveis.depoimentos),
  });

  useMetaPixel(page?.conteudo.integracoes.metaPixelId ?? "");

  const submitMut = useMutation({
    mutationFn: (ctaUrl: string) => runSubmitLead({ data: { slug, phone } }).then(() => ctaUrl),
    onSuccess: (ctaUrl) => {
      callFbq("track", "Lead");
      if (ctaUrl) window.location.href = ctaUrl;
    },
    onError: () => toast.error("Não foi possível enviar. Tente de novo em instantes."),
  });

  const reviewMut = useMutation({
    mutationFn: () => runSubmitReview({ data: { slug, nome: reviewNome, texto: reviewTexto, estrelas: reviewEstrelas } }),
    onSuccess: (res) => {
      if (res.success) {
        setReviewSent(true);
        setReviewNome("");
        setReviewTexto("");
        setReviewEstrelas(5);
      } else {
        toast.error(res.error ?? "Não foi possível enviar seu comentário.");
      }
    },
    onError: () => toast.error("Não foi possível enviar seu comentário."),
  });

  const handleSubmit = (ctaUrl: string) => {
    if (!isValidPhoneBR(phone)) {
      toast.error("Digite um telefone válido com DDD.");
      return;
    }
    submitMut.mutate(ctaUrl);
  };

  const handleSubmitReview = () => {
    if (!reviewNome.trim() || !reviewTexto.trim()) {
      toast.error("Preencha seu nome e o comentário.");
      return;
    }
    reviewMut.mutate();
  };

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
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr 1fr" }, gap: { xs: 4, md: 6 }, alignItems: "start" }}>
          <Box sx={{ textAlign: { xs: "center", md: "left" } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "text.secondary", mb: 2 }}>
              {c.hero.selo}
            </Typography>
            <Typography sx={{ fontSize: { xs: 38, md: 58 }, fontWeight: 800, lineHeight: 1.1, mb: 3, color: c.tema.corDestaque }}>
              {c.hero.headlineNormal}{" "}
              <Box component="span" sx={{ color: c.tema.corPrimaria }}>{c.hero.headlineDestaque}</Box>
            </Typography>
            <Typography sx={{ fontSize: 16, color: "text.secondary", mb: 4, maxWidth: 440, mx: { xs: "auto", md: 0 } }}>
              {renderWithIphoneHighlight(c.hero.subcopy)}
            </Typography>
            <Box sx={{ maxWidth: 360, mx: { xs: "auto", md: 0 } }}>
              <PhoneGateCta
                fieldId={HERO_PHONE_FIELD_ID}
                label={c.hero.ctaLabel}
                url={c.hero.ctaUrl}
                bgColor={c.tema.corDestaque}
                phone={phone}
                onPhoneChange={setPhone}
                onSubmit={() => handleSubmit(c.hero.ctaUrl)}
                submitting={submitMut.isPending}
              />
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
                sx={{ width: "100%", borderRadius: 3, ...imageAspectSx(c.hero.imagemProporcao) }}
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
      {c.secoesVisiveis.estatisticas && (
      <Box sx={{ maxWidth: 1120, mx: "auto", px: { xs: 3, md: 6 }, pb: { xs: 4, md: 6 } }}>
        <Box
          sx={{
            border: "1px solid",
            borderColor: `${c.tema.corPrimaria}33`,
            bgcolor: "#fff",
            borderRadius: 4,
            p: { xs: 3, md: 4 },
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 3, md: 4 }} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
            <Box>
              <Box
                component="span"
                sx={{ display: "inline-block", bgcolor: c.tema.corPrimaria, color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 1, px: 1.5, py: 0.5, borderRadius: 999, mb: 1.5 }}
              >
                {c.estatisticas.seloTexto}
              </Box>
              <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{c.estatisticas.tituloTexto}</Typography>
            </Box>
            <Stack direction="row" spacing={{ xs: 2, sm: 3 }} sx={{ alignItems: "center", flexWrap: "wrap", justifyContent: { xs: "center", md: "flex-end" } }}>
              <Box sx={{ textAlign: "center", maxWidth: 120 }}>
                <Typography sx={{ fontSize: statFontSize(c.estatisticas.item1Valor, 32, 18), fontWeight: 800, lineHeight: 1.2 }}>
                  {c.estatisticas.item1Valor}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{c.estatisticas.item1Label}</Typography>
              </Box>
              <Box
                sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: "50%", bgcolor: `${c.tema.corPrimaria}22`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: c.tema.corPrimaria }}
              >
                +
              </Box>
              <Box sx={{ textAlign: "center", maxWidth: 120 }}>
                <Typography sx={{ fontSize: statFontSize(c.estatisticas.item2Valor, 32, 18), fontWeight: 800, lineHeight: 1.2 }}>
                  {c.estatisticas.item2Valor}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{c.estatisticas.item2Label}</Typography>
              </Box>
              <Box sx={{ width: 1, alignSelf: "stretch", bgcolor: "divider", display: { xs: "none", sm: "block" } }} />
              <Box sx={{ textAlign: "center", maxWidth: 140 }}>
                <Typography sx={{ fontSize: statFontSize(c.estatisticas.totalValor, 36, 20), fontWeight: 800, color: c.tema.corPrimaria, lineHeight: 1.2 }}>
                  {c.estatisticas.totalValor}
                </Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: "text.secondary" }}>
                  {c.estatisticas.totalLabel}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>
      </Box>
      )}

      {/* Benefícios */}
      {c.secoesVisiveis.beneficios && (
      <Box sx={{ maxWidth: 1120, mx: "auto", px: { xs: 3, md: 6 }, pb: { xs: 6, md: 10 } }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: c.beneficios.imagemUrl ? "1fr 1fr" : "1fr" }, gap: { xs: 4, md: 6 } }}>
          {c.beneficios.imagemUrl && (
            <Box>
              <Box component="img" src={c.beneficios.imagemUrl} alt={c.beneficios.imagemLegenda} sx={{ width: "100%", borderRadius: 3, ...imageAspectSx(c.beneficios.imagemProporcao) }} />
              {c.beneficios.imagemLegenda && (
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "text.secondary", mt: 1.5 }}>
                  {c.beneficios.imagemLegenda}
                </Typography>
              )}
            </Box>
          )}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "text.secondary", mb: 2.5, textAlign: c.beneficios.imagemUrl ? "left" : "center" }}>
              {c.beneficios.seloTexto}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: c.beneficios.imagemUrl ? "1fr" : { xs: "1fr", sm: `repeat(${Math.min(c.beneficios.itens.length, 3)}, 1fr)` },
                gap: c.beneficios.imagemUrl ? 3 : 4,
              }}
            >
              {c.beneficios.itens.map((item, i) => (
                <Box key={i} sx={{ textAlign: c.beneficios.imagemUrl ? "left" : "center" }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: c.beneficios.imagemUrl ? "flex-start" : "center" }}>
                    <Box component="span" sx={{ color: c.tema.corPrimaria, fontWeight: 700 }}>◆</Box>
                    <Typography sx={{ fontWeight: 700 }}>{item.titulo}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 0.5, ml: c.beneficios.imagemUrl ? 3 : 0 }}>{item.descricao}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
      )}

      {/* Como funciona */}
      {c.secoesVisiveis.comoFunciona && (
      <Box sx={{ maxWidth: 1120, mx: "auto", px: { xs: 3, md: 6 }, pb: { xs: 6, md: 10 } }}>
        <SectionDivider label={c.comoFunciona.seloTexto} />
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

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: c.comoFunciona.imagemUrl ? "1fr 1fr" : "1fr" },
            gap: { xs: 4, md: 6 },
            alignItems: "center",
          }}
        >
          {c.comoFunciona.imagemUrl && (
            <Box>
              <Box component="img" src={c.comoFunciona.imagemUrl} alt={c.comoFunciona.imagemLegenda} sx={{ width: "100%", borderRadius: 3, ...imageAspectSx(c.comoFunciona.imagemProporcao) }} />
              {c.comoFunciona.imagemLegenda && (
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "text.secondary", mt: 1.5 }}>
                  {c.comoFunciona.imagemLegenda}
                </Typography>
              )}
            </Box>
          )}
          <Box sx={c.comoFunciona.imagemUrl ? undefined : { textAlign: "center", maxWidth: 480, mx: "auto" }}>
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
            <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 3, maxWidth: 380, mx: c.comoFunciona.imagemUrl ? 0 : "auto" }}>
              {c.comoFunciona.headline}
            </Typography>
            <Box sx={{ maxWidth: 340, mx: c.comoFunciona.imagemUrl ? 0 : "auto" }}>
              <PhoneGateCta
                label={c.comoFunciona.ctaLabel}
                url={c.comoFunciona.ctaUrl}
                bgColor={c.tema.corDestaque}
                phone={phone}
                onPhoneChange={setPhone}
                onSubmit={() => handleSubmit(c.comoFunciona.ctaUrl)}
                submitting={submitMut.isPending}
              />
            </Box>
          </Box>
        </Box>
      </Box>
      )}

      {/* Depoimentos: os fixos (fake) vêm do conteúdo da página; os reais só aparecem depois de
       *  aprovados no admin (evita spam/ofensa indo direto pro ar). */}
      {c.secoesVisiveis.depoimentos && (
      <Box sx={{ maxWidth: 1120, mx: "auto", px: { xs: 3, md: 6 }, pb: { xs: 6, md: 10 } }}>
        <SectionDivider label={c.depoimentos.seloTexto} />
          {(c.depoimentos.itens.length > 0 || (approvedReviews?.length ?? 0) > 0) && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
                gap: 3,
                mb: { xs: 5, md: 7 },
              }}
            >
              {c.depoimentos.itens.map((dep, i) => (
                <Box key={`fake-${i}`} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5, bgcolor: "#fff" }}>
                  <StarRating value={dep.estrelas} />
                  <Typography sx={{ fontSize: 14, mt: 1.5, color: "text.primary" }}>{dep.texto}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mt: 1.5 }}>{dep.nome}</Typography>
                </Box>
              ))}
              {(approvedReviews ?? []).map((rev) => (
                <Box key={rev.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5, bgcolor: "#fff" }}>
                  <StarRating value={rev.estrelas} />
                  <Typography sx={{ fontSize: 14, mt: 1.5, color: "text.primary" }}>{rev.texto}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mt: 1.5 }}>{rev.nome}</Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Formulário pra cliente deixar o próprio comentário. */}
          <Box sx={{ maxWidth: 480, mx: "auto", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3, textAlign: "center" }}>
            {reviewSent ? (
              <Typography sx={{ fontWeight: 700 }}>Obrigada pelo seu comentário! 💜</Typography>
            ) : (
              <Stack spacing={1.5}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Deixe seu comentário</Typography>
                <Stack sx={{ alignItems: "center" }}>
                  <StarRating value={reviewEstrelas} onChange={setReviewEstrelas} size={22} />
                </Stack>
                <TextField size="small" placeholder="Seu nome" value={reviewNome} onChange={(e) => setReviewNome(e.target.value)} fullWidth />
                <TextField
                  size="small"
                  placeholder="Conte como foi sua experiência"
                  value={reviewTexto}
                  onChange={(e) => setReviewTexto(e.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                />
                <Button
                  onClick={handleSubmitReview}
                  disabled={reviewMut.isPending}
                  variant="contained"
                  sx={{ bgcolor: c.tema.corDestaque, "&:hover": { bgcolor: c.tema.corDestaque, opacity: 0.9 } }}
                >
                  {reviewMut.isPending ? "Enviando..." : "Enviar comentário"}
                </Button>
              </Stack>
            )}
          </Box>
      </Box>
      )}

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
