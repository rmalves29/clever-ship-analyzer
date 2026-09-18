import { useEffect, useState } from "react";
import { createFileRoute, createLink } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, Copy, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  getLandingPage,
  saveLandingPage,
  DEFAULT_LANDING_PAGE_CONTENT,
  type LandingPageContent,
} from "@/lib/landing-pages.functions";

export const Route = createFileRoute("/landing-pages/$id")({
  head: () => ({ meta: [{ title: "Editar landing page | CRM Insights" }] }),
  component: LandingPageEditor,
});

const LinkIconButton = createLink(IconButton);

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function Section({ title, subtitle, children, defaultExpanded }: { title: string; subtitle?: string; children: React.ReactNode; defaultExpanded?: boolean }) {
  return (
    <Accordion defaultExpanded={defaultExpanded} sx={{ "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Box>
          <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>{children}</Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function ListEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>{label}</Typography>
      <Stack spacing={1}>
        {items.map((item, i) => (
          <Stack key={i} direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              value={item}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((v, idx) => (idx === i ? e.target.value : v)))}
            />
            <IconButton size="small" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              <Trash2 size={16} />
            </IconButton>
          </Stack>
        ))}
        <Button size="small" startIcon={<Plus size={14} />} onClick={() => onChange([...items, ""])} sx={{ alignSelf: "flex-start" }}>
          Adicionar
        </Button>
      </Stack>
    </Box>
  );
}

function TitledListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: { titulo: string; descricao: string }[];
  onChange: (items: { titulo: string; descricao: string }[]) => void;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>{label}</Typography>
      <Stack spacing={2}>
        {items.map((item, i) => (
          <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "flex-start", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Stack spacing={1} sx={{ flex: 1 }}>
              <TextField
                size="small"
                fullWidth
                label="Título"
                value={item.titulo}
                onChange={(e) => onChange(items.map((v, idx) => (idx === i ? { ...v, titulo: e.target.value } : v)))}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label="Descrição"
                value={item.descricao}
                onChange={(e) => onChange(items.map((v, idx) => (idx === i ? { ...v, descricao: e.target.value } : v)))}
              />
            </Stack>
            <IconButton size="small" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              <Trash2 size={16} />
            </IconButton>
          </Stack>
        ))}
        <Button size="small" startIcon={<Plus size={14} />} onClick={() => onChange([...items, { titulo: "", descricao: "" }])} sx={{ alignSelf: "flex-start" }}>
          Adicionar
        </Button>
      </Stack>
    </Box>
  );
}

