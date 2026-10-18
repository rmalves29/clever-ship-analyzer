import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Sparkles } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { listEnvioCampaigns, getCampaignGroupLinks, setCampaignGroupLinks, updateCampaignGroupWeight, updateEnvioCampaign, spawnGroupForCampaign } from "@/lib/envio-campaigns.functions";
import { listEnvioGroups, updateEnvioGroup } from "@/lib/envio-groups.functions";

function clampWeight(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, px: 1.5, py: 1, textAlign: "center" }}>
      <Typography sx={{ fontWeight: 700, fontSize: 18, ...(color ? { color } : {}) }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export function CampaignDetailDialog({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const listCampaigns = useServerFn(listEnvioCampaigns);
  const getLinks = useServerFn(getCampaignGroupLinks);
  const setLinks = useServerFn(setCampaignGroupLinks);
  const updateWeight = useServerFn(updateCampaignGroupWeight);
  const updateCampaign = useServerFn(updateEnvioCampaign);
  const spawnNow = useServerFn(spawnGroupForCampaign);
  const listGroups = useServerFn(listEnvioGroups);
  const updateGroup = useServerFn(updateEnvioGroup);

  const { data: campaigns } = useQuery({ queryKey: ["envio-campaigns"], queryFn: () => listCampaigns() });
  const campaign = campaigns?.find((c) => c.id === campaignId);

  const { data: links } = useQuery({ queryKey: ["envio-campaign-links", campaignId], queryFn: () => getLinks({ data: { campaignId } }) });
  const { data: groups } = useQuery({ queryKey: ["envio-groups"], queryFn: () => listGroups() });

  const [pixelId, setPixelId] = useState("");
  const [autoSpawnEnabled, setAutoSpawnEnabled] = useState(false);
  const [spawnMargin, setSpawnMargin] = useState(3);
  const [templateNameBase, setTemplateNameBase] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateImageUrl, setTemplateImageUrl] = useState("");
  const [templateMax, setTemplateMax] = useState(1000);
  const [manageOpen, setManageOpen] = useState(false);
  const [pendingGroupIds, setPendingGroupIds] = useState<Set<string>>(new Set());
  const [groupSearch, setGroupSearch] = useState("");
  const [weights, setWeights] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!campaign) return;
    setPixelId(campaign.facebook_pixel_id ?? "");
    setAutoSpawnEnabled(campaign.auto_spawn_enabled);
    setSpawnMargin(campaign.spawn_margin);
    setTemplateNameBase(campaign.group_template?.name_base ?? campaign.name);
    setTemplateDescription(campaign.group_template?.description ?? "");
    setTemplateImageUrl(campaign.group_template?.image_url ?? "");
    setTemplateMax(campaign.group_template?.max_participants ?? 1000);
  }, [campaign?.id]);

  // O original só mostra os vínculos de grupos onde somos admin e que estão ativos.
  const groupsById = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g])), [groups]);
  const visibleLinks = useMemo(
    () => (links ?? []).filter((l) => {
      const g = groupsById.get(l.group_id);
      return Boolean(g && g.is_admin && g.is_active);
    }),
    [links, groupsById],
  );

  useEffect(() => {
    if (!links) return;
    setPendingGroupIds(new Set(visibleLinks.map((l) => l.group_id)));
    setWeights(Object.fromEntries(visibleLinks.map((l) => [l.group_id, l.weight_percent == null ? "" : String(l.weight_percent)])));
  }, [links, groups]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["envio-campaigns"] });
    qc.invalidateQueries({ queryKey: ["envio-campaign-links", campaignId] });
    qc.invalidateQueries({ queryKey: ["envio-groups"] });
  };

  const savePixelMut = useMutation({
    mutationFn: () => updateCampaign({ data: { id: campaignId, facebook_pixel_id: pixelId.trim() || null } }),
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
          // O servidor mescla com o molde atual (números-semente e outros campos configurados no Cartzy ficam).
          group_template: {
            name_base: templateNameBase,
            description: templateDescription,
            image_url: templateImageUrl,
            max_participants: templateMax,
          },
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
        data: {
          campaignId,
          // Mantém o peso de quem continua marcado; os recém-marcados entram sem peso.
          links: Array.from(pendingGroupIds).map((group_id) => ({ group_id, weight_percent: clampWeight(weights[group_id] ?? "") })),
        },
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
    onError: (e: Error) => {
      toast.error(e.message);
      invalidate();
    },
  });

  const entryMut = useMutation({
    mutationFn: (input: { id: string; is_entry_open: boolean }) => updateGroup({ data: input }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (!campaign) return null;

  const adminGroups = (groups ?? []).filter((g) => g.is_admin && g.is_active);
  const filteredGroups = adminGroups
    .filter((g) => g.group_name.toLowerCase().includes(groupSearch.trim().toLowerCase()))
    .sort((a, b) => b.participant_count - a.participant_count);
  const weightSum = visibleLinks.reduce((acc, l) => acc + (clampWeight(weights[l.group_id] ?? "") ?? 0), 0);
  const stats = campaign.stats;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { maxHeight: "85vh" } } }}>
      <DialogTitle>{campaign.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          {campaign.public_url && (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Link de convite
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField size="small" fullWidth value={campaign.public_url} slotProps={{ input: { readOnly: true } }} sx={{ "& input": { fontSize: 12 } }} />
                <IconButton
                  size="small"
                  sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, flexShrink: 0 }}
                  onClick={() => {
                    void navigator.clipboard.writeText(campaign.public_url ?? "");
                    toast.success("Link copiado.");
                  }}
                >
                  <Copy size={14} />
                </IconButton>
              </Stack>
            </Box>
          )}

          {stats && (
            <Grid container spacing={1}>
              {[
                { label: "Clicks", value: stats.clicks.toLocaleString("pt-BR") },
                { label: "Entraram", value: stats.entries.toLocaleString("pt-BR") },
                { label: "% de entrada", value: `${stats.entryRate.toFixed(0)}%` },
                { label: "Saíram", value: stats.exits.toLocaleString("pt-BR"), color: "var(--mui-palette-error-main)" },
                { label: "Participantes", value: stats.participants.toLocaleString("pt-BR") },
                { label: "Grupos", value: String(stats.groupCount) },
                { label: "Grupos cheios", value: String(stats.fullGroups) },
                { label: "Disponíveis", value: String(stats.availableGroups) },
              ].map((card) => (
                <Grid key={card.label} size={{ xs: 6, sm: 3 }}>
                  <StatCard label={card.label} value={card.value} {...(card.color ? { color: card.color } : {})} />
                </Grid>
              ))}
            </Grid>
          )}

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
            <Typography variant="caption" color="text.secondary">
              Rastreia a conversão (evento Lead) nos links de redirecionamento desta campanha.
            </Typography>
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
                  <TextField fullWidth size="small" type="number" label="Criar novo quando restar (vagas)" value={spawnMargin} onChange={(e) => setSpawnMargin(Number(e.target.value))} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth size="small" type="number" label="Limite de participantes do clone" value={templateMax} onChange={(e) => setTemplateMax(Number(e.target.value))} />
                </Grid>
                <Grid size={12}>
                  <TextField fullWidth size="small" label="Nome base do grupo clonado" value={templateNameBase} onChange={(e) => setTemplateNameBase(e.target.value)} />
                </Grid>
                <Grid size={12}>
                  <TextField fullWidth size="small" multiline minRows={2} label="Descrição do grupo (opcional)" value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="Descrição aplicada a cada grupo novo..." />
                </Grid>
                <Grid size={12}>
                  <TextField fullWidth size="small" label="URL da imagem do grupo (opcional)" value={templateImageUrl} onChange={(e) => setTemplateImageUrl(e.target.value)} placeholder="https://..." />
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
                Grupos vinculados ({visibleLinks.length})
              </Typography>
              <Button size="small" variant="outline" onClick={() => setManageOpen(!manageOpen)}>
                {manageOpen ? "Fechar" : "Gerenciar grupos"}
              </Button>
            </Stack>

            {manageOpen ? (
              <Stack spacing={1} sx={{ mt: 1 }}>
                <TextField size="small" fullWidth value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Buscar grupo por nome..." />
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
                            {g.participant_count}/{g.max_participants}
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
              <Stack spacing={1.25} sx={{ mt: 1 }}>
                {visibleLinks.map((l) => {
                  const g = groupsById.get(l.group_id);
                  if (!g) return null;
                  return (
                    <Stack key={l.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.group_name}
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                          <Typography variant="caption" color="text.secondary">
                            {g.participant_count}/{g.max_participants}
                          </Typography>
                          {!g.is_entry_open && <Chip size="small" label="Fechado" color="warning" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
                          {!g.invite_link && (
                            <Typography variant="caption" color="warning.main">
                              Falta adicionar o link
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                      <Switch
                        size="small"
                        checked={g.is_entry_open}
                        title="Ativar/desativar entrada de novos membros neste grupo"
                        onChange={(e) => entryMut.mutate({ id: g.id, is_entry_open: e.target.checked })}
                      />
                      <TextField
                        size="small"
                        type="number"
                        sx={{ width: 96 }}
                        value={weights[l.group_id] ?? ""}
                        placeholder="peso %"
                        slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
                        onChange={(e) => setWeights((prev) => ({ ...prev, [l.group_id]: e.target.value }))}
                        onBlur={() => {
                          const value = clampWeight(weights[l.group_id] ?? "");
                          setWeights((prev) => ({ ...prev, [l.group_id]: value == null ? "" : String(value) }));
                          if (value !== (l.weight_percent ?? null)) weightMut.mutate({ groupId: l.group_id, weightPercent: value });
                        }}
                      />
                    </Stack>
                  );
                })}
                {visibleLinks.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Nenhum grupo vinculado.
                  </Typography>
                )}
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
