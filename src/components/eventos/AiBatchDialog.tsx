import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, RefreshCw, ImageOff, Check, X, Link2, AtSign } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  generateAiContentBatchFn,
  listContentQueueBatchFn,
  updateContentQueueItemTextFn,
  approveContentQueueItemFn,
  approveContentQueueBatchFn,
  rejectContentQueueItemFn,
  rejectContentQueueBatchFn,
} from "@/lib/ai-content-queue.functions";
import { listEnvioCampaigns } from "@/lib/envio-campaigns.functions";
import type { ContentQueueItem } from "@/lib/ai-content-queue.server";

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

const STATUS_LABEL: Record<ContentQueueItem["status"], string> = {
  review: "Aguardando revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  sent: "Enviado",
  failed: "Falhou",
};

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
  onReject: () => void;
  busy: boolean;
}) {
  const dateLabel = new Date(`${item.scheduledDate}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold capitalize">{dateLabel}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            item.status === "review"
              ? "bg-muted text-muted-foreground"
              : item.status === "sent"
                ? "bg-success-soft text-success"
                : item.status === "rejected"
                  ? "bg-muted text-muted-foreground line-through"
                  : "bg-critical-soft text-critical"
          }`}
        >
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
        onChange={(e) => onTextChange(e.target.value)}
        rows={4}
        disabled={item.status !== "review"}
        className="text-sm"
      />

      {item.status === "review" && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-critical" onClick={onReject} disabled={busy}>
            <X className="size-3.5" /> Rejeitar
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onApprove} disabled={busy}>
            <Check className="size-3.5" /> Aprovar
          </Button>
        </div>
      )}
    </div>
  );
}

export function AiBatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [startDate, setStartDate] = useState(todayISO());
  const [timeOfDay, setTimeOfDay] = useState("10:00");
  const [campaignId, setCampaignId] = useState("");
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

  // Sem isso, fechar o popup ou clicar em "Gerar outro lote" abandonava os itens em status
  // 'review' pra sempre — nunca despachavam, mas continuavam entrando como "conteúdo recente"
  // na próxima geração, o que contribuía pro lote seguinte sair parecido com o anterior.
  const discardCurrentBatch = async () => {
    if (batchId && items.some((i) => i.status === "review")) {
      await runRejectBatch({ data: { batchId } }).catch(() => {});
    }
  };

  const { data: campaigns } = useQuery({ queryKey: ["envio-campaigns"], queryFn: () => runListCampaigns(), enabled: open });

  useEffect(() => {
    if (!campaignId && campaigns && campaigns.length > 0) setCampaignId(campaigns[0]!.id);
  }, [campaigns, campaignId]);

  useEffect(() => {
    if (open) {
      setBatchId(null);
      setItems([]);
      setError(null);
      setStartDate(todayISO());
    }
  }, [open]);

  const generateMut = useMutation({
    mutationFn: () => {
      const campaign = campaigns?.find((c: any) => c.id === campaignId);
      if (!campaign) throw new Error("Selecione uma campanha.");
      return runGenerate({ data: { campaignId: campaign.id, campaignName: campaign.name, mode, startDate, timeOfDay } });
    },
    onSuccess: (res: any) => {
      if (res.success) {
        setBatchId(res.batchId);
        setItems(res.items);
        setError(null);
      } else {
        setError(res.error || "Falha ao gerar o lote.");
      }
    },
    onError: (err: any) => setError(err.message || "Falha ao gerar o lote."),
  });

  const refetchBatch = async () => {
    if (!batchId) return;
    const fresh = await runListBatch({ data: { batchId } });
    setItems(fresh);
  };

  const handleTextChange = (id: string, text: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, contentText: text } : i)));
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      const current = items.find((i) => i.id === id);
      if (current) await runUpdateText({ data: { id, contentText: current.contentText } });
      const res: any = await runApprove({ data: { id } });
      if (res.success) toast.success("Postagem aprovada e despachada.");
      else toast.error(res.error || "Falha ao aprovar.");
      await refetchBatch();
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    try {
      await runReject({ data: { id } });
      await refetchBatch();
    } finally {
      setBusyId(null);
    }
  };

  const approveAllMut = useMutation({
    mutationFn: async () => {
      // Salva edições de texto pendentes antes de aprovar em lote.
      for (const item of items.filter((i) => i.status === "review")) {
        await runUpdateText({ data: { id: item.id, contentText: item.contentText } });
      }
      return runApproveBatch({ data: { batchId: batchId! } });
    },
    onSuccess: async (res: any) => {
      toast.success(`${res.approved} postagem(ns) aprovada(s)${res.failed ? `, ${res.failed} falharam` : ""}.`);
      await refetchBatch();
    },
    onError: (err: any) => toast.error(err.message || "Falha ao aprovar o lote."),
  });

  const reviewCount = items.filter((i) => i.status === "review").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) discardCurrentBatch();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Criar fluxo com IA
          </DialogTitle>
          <DialogDescription>
            Gera postagens pra WhatsApp com base no melhor anúncio, no post de ontem no Instagram e em promoções ativas no site — fica numa fila de revisão antes de sair.
          </DialogDescription>
        </DialogHeader>

        {!batchId && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>O que gerar</Label>
              <Tabs value={mode} onValueChange={(v) => setMode(v as "day" | "week")}>
                <TabsList>
                  <TabsTrigger value="day">Um dia</TabsTrigger>
                  <TabsTrigger value="week">Uma semana (7 postagens)</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{mode === "week" ? "Começa em" : "Data"}</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Horário (todas as postagens)</Label>
                <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vincular à campanha (fluxo)</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma campanha" />
                </SelectTrigger>
                <SelectContent>
                  {(campaigns ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {campaigns && campaigns.length === 0 && (
                <p className="text-xs text-warning">Nenhuma campanha criada ainda no Fluxo de Envio. Crie uma primeiro.</p>
              )}
            </div>

            {error && <p className="text-sm text-critical">{error}</p>}

            <div className="flex justify-end border-t border-border pt-4">
              <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending || !campaignId}>
                {generateMut.isPending ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                {generateMut.isPending ? "Gerando..." : `Gerar ${mode === "week" ? "7 postagens" : "postagem"}`}
              </Button>
            </div>
          </div>
        )}

        {batchId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <p className="text-sm text-muted-foreground">{items.length} postagem(ns) geradas — {reviewCount} aguardando revisão</p>
              {reviewCount > 0 && (
                <Button size="sm" onClick={() => approveAllMut.mutate()} disabled={approveAllMut.isPending} className="gap-1.5">
                  {approveAllMut.isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Aprovar todos ({reviewCount})
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
                  onReject={() => handleReject(item.id)}
                  busy={busyId === item.id}
                />
              ))}
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <Button variant="outline" onClick={async () => { await discardCurrentBatch(); setBatchId(null); setItems([]); }}>
                Gerar outro lote
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
