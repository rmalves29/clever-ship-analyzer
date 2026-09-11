import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, RefreshCw, RotateCcw, Ban, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getWaCampaign, waCampaignAction } from "@/lib/wa-campaigns.functions";

export const Route = createFileRoute("/whatsapp/$campaignId")({
  head: () => ({
    meta: [
      { title: "Campanha de WhatsApp | CRM Insights" },
      { name: "description", content: "Situação real de cada destinatário da campanha: enviada, entregue, lida ou falha com motivo." },
      { property: "og:title", content: "Campanha de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Acompanhe destinatário por destinatário o resultado do envio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => <p className="p-8 text-sm text-critical">{error.message}</p>,
  notFoundComponent: () => <p className="p-8 text-sm text-muted-foreground">Campanha não encontrada.</p>,
  component: CampaignDetailPage,
});

const RECIPIENT_LABEL: Record<string, string> = {
  queued: "Na fila",
  sending: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  cancelled: "Cancelada",
};

const RECIPIENT_CLASS: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  sending: "bg-warning-soft text-warning",
  sent: "bg-brand-soft text-brand",
  delivered: "bg-success-soft text-success",
  read: "bg-success-soft text-success",
  failed: "bg-critical-soft text-critical",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_TABS = ["todos", "queued", "sent", "delivered", "read", "failed"] as const;

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const runDetail = useServerFn(getWaCampaign);
  const runAction = useServerFn(waCampaignAction);
  const [statusTab, setStatusTab] = useState<string>("todos");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["wa-campaign", campaignId, statusTab],
    queryFn: () => runDetail({ data: { campaignId, status: statusTab } }),
    refetchInterval: 15_000,
  });

  const act = async (action: "retry" | "cancel" | "pause" | "resume" | "refresh") => {
    setBusy(true);
    try {
      await runAction({ data: { campaignId, action } });
      toast.success("Pronto.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Não deu certo.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Carregando campanha…</p>;
  const c = data.campaign;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/whatsapp">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <div className="mr-auto">
          <h2 className="text-xl font-bold tracking-tight">{c.name}</h2>
          <p className="text-xs text-muted-foreground">
            {c.audienceLabel ?? "Público"} · modelo {c.templateName || "—"} ({c.templateLanguage}) ·{" "}
            {new Date(c.sentAt ?? c.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
        <Button variant="outline" className="gap-2" disabled={busy || isFetching} onClick={() => act("refresh")}>
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} /> Atualizar
        </Button>
        <Button variant="outline" className="gap-2" disabled={busy} onClick={() => act(c.queuePaused ? "resume" : "pause")}>
          {c.queuePaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {c.queuePaused ? "Retomar" : "Pausar"}
        </Button>
        <Button variant="outline" className="gap-2" disabled={busy || c.failed === 0} onClick={() => act("retry")}>
          <RotateCcw className="size-3.5" /> Repetir falhas
        </Button>
        <Button variant="outline" className="gap-2 text-critical" disabled={busy || c.pending === 0} onClick={() => act("cancel")}>
          <Ban className="size-3.5" /> Cancelar restante
        </Button>
      </div>

      {(data.lastError || data.rejectReason) && (
        <div className="surface-card border-critical/40 p-4 text-sm text-critical">{data.rejectReason ?? data.lastError}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Destinatários", value: c.total },
          { label: "Enviadas", value: c.sent },
          { label: "Entregues", value: c.delivered },
          { label: "Lidas", value: c.read },
          { label: "Falhas", value: c.failed },
          { label: "Na fila", value: c.pending },
        ].map((card) => (
          <div key={card.label} className="surface-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{card.value.toLocaleString("pt-BR")}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1 w-fit">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusTab(s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              statusTab === s ? "gradient-brand text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {s === "todos" ? "Todos" : RECIPIENT_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Telefone</th>
              <th className="px-4 py-2">Situação</th>
              <th className="px-4 py-2">Motivo / horário</th>
            </tr>
          </thead>
          <tbody>
            {data.recipients.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-4 py-2">{r.name ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.phone}</td>
                <td className="px-4 py-2">
                  <Badge className={cn("border-0", RECIPIENT_CLASS[r.status] ?? "bg-muted text-muted-foreground")}>
                    {RECIPIENT_LABEL[r.status] ?? r.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {r.errorMessage
                    ? `${r.errorMessage}${r.errorCode ? ` (${r.errorCode})` : ""}`
                    : r.readAt
                      ? `Lida em ${new Date(r.readAt).toLocaleString("pt-BR")}`
                      : r.deliveredAt
                        ? `Entregue em ${new Date(r.deliveredAt).toLocaleString("pt-BR")}`
                        : r.sentAt
                          ? `Enviada em ${new Date(r.sentAt).toLocaleString("pt-BR")}`
                          : "—"}
                </td>
              </tr>
            ))}
            {data.recipients.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>
                  Nenhum destinatário nessa situação.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
