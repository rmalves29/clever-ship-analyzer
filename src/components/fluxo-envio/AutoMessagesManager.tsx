import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography sx={{ fontWeight: 600 }}>Mensagens de entrada/saída</Typography>
        <Button size="small" variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
          Nova
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Use {"{{nome}}"} na mensagem pra personalizar.
      </Typography>
      <Stack spacing={1}>
        {(messages ?? []).map((m) => (
          <Stack key={m.id} direction="row" spacing={1.5} sx={{ alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              {m.event_type === "join" ? "Entrada" : "Saída"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.content_text}
            </Typography>
            <Switch size="small" checked={m.is_active} onChange={(e) => toggleMut.mutate({ id: m.id, is_active: e.target.checked })} />
            <IconButton size="small" onClick={() => deleteMut.mutate(m.id)}>
              <Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" />
            </IconButton>
          </Stack>
        ))}
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nova mensagem automática</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant={eventType === "join" ? "contained" : "outline"} onClick={() => setEventType("join")}>
                Entrada
              </Button>
              <Button size="small" variant={eventType === "leave" ? "contained" : "outline"} onClick={() => setEventType("leave")}>
                Saída
              </Button>
            </Stack>
            <TextField fullWidth multiline rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Olá {{nome}}, seja bem-vindo(a) ao {{grupo}}!" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => createMut.mutate()} disabled={createMut.isPending || !text}>
            Criar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
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
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography sx={{ fontWeight: 600 }}>Automação de retorno (win-back)</Typography>
        <Button size="small" variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
          Nova
        </Button>
      </Stack>

      <Grid container spacing={1.5}>
        <Grid size={4}>
          <Card variant="outlined" sx={{ textAlign: "center" }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {statsData?.leftTotal ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Saíram do grupo
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={4}>
          <Card variant="outlined" sx={{ textAlign: "center" }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {statsData?.rewardedTotal ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Retornaram
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={4}>
          <Card variant="outlined" sx={{ textAlign: "center" }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {successPct}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Taxa de retorno
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Stack spacing={1}>
        {(automations ?? []).map((a) => (
          <Stack key={a.id} direction="row" spacing={1.5} sx={{ alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
              {a.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              cupom: {a.coupon_code}
            </Typography>
            <Switch size="small" checked={a.is_active} onChange={(e) => toggleMut.mutate({ id: a.id, is_active: e.target.checked })} />
            <IconButton
              size="small"
              onClick={() => {
                if (confirm(`Apagar "${a.name}"? Convites pendentes serão cancelados.`)) deleteMut.mutate(a.id);
              }}
            >
              <Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" />
            </IconButton>
          </Stack>
        ))}
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { maxHeight: "85vh" } } }}>
        <DialogTitle>Nova automação de retorno</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField fullWidth size="small" label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <Stack direction="row" spacing={1}>
              <Button size="small" variant={scope === "groups" ? "contained" : "outline"} onClick={() => setScope("groups")}>
                Grupos
              </Button>
              <Button size="small" variant={scope === "campaigns" ? "contained" : "outline"} onClick={() => setScope("campaigns")}>
                Campanhas
              </Button>
            </Stack>
            <Box sx={{ maxHeight: 128, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1 }}>
              {(scope === "groups" ? groups ?? [] : campaigns ?? []).map((item: any) => (
                <FormControlLabel
                  key={item.id}
                  sx={{ display: "flex", width: "100%", m: 0 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        });
                      }}
                    />
                  }
                  label={<Typography variant="body2">{item.group_name ?? item.name}</Typography>}
                />
              ))}
            </Box>
            <Grid container spacing={1.5}>
              <Grid size={4}>
                <TextField fullWidth size="small" type="number" label="Atraso (min)" value={delayMinutes} onChange={(e) => setDelayMinutes(Number(e.target.value))} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth size="small" type="number" label="Validade (dias)" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth size="small" type="number" label="Cooldown (h)" value={cooldownHours} onChange={(e) => setCooldownHours(Number(e.target.value))} />
              </Grid>
            </Grid>
            <Box>
              <TextField fullWidth multiline rows={2} label="Mensagem de convite (após sair)" value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Variáveis: {"{{nome}}, {{grupo}}, {{link_grupo}}"} — envios respeitam 1 msg/5s.
              </Typography>
            </Box>
            <Box>
              <TextField fullWidth multiline rows={2} label="Mensagem de recompensa (ao retornar)" value={rewardMessage} onChange={(e) => setRewardMessage(e.target.value)} />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Variáveis: {"{{nome}}, {{cupom}}, {{grupo}}"}
              </Typography>
            </Box>
            <TextField fullWidth size="small" label="Código do cupom" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => createMut.mutate()} disabled={createMut.isPending || !name || !couponCode}>
            Criar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function AutoMessagesManager() {
  return (
    <Stack spacing={4} sx={{ py: 2 }}>
      <AutoMessagesSection />
      <ReturnAutomationSection />
    </Stack>
  );
}
