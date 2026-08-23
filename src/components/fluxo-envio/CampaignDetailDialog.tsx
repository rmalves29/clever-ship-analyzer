import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles } from "lucide-react";
import { listEnvioCampaigns, getCampaignGroupLinks, setCampaignGroupLinks, updateCampaignGroupWeight, updateEnvioCampaign, spawnGroupForCampaign } from "@/lib/envio-campaigns.functions";
import { listEnvioGroups } from "@/lib/envio-groups.functions";

export function CampaignDetailDialog({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const listCampaigns = useServerFn(listEnvioCampaigns);
  const getLinks = useServerFn(getCampaignGroupLinks);
  const setLinks = useServerFn(setCampaignGroupLinks);
  const updateWeight = useServerFn(updateCampaignGroupWeight);
  const updateCampaign = useServerFn(updateEnvioCampaign);
  const spawnNow = useServerFn(spawnGroupForCampaign);
  const listGroups = useServerFn(listEnvioGroups);

  const { data: campaigns } = useQuery({ queryKey: ["envio-campaigns"], queryFn: () => listCampaigns() });
  const campaign = campaigns?.find((c) => c.id === campaignId);

  const { data: links } = useQuery({ queryKey: ["envio-campaign-links", campaignId], queryFn: () => getLinks({ data: { campaignId } }) });
  const { data: groups } = useQuery({ queryKey: ["envio-groups"], queryFn: () => listGroups() });

  const [pixelId, setPixelId] = useState("");
  const [autoSpawnEnabled, setAutoSpawnEnabled] = useState(false);
  const [spawnMargin, setSpawnMargin] = useState(3);
  const [templateNameBase, setTemplateNameBase] = useState("");
  const [templateMax, setTemplateMax] = useState(1000);
  const [manageOpen, setManageOpen] = useState(false);
  const [pendingGroupIds, setPendingGroupIds] = useState<Set<string>>(new Set());
  const [groupSearch, setGroupSearch] = useState("");

  useEffect(() => {
    if (!campaign) return;
    setPixelId(campaign.facebook_pixel_id ?? "");
    setAutoSpawnEnabled(campaign.auto_spawn_enabled);
    setSpawnMargin(campaign.spawn_margin);
    setTemplateNameBase(campaign.group_template?.name_base ?? campaign.name);
    setTemplateMax(campaign.group_template?.max_participants ?? 1000);
  }, [campaign?.id]);

  useEffect(() => {
    if (links) setPendingGroupIds(new Set(links.map((l) => l.group_id)));
  }, [links]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["envio-campaigns"] });
    qc.invalidateQueries({ queryKey: ["envio-campaign-links", campaignId] });
  };

  const savePixelMut = useMutation({
    mutationFn: () => updateCampaign({ data: { id: campaignId, facebook_pixel_id: pixelId } }),
    onSuccess: () => {
      toast.success("Pixel salvo.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAutoSpawnMut = useMutation({
    mutationFn: () =>
      updateCampaign({
        data: {
          id: campaignId,
          auto_spawn_enabled: autoSpawnEnabled,
          spawn_margin: spawnMargin,
          group_template: { name_base: templateNameBase, max_participants: templateMax },
        },
      }),
    onSuccess: () => {
      toast.success("Configuração de auto-clonagem salva.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const spawnNowMut = useMutation({
    mutationFn: async () => {
      await saveAutoSpawnMut.mutateAsync();
      return spawnNow({ data: { campaignId } });
    },
    onSuccess: (r) => {
      if (r.skipped === "debounce") toast.info("Aguarde um pouco — um grupo já foi criado há menos de 2 minutos.");
      else toast.success("Novo grupo criado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveLinksMut = useMutation({
    mutationFn: () =>
      setLinks({
        data: { campaignId, links: Array.from(pendingGroupIds).map((group_id) => ({ group_id, weight_percent: null })) },
      }),
    onSuccess: () => {
      toast.success("Grupos vinculados salvos.");
      setManageOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weightMut = useMutation({
    mutationFn: (input: { groupId: string; weightPercent: number | null }) =>
      updateWeight({ data: { campaignId, groupId: input.groupId, weightPercent: input.weightPercent } }),
    onSuccess: invalidate,
  });

  if (!campaign) return null;

  const adminGroups = (groups ?? []).filter((g) => g.is_admin && g.is_active);
  const filteredGroups = adminGroups.filter((g) => g.group_name.toLowerCase().includes(groupSearch.trim().toLowerCase()));
  const weightSum = (links ?? []).reduce((acc, l) => acc + (l.weight_percent ?? 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold">Facebook Pixel</p>
            <div className="mt-1 flex gap-2">
              <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="ID do pixel" />
              <Button variant="outline" onClick={() => savePixelMut.mutate()} disabled={savePixelMut.isPending}>
                Salvar
              </Button>
            </div>
          </div>

          <div className="surface-card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4" /> Auto-clonagem de grupo
              </p>
              <Switch checked={autoSpawnEnabled} onCheckedChange={setAutoSpawnEnabled} />
            </div>
            {autoSpawnEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Criar novo quando restar (vagas)</Label>
                  <Input type="number" value={spawnMargin} onChange={(e) => setSpawnMargin(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Máx. participantes do clone</Label>
                  <Input type="number" value={templateMax} onChange={(e) => setTemplateMax(Number(e.target.value))} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Nome base do grupo</Label>
                  <Input value={templateNameBase} onChange={(e) => setTemplateNameBase(e.target.value)} />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => saveAutoSpawnMut.mutate()} disabled={saveAutoSpawnMut.isPending}>
                Salvar configuração
              </Button>
              {autoSpawnEnabled && (
                <Button size="sm" onClick={() => spawnNowMut.mutate()} disabled={spawnNowMut.isPending}>
                  Criar grupo agora
                </Button>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Grupos vinculados ({(links ?? []).length})</p>
              <Button size="sm" variant="outline" onClick={() => setManageOpen(!manageOpen)}>
                {manageOpen ? "Fechar" : "Gerenciar grupos"}
              </Button>
            </div>

            {manageOpen ? (
              <div className="mt-2 space-y-2">
                <Input
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Buscar grupo..."
                  className="h-8"
                />
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {filteredGroups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox
                        checked={pendingGroupIds.has(g.id)}
                        onCheckedChange={(checked) => {
                          setPendingGroupIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(g.id);
                            else next.delete(g.id);
                            return next;
                          });
                        }}
                      />
                      <span className="flex-1 truncate">{g.group_name}</span>
                      <span className="text-xs text-muted-foreground">{g.participant_count} participantes</span>
                    </label>
                  ))}
                  {filteredGroups.length === 0 && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
                  )}
                </div>
                <Button size="sm" onClick={() => saveLinksMut.mutate()} disabled={saveLinksMut.isPending}>
                  Salvar ({pendingGroupIds.size} grupos)
                </Button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {(links ?? []).map((l) => {
                  const g = (groups ?? []).find((gr) => gr.id === l.group_id);
                  return (
                    <div key={l.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{g?.group_name ?? l.group_id}</span>
                      <Input
                        type="number"
                        className="h-8 w-20"
                        defaultValue={l.weight_percent ?? ""}
                        placeholder="peso %"
                        onBlur={(e) => weightMut.mutate({ groupId: l.group_id, weightPercent: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                  );
                })}
                <p className={`text-xs ${weightSum !== 100 && weightSum !== 0 ? "text-warning" : "text-muted-foreground"}`}>
                  Soma: {weightSum}% {weightSum === 0 && "(distribuição igualitária)"}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
