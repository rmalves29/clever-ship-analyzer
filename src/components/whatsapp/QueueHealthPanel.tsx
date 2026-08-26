import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getWhatsappQueueHealth,
  pauseWhatsappCampaign,
  resumeWhatsappCampaign,
  retryFailedWhatsappCampaign,
} from "@/lib/whatsapp-queue-health.functions";

const STATUS_CARDS = [
  ["queued", "Na fila"],
  ["sending", "Enviando"],
  ["retry_wait", "Retry"],
  ["sent", "Enviadas"],
  ["failed", "Falhas"],
  ["cancelled", "Canceladas"],
  ["skipped", "Ignoradas"],
] as const;

type QueueCampaign = {
  id: string;
  nome: string;
  status: string;
  paused: boolean;
  messageType: string;
  queue: {
    queued: number;
    sending: number;
    retry: number;
    sent: number;
    failed: number;
    skipped: number;
    cancelled: number;
  };
};

export function QueueHealthPanel() {
  const runPause = useServerFn(pauseWhatsappCampaign);
  const runResume = useServerFn(resumeWhatsappCampaign);
  const runRetry = useServerFn(retryFailedWhatsappCampaign);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["whatsapp-queue-health"],
    queryFn: () => getWhatsappQueueHealth(),
    refetchInterval: 15_000,
  });

  const mutate = async (campaignId: string, action: "pause" | "resume" | "retry") => {
    setBusyId(campaignId);
    try {
      if (action === "pause") {
        const result = await runPause({ data: { campaignId } });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Fila da campanha pausada. Os jobs continuam preservados.");
      } else if (action === "resume") {
        const result = await runResume({ data: { campaignId } });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Fila da campanha retomada.");
      } else {
        const result = await runRetry({ data: { campaignId } });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(`${result.retried} falha(s) reenfileirada(s).`);
      }
      await refetch();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao operar a fila do WhatsApp.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Saúde da fila do WhatsApp</h3>
          <p className="text-sm text-muted-foreground">
            Estado real dos jobs do worker. Pausar não apaga mensagens: apenas impede novas reivindicações até retomar.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={isFetching} onClick={() => refetch()}>
          <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Carregando fila...</p>}
      {isError && <p className="mt-4 text-sm text-critical">Não foi possível carregar a fila.</p>}

      {data && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {STATUS_CARDS.map(([key, label]) => (
              <div key={key} className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold">{data.byStatus[key].toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Total: {data.total.toLocaleString("pt-BR")}</Badge>
            <Badge variant="outline">Pendentes: {data.pending.toLocaleString("pt-BR")}</Badge>
            <Badge variant="outline">Finalizados: {data.finished.toLocaleString("pt-BR")}</Badge>
            <Badge variant="outline">Sucesso provider: {data.successRate.toFixed(1)}%</Badge>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Campanha</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Fila</th>
                  <th className="px-3 py-2.5">Enviando</th>
                  <th className="px-3 py-2.5">Retry</th>
                  <th className="px-3 py-2.5">Enviadas</th>
                  <th className="px-3 py-2.5">Falhas</th>
                  <th className="px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((campaign: QueueCampaign) => (
                  <tr key={campaign.id} className="border-t border-border">
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{campaign.nome}</p>
                      <p className="text-xs text-muted-foreground">{campaign.messageType === "utility" ? "Utilidade" : "Marketing"}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">{campaign.status || "—"}</Badge>
                        {campaign.paused && <Badge className="bg-warning-soft text-warning">Fila pausada</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{campaign.queue.queued}</td>
                    <td className="px-3 py-2.5">{campaign.queue.sending}</td>
                    <td className="px-3 py-2.5">{campaign.queue.retry}</td>
                    <td className="px-3 py-2.5">{campaign.queue.sent}</td>
                    <td className="px-3 py-2.5 font-semibold">{campaign.queue.failed}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {campaign.paused ? (
                          <Button size="sm" variant="outline" className="gap-1" disabled={busyId === campaign.id} onClick={() => mutate(campaign.id, "resume")}>
                            <Play className="size-3.5" /> Retomar
                          </Button>
                        ) : campaign.queue.queued + campaign.queue.retry > 0 ? (
                          <Button size="sm" variant="outline" className="gap-1" disabled={busyId === campaign.id} onClick={() => mutate(campaign.id, "pause")}>
                            <Pause className="size-3.5" /> Pausar
                          </Button>
                        ) : null}
                        {campaign.queue.failed > 0 && (
                          <Button size="sm" variant="outline" className="gap-1" disabled={busyId === campaign.id} onClick={() => mutate(campaign.id, "retry")}>
                            <RotateCcw className="size-3.5" /> Tentar falhas
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.campaigns.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhuma campanha encontrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data.failureReasons.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold">Falhas atuais da fila</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {data.failureReasons.slice(0, 8).map((failure) => (
                  <div key={failure.reason} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="truncate" title={failure.reason}>{failure.reason}</span>
                    <Badge variant="outline">{failure.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
