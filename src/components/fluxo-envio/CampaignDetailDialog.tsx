import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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
  const filteredGroups = adminGroups
    .filter((g) => g.group_name.toLowerCase().includes(groupSearch.trim().toLowerCase()))
    .sort((a, b) => b.participant_count - a.participant_count);
  const weightSum = (links ?? []).reduce((acc, l) => acc + (l.weight_percent ?? 0), 0);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { maxHeight: "85vh" } } }}>
      <DialogTitle>{campaign.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Facebook Pixel
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField size="small" fullWidth value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="ID do pixel" />
              <Button variant="outline" onClick={() => savePixelMut.mutate()} disabled={savePixelMut.isPending}>
                Salvar
              </Button>
            </Stack>
          </Box>

          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Sparkles size={16} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Auto-clonagem de grupo
                </Typography>
              </Stack>
              <Switch checked={autoSpawnEnabled} onChange={(e) => setAutoSpawnEnabled(e.target.checked)} />
            </Stack>
            {autoSpawnEnabled && (
              <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Criar novo quando restar (vagas)"
                    value={spawnMargin}
                    onChange={(e) => setSpawnMargin(Number(e.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Máx. participantes do clone"
                    value={templateMax}
                    onChange={(e) => setTemplateMax(Number(e.target.value))}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField fullWidth size="small" label="Nome base do grupo" value={templateNameBase} onChange={(e) => setTemplateNameBase(e.target.value)} />
                </Grid>
              </Grid>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button size="small" variant="outline" onClick={() => saveAutoSpawnMut.mutate()} disabled={saveAutoSpawnMut.isPending}>
                Salvar configuração
              </Button>
              {autoSpawnEnabled && (
                <Button size="small" variant="contained" onClick={() => spawnNowMut.mutate()} disabled={spawnNowMut.isPending}>
                  Criar grupo agora
                </Button>
              )}
            </Stack>
          </Box>

          <Box>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Grupos vinculados ({(links ?? []).length})
              </Typography>
              <Button size="small" variant="outline" onClick={() => setManageOpen(!manageOpen)}>
                {manageOpen ? "Fechar" : "Gerenciar grupos"}
              </Button>
            </Stack>

            {manageOpen ? (
              <Stack spacing={1} sx={{ mt: 1 }}>
                <TextField size="small" fullWidth value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Buscar grupo..." />
                <Box sx={{ maxHeight: 256, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1 }}>
                  {filteredGroups.map((g) => (
                    <FormControlLabel
                      key={g.id}
                      sx={{ display: "flex", width: "100%", m: 0, borderRadius: 1, px: 1, py: 0.5, "&:hover": { bgcolor: "action.hover" } }}
                      control={
                        <Checkbox
                          size="small"
                          checked={pendingGroupIds.has(g.id)}
                          onChange={(e) => {
                            setPendingGroupIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(g.id);
                              else next.delete(g.id);
                              return next;
                            });
                          }}
                        />
                      }
                      label={
                        <Stack direction="row" sx={{ flex: 1, justifyContent: "space-between", minWidth: 0 }}>
                          <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {g.group_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 1 }}>
                            {g.participant_count} participantes
                          </Typography>
                        </Stack>
                      }
                    />
                  ))}
                  {filteredGroups.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 0.5 }}>
                      Nenhum grupo encontrado.
                    </Typography>
                  )}
                </Box>
                <Button size="small" variant="contained" onClick={() => saveLinksMut.mutate()} disabled={saveLinksMut.isPending}>
                  Salvar ({pendingGroupIds.size} grupos)
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1} sx={{ mt: 1 }}>
                {(links ?? []).map((l) => {
                  const g = (groups ?? []).find((gr) => gr.id === l.group_id);
                  return (
                    <Stack key={l.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="body2" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g?.group_name ?? l.group_id}
                      </Typography>
                      <TextField
                        size="small"
                        type="number"
                        sx={{ width: 96 }}
                        defaultValue={l.weight_percent ?? ""}
                        placeholder="peso %"
                        onBlur={(e) => weightMut.mutate({ groupId: l.group_id, weightPercent: e.target.value ? Number(e.target.value) : null })}
                      />
                    </Stack>
                  );
                })}
                <Typography variant="caption" sx={{ color: weightSum !== 100 && weightSum !== 0 ? "warning.main" : "text.secondary" }}>
                  Soma: {weightSum}% {weightSum === 0 && "(distribuição igualitária)"}
                </Typography>
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
