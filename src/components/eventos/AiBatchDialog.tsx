import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, AtSign, Check, Clock3, ImageOff, Link2, RefreshCw, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  approveContentQueueBatchFn,
  approveContentQueueItemFn,
  generateAiContentBatchFn,
  listContentQueueBatchFn,
  rejectContentQueueBatchFn,
  rejectContentQueueItemFn,
  updateContentQueueItemTextFn,
} from "@/lib/ai-content-queue.functions";
import { validateAiBatchSchedule } from "@/lib/ai-content-prompt";
import { listEnvioCampaigns } from "@/lib/envio-campaigns.functions";
import type { ContentQueueItem } from "@/lib/ai-content-queue.server";

const TIMEZONE = "America/Sao_Paulo";

function defaultSchedule(): { date: string; time: string } {
  const future = new Date(Date.now() + 15 * 60_000);
  return {
    date: future.toLocaleDateString("sv-SE", { timeZone: TIMEZONE }),
    time: future.toLocaleTimeString("pt-BR", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

const STATUS_LABEL: Record<ContentQueueItem["status"], string> = {
  review: "Aguardando revisão",
  processing: "Processando",
  approved: "Aprovado",
  scheduled: "Agendado",
  rejected: "Rejeitado",
  sent: "Enviado",
  failed: "Falhou",
};

function statusClass(status: ContentQueueItem["status"]): string {
  if (status === "sent") return "bg-success-soft text-success";
  if (status === "scheduled" || status === "approved") return "bg-brand-soft text-brand";
  if (status === "processing") return "bg-warning-soft text-warning";
  if (status === "failed") return "bg-critical-soft text-critical";
  if (status === "rejected") return "bg-muted text-muted-foreground line-through";
  return "bg-muted text-muted-foreground";
}

function QueueCard({
  item,
  onTextChange,
  onApprove,
  onReject,
  busy,
}: {
  item: ContentQueueItem;
  onTextChange: (text: string) => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const dateLabel = new Date(item.scheduledDate + "T12:00:00Z").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold capitalize">
          {dateLabel}, {item.timeOfDay}
        </span>
        <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + statusClass(item.status)}>
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      {item.contentImageUrl ? (
        <img src={item.contentImageUrl} alt="Prévia" className="max-h-40 w-full rounded-lg border border-border object-cover" />
      ) : (
        <div className="flex h-16 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
          <ImageOff className="size-3.5" /> Só texto
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Baseado em: </span>
        {item.sourceSummary}
      </p>

      {item.linkType !== "none" && (
        <span className="flex w-fit items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
          {item.linkType === "instagram" ? <AtSign className="size-2.5" /> : <Link2 className="size-2.5" />}
          {item.linkType === "instagram" ? "Link do Instagram" : "Link do site"}
        </span>
      )}

      <Textarea
        value={item.contentText}
        onChange={(event) => onTextChange(event.target.value)}
        rows={5}
        maxLength={500}
        disabled={item.status !== "review" || busy}
        className="text-sm"
      />
      {item.status === "review" && (
        <p className="text-right text-[10px] text-muted-foreground">
          {item.contentText.length}/500 caracteres · {item.contentText.split(/\r?\n/).length}/6 linhas
        </p>
      )}

      {item.rejectionReason && (
        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Motivo: </span>{item.rejectionReason}
        </p>
      )}
      {item.lastError && (
        <p className="rounded-md bg-critical-soft p-2 text-xs text-critical">{item.lastError}</p>
      )}

      {item.status === "review" && rejecting && (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
          <Label htmlFor={"reject-" + item.id} className="text-xs">Por que esta mensagem foi rejeitada?</Label>
          <Textarea
            id={"reject-" + item.id}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ex.: tom inadequado, oferta confusa ou produto errado."
            disabled={busy}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setReason(""); }} disabled={busy}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onReject(reason)} disabled={busy || reason.trim().length < 3}>
              Confirmar rejeição
            </Button>
          </div>
        </div>
      )}

      {item.status === "review" && !rejecting && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-critical" onClick={() => setRejecting(true)} disabled={busy}>
            <X className="size-3.5" /> Rejeitar
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onApprove} disabled={busy}>
            {busy ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Aprovar e agendar
          </Button>
        </div>
      )}
    </div>
  );
}

