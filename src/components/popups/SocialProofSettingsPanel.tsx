import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, MapPin, Save, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getSocialProofSettings, saveSocialProofSettings } from "@/lib/popup.functions";
import { DEFAULT_SOCIAL_PROOF_SETTINGS, type SocialProofSettings } from "@/lib/popup-social-proof";

const POSITION_LABELS: Record<SocialProofSettings["position"], string> = {
  "top-left": "Superior esquerdo",
  "top-right": "Superior direito",
  "bottom-left": "Inferior esquerdo",
  "bottom-right": "Inferior direito",
};

export function SocialProofSettingsPanel() {
  const qc = useQueryClient();
  const getSettings = useServerFn(getSocialProofSettings);
  const saveSettings = useServerFn(saveSocialProofSettings);
  const [form, setForm] = useState<SocialProofSettings>(DEFAULT_SOCIAL_PROOF_SETTINGS);
  const { data, isPending, isError } = useQuery({
    queryKey: ["popup-social-proof-settings"],
    queryFn: () => getSettings(),
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({ data: form }),
    onSuccess: (saved) => {
      setForm(saved);
      qc.setQueryData(["popup-social-proof-settings"], saved);
      toast.success(saved.enabled ? "Pop-up de compras recentes ativado." : "Pop-up de compras recentes pausado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patchNumber = (key: "delayAfterCaptureSeconds" | "intervalSeconds" | "visibleSeconds", value: string) => {
    setForm((current) => ({ ...current, [key]: Number(value) }));
  };

  if (isPending) {
    return (
      <Typography align="center" color="text.secondary" sx={{ py: 6 }}>
        Carregando configurações…
      </Typography>
    );
  }
  if (isError) {
    return (
      <Box sx={{ my: 2, border: "1px solid", borderColor: "error.main", bgcolor: "error.50", borderRadius: 2, p: 2 }}>
        <Typography variant="body2" color="error.main">
          Não foi possível carregar as configurações.
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2.5} sx={{ py: 2 }}>
      <Grid size={{ xs: 12, xl: 8 }}>
        <Card variant="outlined">
          <Stack
            direction="row"
            spacing={2}
            sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid", borderColor: "divider", px: 2.5, py: 2 }}
          >
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <ShoppingBag size={18} color="var(--mui-palette-primary-main, #7367F0)" />
                <Typography sx={{ fontWeight: 600 }}>Compras recentes</Typography>
                <Chip size="small" color={form.enabled ? "success" : "default"} label={form.enabled ? "Ativo" : "Pausado"} />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Mostra vendas pagas do dia anterior, em ordem aleatória.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Typography variant="body2">Publicar no site</Typography>
              <Switch checked={form.enabled} onChange={(e) => setForm((current) => ({ ...current, enabled: e.target.checked }))} />
            </Stack>
          </Stack>

          <CardContent>
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                    <Clock3 size={16} color="var(--mui-palette-primary-main, #7367F0)" />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Depois de fechar o pop-up principal
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField
                      type="number"
                      size="small"
                      slotProps={{ htmlInput: { min: 1, max: 300 } }}
                      value={form.delayAfterCaptureSeconds}
                      onChange={(e) => patchNumber("delayAfterCaptureSeconds", e.target.value)}
                    />
                    <Typography variant="body2" color="text.secondary">
                      segundos
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    Primeira exibição. Padrão: 10 segundos.
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                    <Sparkles size={16} color="var(--mui-palette-primary-main, #7367F0)" />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Intervalo entre compras
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField
                      type="number"
                      size="small"
                      slotProps={{ htmlInput: { min: 10, max: 3600 } }}
                      value={form.intervalSeconds}
                      onChange={(e) => patchNumber("intervalSeconds", e.target.value)}
                    />
                    <Typography variant="body2" color="text.secondary">
                      segundos
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    Repete com outra compra. Padrão: 50 segundos.
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                    Tempo visível
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField
                      type="number"
                      size="small"
                      slotProps={{ htmlInput: { min: 2, max: 30 } }}
                      value={form.visibleSeconds}
                      onChange={(e) => patchNumber("visibleSeconds", e.target.value)}
                    />
                    <Typography variant="body2" color="text.secondary">
                      segundos
                    </Typography>
                  </Stack>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                    Posição no site
                  </Typography>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={form.position}
                      onChange={(e) => setForm((current) => ({ ...current, position: e.target.value as SocialProofSettings["position"] }))}
                    >
                      {Object.entries(POSITION_LABELS).map(([value, label]) => (
                        <MenuItem key={value} value={value}>
                          {label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Grid>
            </Grid>

            <Stack
              direction="row"
              spacing={1.5}
              sx={{ mt: 2.5, border: "1px solid", borderColor: "primary.main", bgcolor: "action.hover", borderRadius: 2, p: 2 }}
            >
              <ShieldCheck size={20} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mui-palette-primary-main, #7367F0)" />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  Privacidade protegida
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  O site recebe somente primeiro nome + inicial do sobrenome, cidade/UF, produto e imagem. E-mail, telefone e número do pedido não são enviados.
                </Typography>
              </Box>
            </Stack>
          </CardContent>

          <Box sx={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid", borderColor: "divider", px: 2.5, py: 2 }}>
            <Button
              variant="contained"
              startIcon={<Save size={16} />}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || form.visibleSeconds >= form.intervalSeconds}
            >
              {saveMutation.isPending ? "Salvando…" : "Salvar configurações"}
            </Button>
          </Box>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, xl: 4 }}>
        <Box sx={{ borderRadius: 2, bgcolor: "#f5f6f7", p: 2.5, height: "100%" }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography sx={{ fontWeight: 600 }}>Prévia no site</Typography>
            <Chip size="small" variant="outlined" label="Pedidos de ontem" />
          </Stack>
          {/* Simulação do widget real exibido no site da cliente — mantém marcação/estilo próprios,
             independentes do design system admin (MUI), propositalmente. */}
          <Box sx={{ minHeight: 420, display: "flex", alignItems: "flex-start", borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: "#fff", p: 2 }}>
            <div style={{ position: "relative", display: "flex", width: "100%", maxWidth: 350, gap: 12, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", padding: "10px 32px 10px 10px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}>
              <button type="button" aria-label="Fechar prévia" style={{ position: "absolute", right: 8, top: 4, fontSize: 20, color: "#71717a", background: "none", border: "none", cursor: "default" }}>
                ×
              </button>
              <div style={{ display: "grid", width: 96, height: 96, flexShrink: 0, placeItems: "center", overflow: "hidden", borderRadius: 4, background: "#f6f1ef" }}>
                <ShoppingBag size={32} color="#9b6f63" />
              </div>
              <div style={{ minWidth: 0, paddingTop: 4, fontSize: 12, lineHeight: 1.4 }}>
                <p style={{ margin: 0, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Maria S. de Diamantina/MG</p>
                <p style={{ margin: "4px 0 0", color: "#dc2626" }}>comprou</p>
                <p style={{ margin: "2px 0 0", fontWeight: 500 }}>Kit Ayla Azul Turquesa</p>
              </div>
            </div>
          </Box>
          <Stack direction="row" spacing={1} sx={{ mt: 2, color: "text.secondary" }}>
            <MapPin size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <Typography variant="caption">A posição escolhida será aplicada no desktop; no celular o aviso se adapta à largura da tela.</Typography>
          </Stack>
        </Box>
      </Grid>
    </Grid>
  );
}
