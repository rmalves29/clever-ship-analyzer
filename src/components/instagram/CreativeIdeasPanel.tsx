import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { generateCreativeIdeas } from "@/lib/creative-matrix.functions";
import type { CreativeIdea, CreativeMatrixResult } from "@/lib/creative-matrix.server";
import { ANGLE_LABEL, buildIdeasInput, type Angle } from "@/lib/creative-matrix-shared";

const angleLabel = (a: string) => ANGLE_LABEL[a as Angle] ?? a;

export function IdeaCard({ idea }: { idea: CreativeIdea }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(idea.legenda);
      toast.success("Legenda copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  return (
    <Card variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
        <Chip size="small" color={idea.tipo === "post" ? "primary" : "secondary"} label={idea.tipo === "post" ? "Post" : "Anúncio"} />
        <Chip size="small" variant="outlined" label={idea.formato} />
        <Chip size="small" variant="outlined" label={angleLabel(idea.angulo)} />
        <Chip size="small" variant="outlined" label={idea.produto} />
        {idea.prioridade === "alta" && <Chip size="small" color="success" label="Prioridade alta" />}
      </Stack>

      <Typography sx={{ fontWeight: 700, mt: 1.25 }}>{idea.gancho}</Typography>

      <Box component="ol" sx={{ mt: 1, pl: 2.5, mb: 0, listStyleType: "decimal" }}>
        {idea.roteiro.map((step, i) => (
          <Typography key={i} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
            {step}
          </Typography>
        ))}
      </Box>

      <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {idea.tipo === "post" ? "Legenda" : "Texto principal"}
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.25 }}>
          {idea.legenda}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.75 }}>
          {idea.cta}
        </Typography>
      </Box>

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-end", mt: 1.25, gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
          Por quê: {idea.baseado_em}
        </Typography>
        <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={copy} sx={{ flexShrink: 0 }}>
          Copiar
        </Button>
      </Stack>
    </Card>
  );
}

export type GeneratedIdeas = { items: CreativeIdea[]; generatedAt: string };

export function CreativeIdeasPanel({
  result,
  generated,
  onGenerated,
}: {
  result: CreativeMatrixResult;
  generated: GeneratedIdeas | null;
  onGenerated: (value: GeneratedIdeas) => void;
}) {
  const runGenerate = useServerFn(generateCreativeIdeas);
  const [loading, setLoading] = useState(false);
  const ideas = generated?.items ?? null;
  const generatedAt = generated?.generatedAt ?? null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const input = buildIdeasInput({
        datePreset: result.datePreset,
        postMatrix: result.postMatrix,
        adMatrix: result.adMatrix,
        insights: result.insights,
        posts: result.posts,
        ads: result.ads,
      });
      const res = await runGenerate({ data: input });
      if (!res.success) {
        toast.error(res.error || "Falha ao gerar ideias.");
        return;
      }
      onGenerated({ items: res.ideas, generatedAt: res.generatedAt });
      toast.success("Ideias geradas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar ideias.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <Box sx={{ maxWidth: 720 }}>
          <Typography sx={{ fontWeight: 600 }}>Ideias a partir da matriz</Typography>
          <Typography variant="caption" color="text.secondary">
            {generatedAt
              ? `Geradas em ${new Date(generatedAt).toLocaleString("pt-BR")}. Clicar de novo gera um novo lote.`
              : "A IA propõe 5 posts e 3 anúncios com roteiro e texto prontos, ancorados nos números acima. Nada é publicado nem enviado."}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Lightbulb size={16} />} onClick={handleGenerate} disabled={loading}>
          {loading ? "Gerando…" : ideas ? "Gerar novas ideias" : "Gerar ideias"}
        </Button>
      </Stack>

      {ideas && (
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {ideas.map((idea, i) => (
            <Grid key={i} size={{ xs: 12, lg: 6 }}>
              <IdeaCard idea={idea} />
            </Grid>
          ))}
        </Grid>
      )}
    </Card>
  );
}
