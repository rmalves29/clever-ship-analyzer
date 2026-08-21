import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getLatestMetaAdsAnalysis, generateMetaAdsAnalysis } from "@/lib/meta-ads-ai.functions";
import type { MetaAdsDatePreset } from "@/lib/meta-ads.server";

const TONE_CLASS: Record<string, string> = {
  positivo: "bg-success-soft text-success",
  atencao: "bg-warning-soft text-warning",
  critico: "bg-critical-soft text-critical",
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
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-semibold">Análise detalhada gerada por IA</p>
          <p className="text-xs text-muted-foreground">
            {latest?.generatedAt
              ? `Última análise: ${new Date(latest.generatedAt).toLocaleString("pt-BR")} (${latest.period})`
              : "Nenhuma análise gerada ainda."}
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generating} className="gap-2">
          <Sparkles className="size-4" />
          {generating ? "Analisando toda a conta..." : "Analisar"}
        </Button>
      </div>

      {analysis && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-semibold">Resumo</p>
            <p className="mt-1 text-sm text-muted-foreground">{analysis.resumo}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {analysis.insights.map((ins: any, i: number) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[ins.tone] ?? "bg-muted text-muted-foreground"}`}>
                  {ins.title}
                </span>
                <p className="mt-2 text-sm text-muted-foreground">{ins.text}</p>
              </div>
            ))}
          </div>

          {analysis.recomendacoes?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold">Recomendações</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {analysis.recomendacoes.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
