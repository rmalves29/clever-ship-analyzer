import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import {
  listEnvioAutoMessages,
  createEnvioAutoMessage,
  updateEnvioAutoMessage,
  deleteEnvioAutoMessage,
  listEnvioReturnAutomations,
  createEnvioReturnAutomation,
  updateEnvioReturnAutomation,
  deleteEnvioReturnAutomation,
  getEnvioReturnStats,
} from "@/lib/envio-auto-messages.functions";
import { listEnvioGroups } from "@/lib/envio-groups.functions";
import { listEnvioCampaigns } from "@/lib/envio-campaigns.functions";

function AutoMessagesSection() {
  const qc = useQueryClient();
  const list = useServerFn(listEnvioAutoMessages);
  const create = useServerFn(createEnvioAutoMessage);
  const update = useServerFn(updateEnvioAutoMessage);
  const del = useServerFn(deleteEnvioAutoMessage);

  const { data: messages } = useQuery({ queryKey: ["envio-auto-messages"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState<"join" | "leave">("join");
  const [text, setText] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["envio-auto-messages"] });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: { group_id: null, campaign_id: null, event_type: eventType, content_type: "text", content_text: text, media_url: null, is_active: true },
      }),
    onSuccess: () => {
      toast.success("Mensagem automática criada.");
      setOpen(false);
      setText("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) => update({ data: input }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: invalidate });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Mensagens de entrada/saída</p>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
          <Plus className="size-4" /> Nova
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Use {"{{nome}}"} na mensagem pra personalizar.</p>
      <div className="space-y-2">
        {(messages ?? []).map((m) => (
          <div key={m.id} className="surface-card flex items-center gap-3 p-3">
            <span className="text-xs font-medium">{m.event_type === "join" ? "Entrada" : "Saída"}</span>
            <p className="flex-1 truncate text-sm text-muted-foreground">{m.content_text}</p>
            <Switch checked={m.is_active} onCheckedChange={(v) => toggleMut.mutate({ id: m.id, is_active: v })} />
            <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(m.id)}>
              <Trash2 className="size-4 text-critical" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova mensagem automática</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant={eventType === "join" ? "default" : "outline"} onClick={() => setEventType("join")}>
                Entrada
              </Button>
              <Button size="sm" variant={eventType === "leave" ? "default" : "outline"} onClick={() => setEventType("leave")}>
                Saída
              </Button>
            </div>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Olá {{nome}}, seja bem-vindo(a) ao {{grupo}}!" />
          </div>
          <DialogFooter>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !text}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReturnAutomationSection() {
  const qc = useQueryClient();
  const list = useServerFn(listEnvioReturnAutomations);
  const create = useServerFn(createEnvioReturnAutomation);
  const update = useServerFn(updateEnvioReturnAutomation);
  const del = useServerFn(deleteEnvioReturnAutomation);
  const stats = useServerFn(getEnvioReturnStats);
  const listGroups = useServerFn(listEnvioGroups);
  const listCampaigns = useServerFn(listEnvioCampaigns);

  const { data: automations } = useQuery({ queryKey: ["envio-return-automations"], queryFn: () => list() });
  const { data: statsData } = useQuery({ queryKey: ["envio-return-stats"], queryFn: () => stats() });
  const { data: groups } = useQuery({ queryKey: ["envio-groups"], queryFn: () => listGroups() });
  const { data: campaigns } = useQuery({ queryKey: ["envio-campaigns"], queryFn: () => listCampaigns() });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"groups" | "campaigns">("groups");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [delayMinutes, setDelayMinutes] = useState(60);
  const [validityDays, setValidityDays] = useState(7);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [inviteMessage, setInviteMessage] = useState("Sentimos sua falta, {{nome}}! Volte pro grupo: {{link_grupo}}");
  const [rewardMessage, setRewardMessage] = useState("Bem-vindo(a) de volta, {{nome}}! Use o cupom {{cupom}} 🎁");
  const [couponCode, setCouponCode] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["envio-return-automations"] });
    qc.invalidateQueries({ queryKey: ["envio-return-stats"] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          group_ids: scope === "groups" ? Array.from(selectedIds) : [],
          campaign_ids: scope === "campaigns" ? Array.from(selectedIds) : [],
          delay_minutes: delayMinutes,
          invite_message: inviteMessage,
          reward_message: rewardMessage,
          coupon_code: couponCode,
          validity_days: validityDays,
          cooldown_hours: cooldownHours,
          is_active: true,
        },
      }),
    onSuccess: () => {
      toast.success("Automação de retorno criada.");
      setOpen(false);
      setName("");
      setSelectedIds(new Set());
      setCouponCode("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({ mutationFn: (input: { id: string; is_active: boolean }) => update({ data: input }), onSuccess: invalidate });
  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Apagada — convites pendentes foram cancelados.");
      invalidate();
    },
  });

  const successPct = statsData && statsData.leftTotal > 0 ? ((statsData.rewardedTotal / statsData.leftTotal) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Automação de retorno (win-back)</p>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
          <Plus className="size-4" /> Nova
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="surface-card p-3">
          <p className="text-2xl font-bold">{statsData?.leftTotal ?? 0}</p>
          <p className="text-xs text-muted-foreground">Saíram do grupo</p>
        </div>
        <div className="surface-card p-3">
          <p className="text-2xl font-bold">{statsData?.rewardedTotal ?? 0}</p>
          <p className="text-xs text-muted-foreground">Retornaram</p>
        </div>
        <div className="surface-card p-3">
          <p className="text-2xl font-bold">{successPct}%</p>
          <p className="text-xs text-muted-foreground">Taxa de retorno</p>
        </div>
      </div>

      <div className="space-y-2">
        {(automations ?? []).map((a) => (
          <div key={a.id} className="surface-card flex items-center gap-3 p-3">
            <p className="flex-1 text-sm font-medium">{a.name}</p>
            <span className="text-xs text-muted-foreground">cupom: {a.coupon_code}</span>
            <Switch checked={a.is_active} onCheckedChange={(v) => toggleMut.mutate({ id: a.id, is_active: v })} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (confirm(`Apagar "${a.name}"? Convites pendentes serão cancelados.`)) deleteMut.mutate(a.id);
              }}
            >
              <Trash2 className="size-4 text-critical" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova automação de retorno</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={scope === "groups" ? "default" : "outline"} onClick={() => setScope("groups")}>
                Grupos
              </Button>
              <Button size="sm" variant={scope === "campaigns" ? "default" : "outline"} onClick={() => setScope("campaigns")}>
                Campanhas
              </Button>
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {(scope === "groups" ? groups ?? [] : campaigns ?? []).map((item: any) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={(checked) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      });
                    }}
                  />
                  {item.group_name ?? item.name}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Atraso (min)</Label>
                <Input type="number" value={delayMinutes} onChange={(e) => setDelayMinutes(Number(e.target.value))} />
              </div>
              <div>
                <Label>Validade (dias)</Label>
                <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
              </div>
              <div>
                <Label>Cooldown (h)</Label>
                <Input type="number" value={cooldownHours} onChange={(e) => setCooldownHours(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label>Mensagem de convite (após sair)</Label>
              <Textarea value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} rows={2} />
              <p className="mt-1 text-xs text-muted-foreground">Variáveis: {"{{nome}}, {{grupo}}, {{link_grupo}}"} — envios respeitam 1 msg/5s.</p>
            </div>
            <div>
              <Label>Mensagem de recompensa (ao retornar)</Label>
              <Textarea value={rewardMessage} onChange={(e) => setRewardMessage(e.target.value)} rows={2} />
              <p className="mt-1 text-xs text-muted-foreground">Variáveis: {"{{nome}}, {{cupom}}, {{grupo}}"}</p>
            </div>
            <div>
              <Label>Código do cupom</Label>
              <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !name || !couponCode}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AutoMessagesManager() {
  return (
    <div className="space-y-8 py-4">
      <AutoMessagesSection />
      <ReturnAutomationSection />
    </div>
  );
}