function LandingPageEditor() {
  const { id } = Route.useParams();
  const runGet = useServerFn(getLandingPage);
  const runSave = useServerFn(saveLandingPage);

  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"rascunho" | "publicada">("rascunho");
  const [content, setContent] = useState<LandingPageContent>(DEFAULT_LANDING_PAGE_CONTENT);
  const [loaded, setLoaded] = useState(false);

  const { data: page, isLoading } = useQuery({
    queryKey: ["landing-page", id],
    queryFn: () => runGet({ data: { id } }),
  });

  useEffect(() => {
    if (page && !loaded) {
      setNome(page.nome);
      setSlug(page.slug);
      setStatus(page.status);
      setContent(page.conteudo);
      setLoaded(true);
    }
  }, [page, loaded]);

  const saveMut = useMutation({
    mutationFn: () => runSave({ data: { id, nome, slug, status, conteudo: content } }),
    onSuccess: () => toast.success("Landing page salva."),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/lp/${slug}`);
    toast.success("Link copiado.");
  };

  function updateSection<K extends keyof LandingPageContent>(key: K, patch: Partial<LandingPageContent[K]>) {
    setContent((prev) => ({ ...prev, [key]: { ...(prev[key] as object), ...patch } }));
  }

  if (isLoading || !loaded) {
    return <Typography variant="body2" color="text.secondary" sx={{ p: 4 }}>Carregando...</Typography>;
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 900, mx: "auto" }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <LinkIconButton to="/landing-pages" size="small"><ArrowLeft size={18} /></LinkIconButton>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Editar landing page</Typography>
          <Chip size="small" variant="outlined" color={status === "publicada" ? "success" : "default"} label={status === "publicada" ? "Publicada" : "Rascunho"} />
        </Stack>
        <Stack direction="row" spacing={1}>
          <IconButton onClick={copyLink} title="Copiar link"><Copy size={16} /></IconButton>
          <IconButton component="a" href={`/lp/${slug}`} target="_blank" title="Abrir página"><ExternalLink size={16} /></IconButton>
          <Button variant="contained" startIcon={<Save size={16} />} onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            Salvar
          </Button>
        </Stack>
      </Stack>

      <Stack spacing={2}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" fullWidth label="Nome interno" value={nome} onChange={(e) => setNome(e.target.value)} />
              <TextField
                size="small"
                fullWidth
                label="Link (slug)"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                helperText={`${typeof window !== "undefined" ? window.location.origin : ""}/lp/${slug}`}
              />
              <TextField
                size="small"
                select
                fullWidth
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as "rascunho" | "publicada")}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="rascunho">Rascunho</MenuItem>
                <MenuItem value="publicada">Publicada</MenuItem>
              </TextField>
            </Stack>
          </Stack>
        </Box>

        <Section title="Cores" subtitle="Paleta usada na página inteira" defaultExpanded>
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
            {(
              [
                ["corPrimaria", "Cor primária (destaques, barra de anúncio)"],
                ["corDestaque", "Cor dos botões e rodapé"],
                ["corFundo", "Cor de fundo da página"],
                ["corDourada", "Cor dourada (números/logo)"],
              ] as const
            ).map(([key, label]) => (
              <TextField
                key={key}
                size="small"
                label={label}
                type="color"
                value={content.tema[key]}
                onChange={(e) => updateSection("tema", { [key]: e.target.value })}
                sx={{ width: 220 }}
              />
            ))}
          </Stack>
        </Section>

        <Section title="Barra de anúncio" subtitle="Texto que roda no topo da página">
          <ListEditor
            label="Mensagens"
            items={content.ticker}
            onChange={(items) => setContent((prev) => ({ ...prev, ticker: items }))}
            placeholder="Ex.: DESCONTO ESPECIAL"
          />
        </Section>

        <Section title="Topo (hero)" subtitle="Primeira seção que a pessoa vê" defaultExpanded>
          <TextField size="small" label="Nome/logo da marca" value={content.hero.logoTexto} onChange={(e) => updateSection("hero", { logoTexto: e.target.value })} />
          <TextField size="small" label="Selo (texto pequeno acima do título)" value={content.hero.selo} onChange={(e) => updateSection("hero", { selo: e.target.value })} />
          <TextField size="small" label="Título — parte normal" value={content.hero.headlineNormal} onChange={(e) => updateSection("hero", { headlineNormal: e.target.value })} />
          <TextField size="small" label="Título — parte destacada (colorida)" value={content.hero.headlineDestaque} onChange={(e) => updateSection("hero", { headlineDestaque: e.target.value })} />
          <TextField size="small" multiline minRows={2} label="Texto de apoio" value={content.hero.subcopy} onChange={(e) => updateSection("hero", { subcopy: e.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Texto do botão" value={content.hero.ctaLabel} onChange={(e) => updateSection("hero", { ctaLabel: e.target.value })} />
            <TextField size="small" fullWidth label="Link do botão" placeholder="https://..." value={content.hero.ctaUrl} onChange={(e) => updateSection("hero", { ctaUrl: e.target.value })} />
          </Stack>
          <TextField size="small" label="Texto abaixo do botão" value={content.hero.ctaLegenda} onChange={(e) => updateSection("hero", { ctaLegenda: e.target.value })} />
          <TextField size="small" label="URL da imagem" placeholder="https://..." value={content.hero.imagemUrl} onChange={(e) => updateSection("hero", { imagemUrl: e.target.value })} />
          <TextField size="small" label="Legenda da imagem" value={content.hero.imagemLegenda} onChange={(e) => updateSection("hero", { imagemLegenda: e.target.value })} />
        </Section>

        <Section title="Bloco de desconto" subtitle="Selo + números do desconto">
          <TextField size="small" label="Selo" value={content.estatisticas.seloTexto} onChange={(e) => updateSection("estatisticas", { seloTexto: e.target.value })} />
          <TextField size="small" label="Título" value={content.estatisticas.tituloTexto} onChange={(e) => updateSection("estatisticas", { tituloTexto: e.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Valor 1 (ex.: 14%)" value={content.estatisticas.item1Valor} onChange={(e) => updateSection("estatisticas", { item1Valor: e.target.value })} />
            <TextField size="small" fullWidth label="Legenda do valor 1" value={content.estatisticas.item1Label} onChange={(e) => updateSection("estatisticas", { item1Label: e.target.value })} />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Valor 2 (ex.: 14%)" value={content.estatisticas.item2Valor} onChange={(e) => updateSection("estatisticas", { item2Valor: e.target.value })} />
            <TextField size="small" fullWidth label="Legenda do valor 2" value={content.estatisticas.item2Label} onChange={(e) => updateSection("estatisticas", { item2Label: e.target.value })} />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Valor total (ex.: até 28%)" value={content.estatisticas.totalValor} onChange={(e) => updateSection("estatisticas", { totalValor: e.target.value })} />
            <TextField size="small" fullWidth label="Legenda do total" value={content.estatisticas.totalLabel} onChange={(e) => updateSection("estatisticas", { totalLabel: e.target.value })} />
          </Stack>
        </Section>

        <Section title="Benefícios" subtitle="Imagem + lista de vantagens">
          <TextField size="small" label="Selo" value={content.beneficios.seloTexto} onChange={(e) => updateSection("beneficios", { seloTexto: e.target.value })} />
          <TextField size="small" label="URL da imagem" placeholder="https://..." value={content.beneficios.imagemUrl} onChange={(e) => updateSection("beneficios", { imagemUrl: e.target.value })} />
          <TextField size="small" label="Legenda da imagem" value={content.beneficios.imagemLegenda} onChange={(e) => updateSection("beneficios", { imagemLegenda: e.target.value })} />
          <TitledListEditor label="Itens" items={content.beneficios.itens} onChange={(itens) => updateSection("beneficios", { itens })} />
        </Section>

        <Section title="Como funciona" subtitle="Passos + fechamento com CTA">
          <TextField size="small" label="Selo" value={content.comoFunciona.seloTexto} onChange={(e) => updateSection("comoFunciona", { seloTexto: e.target.value })} />
          <TitledListEditor label="Passos" items={content.comoFunciona.passos} onChange={(passos) => updateSection("comoFunciona", { passos })} />
          <TextField size="small" label="URL da imagem" placeholder="https://..." value={content.comoFunciona.imagemUrl} onChange={(e) => updateSection("comoFunciona", { imagemUrl: e.target.value })} />
          <TextField size="small" label="Legenda da imagem" value={content.comoFunciona.imagemLegenda} onChange={(e) => updateSection("comoFunciona", { imagemLegenda: e.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Número grande (ex.: 14)" value={content.comoFunciona.numeroGrande} onChange={(e) => updateSection("comoFunciona", { numeroGrande: e.target.value })} />
            <TextField size="small" fullWidth label="Legenda do número (ex.: ANOS)" value={content.comoFunciona.numeroGrandeLabel} onChange={(e) => updateSection("comoFunciona", { numeroGrandeLabel: e.target.value })} />
          </Stack>
          <TextField size="small" label="Nome/logo da marca" value={content.comoFunciona.logoTexto} onChange={(e) => updateSection("comoFunciona", { logoTexto: e.target.value })} />
          <TextField size="small" multiline minRows={2} label="Frase de fechamento" value={content.comoFunciona.headline} onChange={(e) => updateSection("comoFunciona", { headline: e.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Texto do botão" value={content.comoFunciona.ctaLabel} onChange={(e) => updateSection("comoFunciona", { ctaLabel: e.target.value })} />
            <TextField size="small" fullWidth label="Link do botão" placeholder="https://..." value={content.comoFunciona.ctaUrl} onChange={(e) => updateSection("comoFunciona", { ctaUrl: e.target.value })} />
          </Stack>
        </Section>

        <Section title="Rodapé">
          <TextField size="small" label="Linha de endereço" value={content.rodape.linhaEndereco} onChange={(e) => updateSection("rodape", { linhaEndereco: e.target.value })} />
          <TextField size="small" label="Linha de selos (ex.: troca fácil · 4x sem juros)" value={content.rodape.linhaBadges} onChange={(e) => updateSection("rodape", { linhaBadges: e.target.value })} />
          <TextField size="small" multiline minRows={2} label="Texto legal (letras miúdas)" value={content.rodape.textoLegal} onChange={(e) => updateSection("rodape", { textoLegal: e.target.value })} />
        </Section>
      </Stack>

      <Box sx={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "flex-end", mt: 3 }}>
        <Button variant="contained" size="large" startIcon={<Save size={16} />} onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          Salvar alterações
        </Button>
      </Box>
    </Box>
  );
}
