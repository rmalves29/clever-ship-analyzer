import { Sparkles } from "lucide-react";
import type { DashboardData } from "@/lib/crm-mock";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  critico: "bg-critical-soft/60 border-critical/30",
  regular: "bg-warning-soft/60 border-warning/30",
  meta: "bg-success-soft/60 border-success/30",
  info: "bg-brand-soft/60 border-brand/30",
};

export function ExecutiveSummary({ insights }: { insights: DashboardData["insights"] }) {
  return (
    <section className="surface-card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border p-5">
        <span className="gradient-brand flex size-10 items-center justify-center rounded-xl text-primary-foreground">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Resumo executivo</h2>
          <p className="text-sm text-muted-foreground">Principais insights estratégicos da base, gerados por IA</p>
        </div>
      </header>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        {insights.map((i) => (
          <article key={i.title} className={cn("rounded-xl border p-4", TONES[i.tone])}>
            <h3 className="font-semibold">{i.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {i.highlight && (
                <span className="mr-1 rounded-md bg-card px-1.5 py-0.5 text-xs font-semibold text-foreground">
                  {i.highlight}
                </span>
              )}
              {i.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
