import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, RefreshCw, ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { generateAiRoutineDraftFn, createAiSendRoutineFn } from "@/lib/ai-send-routines.functions";
import { listEnvioCampaigns } from "@/lib/envio-campaigns.functions";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Recurrence = "once" | "daily" | "weekly" | "monthly";

export function AiRoutineDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [draft, setDraft] = useState<{ contentText: string; contentImageUrl: string | null; sourceSummary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string>("");
  const [recurrence, setRecurrence] = useState<Recurrence>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("10:00");
  const [sendNow, setSendNow] = useState(false);

  const runGenerate = useServerFn(generateAiRoutineDraftFn);
  const runCreate = useServerFn(createAiSendRoutineFn);
  const runListCampaigns = useServerFn(listEnvioCampaigns);

  const { data: campaigns } = useQuery({ queryKey: ["envio-campaigns"], queryFn: () => runListCampaigns(), enabled: open });

  const generateMut = useMutation({
    mutationFn: () => runGenerate(),
    onSuccess: (res: any) => {
      if (res.success) {
        setDraft(res.draft);
        setError(null);
      } else {
        setError(res.error || "Falha ao gerar o rascunho.");
      }
    },
    onError: (err: any) => setError(err.message || "Falha ao gerar o rascunho."),
  });

  useEffect(() => {
    if (open) {
      setDraft(null);
      setError(null);
      generateMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!campaignId && campaigns && campaigns.length > 0) setCampaignId(campaigns[0]!.id);
  }, [campaigns, campaignId]);

  const createMut = useMutation({
    mutationFn: () => {
      const campaign = campaigns?.find((c: any) => c.id === campaignId);
      if (!draft || !campaign) throw new Error("Selecione uma campanha.");
      return runCreate({
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          contentText: draft.contentText,
          contentImageUrl: draft.contentImageUrl,
          sourceSummary: draft.sourceSummary,
          recurrence,
          dayOfWeek: recurrence === "weekly" ? dayOfWeek : undefined,
          dayOfMonth: recurrence === "monthly" ? dayOfMonth : undefined,
          timeOfDay,
          sendNow,
        },
      });
    },
    onSuccess: (res: any) => {
      if (res.success) {
        const groupsMsg = `${res.groupCount} grupo${res.groupCount === 1 ? "" : "s"}`;
        if (res.sentImmediately) {
          toast.success(`Mensagem enviada agora pra ${groupsMsg}.`);
        } else {
          toast.success(`Agendado — vai sair pra ${groupsMsg} na data marcada (aba Envios do Fluxo de Envio).`);
        }
        onOpenChange(false);
      } else {
        toast.error(res.error || "Falha ao criar a rotina.");
      }
    },
    onError: (err: any) => toast.error(err.message || "Falha ao criar a rotina."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Criar fluxo com IA
          </DialogTitle>
          <DialogDescription>
            A IA analisa seu anúncio com melhor ROAS e seu post com mais engajamento no Instagram dos últimos 30
            dias, e monta uma mensagem pronta pra WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {generateMut.isPending && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analisando criativos e escrevendo a mensagem...</p>
          </div>
        )}

        {!generateMut.isPending && error && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-critical">{error}</p>
            <Button variant="outline" size="sm" onClick={() => generateMut.mutate()}>
              Tentar de novo
            </Button>
          </div>
        )}

        {!generateMut.isPending && draft && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Baseado em: </span>
              {draft.sourceSummary}
            </div>

            {draft.contentImageUrl ? (
              <img src={draft.contentImageUrl} alt="Prévia" className="max-h-56 w-full rounded-lg border border-border object-cover" />
            ) : (
              <div className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                <ImageOff className="size-4" /> Sem imagem — só texto
              </div>
            )}

            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea value={draft.contentText} onChange={(e) => setDraft((d) => (d ? { ...d, contentText: e.target.value } : d))} rows={4} />
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

            <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <Checkbox checked={sendNow} onCheckedChange={(v) => setSendNow(Boolean(v))} />
              <span>
                <span className="font-medium">Enviar agora</span>
                <span className="block text-xs text-muted-foreground">Dispara a primeira mensagem na hora, direto pra aba Envios do Fluxo de Envio.</span>
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{sendNow ? "Depois, repete" : "Recorrência"}</Label>
                <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Uma vez{sendNow ? " (não repete)" : ""}</SelectItem>
                    <SelectItem value="daily">Diária</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!sendNow && (
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
                </div>
              )}
            </div>

            {recurrence === "weekly" && !sendNow && (
              <div className="space-y-2">
                <Label>Dia da semana</Label>
                <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((w, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {recurrence === "monthly" && !sendNow && (
              <div className="space-y-2">
                <Label>Dia do mês</Label>
                <Input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">Máx. 28 pra funcionar em qualquer mês.</p>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
                Gerar outro rascunho
              </Button>
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !campaignId || !draft.contentText.trim()}>
                {createMut.isPending ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                Criar rotina
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
