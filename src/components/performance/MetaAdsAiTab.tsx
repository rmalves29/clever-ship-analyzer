import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";
import { getLatestMetaAdsAnalysis, generateMetaAdsAnalysis } from "@/lib/meta-ads-ai.functions";
import type { MetaAdsDatePreset } from "@/lib/meta-ads.server";

const TONE_COLOR: Record<string, ChipProps["color"]> = {
  positivo: "success",
  atencao: "warning",
  critico: "error",
};

export function MetaAdsAiTab({ datePreset }: { datePreset: MetaAdsDatePreset }) {
  const runLatest = useServerFn(getLatestMetaAdsAnalysis);
  const runGenerate = useServerFn(generateMetaAdsAnalysis);

  const { data: latest, refetch } = useQuery({
    queryKey: ["meta-ads-analysis"],
    queryFn: () => runLatest(),
  });

  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await runGenerate({ data: { datePreset } });
      if (!res.success) {
        toast.error(res.error || "Falha ao gerar análise.");
        return;
      }
      toast.success("Análise gerada.");
      refetch();
    } finally {
      setGenerating(false);
    }
  };

  const analysis = latest?.analysis ?? null;

  return (
    <Box sx={{ mt: 2 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}
      >
        <Box>
          <Typography sx={{ fontWeight: 600 }}>Análise detalhada gerada por IA</Typography>
          <Typography variant="caption" color="text.secondary">
            {latest?.generatedAt
              ? `Última análise: ${new Date(latest.generatedAt).toLocaleString("pt-BR")} (${latest.period})`
              : "Nenhuma análise gerada ainda."}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Sparkles size={16} />} onClick={handleGenerate} disabled={generating}>
          {generating ? "Analisando toda a conta..." : "Analisar"}
        </Button>
      </Stack>

      {analysis && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
            <Typography sx={{ fontWeight: 600 }}>Resumo</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {analysis.resumo}
            </Typography>
          </Box>

          <Grid container spacing={1.5}>
            {analysis.insights.map((ins: any, i: number) => (
              <Grid key={i} size={{ xs: 12, md: 6 }}>
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
                  <Chip size="small" color={TONE_COLOR[ins.tone] ?? "default"} label={ins.title} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {ins.text}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          {analysis.recomendacoes?.length > 0 && (
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Typography sx={{ fontWeight: 600 }}>Recomendações</Typography>
              <Box component="ul" sx={{ mt: 1, pl: 2.5, mb: 0 }}>
                {analysis.recomendacoes.map((r: string, i: number) => (
                  <Typography key={i} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {r}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
}