export function AiBatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const initialSchedule = useMemo(defaultSchedule, []);
  const [mode, setMode] = useState<"day" | "week">("day");
  const [startDate, setStartDate] = useState(initialSchedule.date);
  const [timeOfDay, setTimeOfDay] = useState(initialSchedule.time);
  const [campaignId, setCampaignId] = useState("");
  const [brandName, setBrandName] = useState("Mania de Mulher");
  const [brandVoice, setBrandVoice] = useState("Próximo, feminino, elegante, útil e direto.");
  const [audience, setAudience] = useState("Clientes dos grupos vinculados à campanha selecionada.");
  const [campaignObjective, setCampaignObjective] = useState("Gerar interesse e conversão com uma comunicação útil, clara e honesta.");
  const [funnelStage, setFunnelStage] = useState<"descoberta" | "consideracao" | "conversao" | "fidelizacao">("conversao");
  const [prohibitedClaims, setProhibitedClaims] = useState("Não inventar estoque, avaliações, vendas, resultados, benefícios, descontos ou urgência.");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [items, setItems] = useState<ContentQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const runGenerate = useServerFn(generateAiContentBatchFn);
  const runListBatch = useServerFn(listContentQueueBatchFn);
  const runUpdateText = useServerFn(updateContentQueueItemTextFn);
  const runApprove = useServerFn(approveContentQueueItemFn);
  const runApproveBatch = useServerFn(approveContentQueueBatchFn);
  const runReject = useServerFn(rejectContentQueueItemFn);
  const runRejectBatch = useServerFn(rejectContentQueueBatchFn);
  const runListCampaigns = useServerFn(listEnvioCampaigns);

  const { data: campaigns } = useQuery({
    queryKey: ["envio-campaigns"],
    queryFn: () => runListCampaigns(),
    enabled: open,
  });
  const selectedCampaign = campaigns?.find((campaign: any) => campaign.id === campaignId) as any | undefined;
  const scheduleError = validateAiBatchSchedule(startDate, timeOfDay);
  const hasValidAudience = Boolean(selectedCampaign && Number(selectedCampaign.group_count ?? 0) > 0);

  const discardCurrentBatch = async () => {
    if (batchId && items.some((item) => item.status === "review")) {
      await runRejectBatch({
        data: { batchId, reason: "Lote fechado ou substituído sem aprovação." },
      }).catch(() => {});
    }
  };

  useEffect(() => {
    if (!campaignId && campaigns && campaigns.length > 0) setCampaignId(campaigns[0]!.id);
  }, [campaigns, campaignId]);

  useEffect(() => {
    if (!open) return;
    const next = defaultSchedule();
    setBatchId(null);
    setItems([]);
    setError(null);
    setStartDate(next.date);
    setTimeOfDay(next.time);
  }, [open]);

  const generateMut = useMutation({
    mutationFn: () => {
      if (!selectedCampaign) throw new Error("Selecione uma campanha.");
      if (!hasValidAudience) throw new Error("A campanha precisa ter pelo menos um grupo vinculado.");
      const validationError = validateAiBatchSchedule(startDate, timeOfDay);
      if (validationError) throw new Error(validationError);
      return runGenerate({
        data: {
          campaignId: selectedCampaign.id,
          mode,
          startDate,
          timeOfDay,
          brandName,
          brandVoice,
          audience,
          campaignObjective,
          funnelStage,
          prohibitedClaims,
        },
      });
    },
    onSuccess: (result: any) => {
      if (result.success) {
        setBatchId(result.batchId);
        setItems(result.items);
        setError(null);
      } else {
        setError(result.error || "Falha ao gerar o calendário.");
      }
    },
    onError: (mutationError: any) => setError(mutationError.message || "Falha ao gerar o calendário."),
  });

  const refetchBatch = async () => {
    if (!batchId) return;
    setItems(await runListBatch({ data: { batchId } }));
  };

  const handleTextChange = (id: string, text: string) => {
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, contentText: text } : item)));
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      const current = items.find((item) => item.id === id);
      if (current) {
        const saved: any = await runUpdateText({ data: { id, contentText: current.contentText } });
        if (!saved.success) throw new Error(saved.error || "Não foi possível salvar a mensagem.");
      }
      const result: any = await runApprove({ data: { id } });
      if (result.success) toast.success("Mensagem aprovada e agendada.");
      else toast.error(result.error || "Falha ao aprovar.");
      await refetchBatch();
    } catch (approvalError: any) {
      toast.error(approvalError.message || "Falha ao aprovar.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    setBusyId(id);
    try {
      await runReject({ data: { id, reason } });
      toast.success("Mensagem rejeitada. O motivo será usado nas próximas gerações.");
      await refetchBatch();
    } catch (rejectionError: any) {
      toast.error(rejectionError.message || "Falha ao rejeitar.");
    } finally {
      setBusyId(null);
    }
  };

  const approveAllMut = useMutation({
    mutationFn: async () => {
      for (const item of items.filter((candidate) => candidate.status === "review")) {
        const saved: any = await runUpdateText({ data: { id: item.id, contentText: item.contentText } });
        if (!saved.success) throw new Error(saved.error || "Falha ao salvar a mensagem de " + item.scheduledDate + ".");
      }
      return runApproveBatch({ data: { batchId: batchId! } });
    },
    onSuccess: async (result: any) => {
      toast.success(
        String(result.approved)
        + " mensagem(ns) agendada(s)"
        + (result.failed ? "; " + String(result.failed) + " não puderam ser agendadas" : "")
        + ".",
      );
      await refetchBatch();
    },
    onError: (mutationError: any) => toast.error(mutationError.message || "Falha ao agendar o calendário."),
  });

  const reviewCount = items.filter((item) => item.status === "review").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void discardCurrentBatch();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Criar calendário com IA
          </DialogTitle>
          <DialogDescription>
            Planeja mensagens com fontes reais, contexto da campanha e datas do calendário. Nada é enviado antes da sua aprovação.
          </DialogDescription>
        </DialogHeader>

        {!batchId && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Período</Label>
              <Tabs value={mode} onValueChange={(value) => setMode(value as "day" | "week")}>
                <TabsList>
                  <TabsTrigger value="day">Um dia</TabsTrigger>
                  <TabsTrigger value="week">Uma semana (7 mensagens)</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{mode === "week" ? "Começa em" : "Data"}</Label>
                <Input type="date" min={defaultSchedule().date} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Horário em São Paulo</Label>
                <Input type="time" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} />
              </div>
            </div>
            {scheduleError && (
              <p className="flex items-start gap-2 rounded-md bg-warning-soft p-2 text-xs text-warning">
                <Clock3 className="mt-0.5 size-3.5 shrink-0" /> {scheduleError}
              </p>
            )}

            <div className="space-y-2">
              <Label>Campanha de envio</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue placeholder="Selecione uma campanha" /></SelectTrigger>
                <SelectContent>
                  {(campaigns ?? []).map((campaign: any) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name} · {campaign.group_count ?? 0} grupo(s)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCampaign && (
                <p className="text-xs text-muted-foreground">
                  Público real do envio: <span className="font-semibold text-foreground">{selectedCampaign.group_count ?? 0} grupo(s)</span>
                  {selectedCampaign.description ? " · " + selectedCampaign.description : ""}
                </p>
              )}
              {selectedCampaign && !hasValidAudience && (
                <p className="flex items-center gap-2 text-xs text-critical">
                  <AlertTriangle className="size-3.5" /> Vincule pelo menos um grupo antes de gerar.
                </p>
              )}
              {campaigns && campaigns.length === 0 && (
                <p className="text-xs text-warning">Nenhuma campanha ativa encontrada. Crie uma no Fluxo de Envio.</p>
              )}
            </div>

            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold">Briefing para a IA</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome da marca</Label>
                  <Input value={brandName} maxLength={100} onChange={(event) => setBrandName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Etapa do funil</Label>
                  <Select value={funnelStage} onValueChange={(value) => setFunnelStage(value as typeof funnelStage)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="descoberta">Descoberta</SelectItem>
                      <SelectItem value="consideracao">Consideração</SelectItem>
                      <SelectItem value="conversao">Conversão</SelectItem>
                      <SelectItem value="fidelizacao">Fidelização</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Tom de voz</Label>
                  <Textarea rows={2} maxLength={500} value={brandVoice} onChange={(event) => setBrandVoice(event.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Público da mensagem</Label>
                  <Textarea rows={2} maxLength={800} value={audience} onChange={(event) => setAudience(event.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Objetivo da campanha</Label>
                  <Textarea rows={2} maxLength={800} value={campaignObjective} onChange={(event) => setCampaignObjective(event.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Afirmações proibidas ou cuidados</Label>
                  <Textarea rows={2} maxLength={1000} value={prohibitedClaims} onChange={(event) => setProhibitedClaims(event.target.value)} />
                </div>
              </div>
            </div>

            {error && <p className="rounded-md bg-critical-soft p-3 text-sm text-critical">{error}</p>}

            <div className="flex justify-end border-t border-border pt-4">
              <Button
                onClick={() => generateMut.mutate()}
                disabled={
                  generateMut.isPending
                  || !campaignId
                  || !hasValidAudience
                  || Boolean(scheduleError)
                  || !brandName.trim()
                  || !brandVoice.trim()
                  || !audience.trim()
                  || !campaignObjective.trim()
                }
              >
                {generateMut.isPending ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                {generateMut.isPending ? "Planejando..." : "Criar " + (mode === "week" ? "calendário de 7 dias" : "mensagem")}
              </Button>
            </div>
          </div>
        )}

        {batchId && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <p className="text-sm text-muted-foreground">
                {items.length} mensagem(ns) planejada(s) · {reviewCount} aguardando revisão
              </p>
              {reviewCount > 0 && (
                <Button size="sm" onClick={() => approveAllMut.mutate()} disabled={approveAllMut.isPending} className="gap-1.5">
                  {approveAllMut.isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Aprovar e agendar todas ({reviewCount})
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  onTextChange={(text) => handleTextChange(item.id, text)}
                  onApprove={() => handleApprove(item.id)}
                  onReject={(reason) => handleReject(item.id, reason)}
                  busy={busyId === item.id}
                />
              ))}
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={async () => {
                  await discardCurrentBatch();
                  setBatchId(null);
                  setItems([]);
                }}
              >
                Criar outro calendário
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
