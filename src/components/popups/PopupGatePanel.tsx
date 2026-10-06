import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff, ImagePlus, Lock, Trash2 } from "lucide-react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getSiteGateSettings, saveSiteGateSettings } from "@/lib/popup-gate.functions";
import { uploadEnvioMedia } from "@/lib/envio-messages.functions";

type GateForm = {
  enabled: boolean;
  headline: string;
  bodyText: string;
  imageUrl: string;
  password: string;
  passwordPlaceholder: string;
  buttonText: string;
  groupUrl: string;
  groupButtonText: string;
  backgroundColor: string;
  textColor: string;
  buttonColor: string;
};

const EMPTY: GateForm = {
  enabled: false,
  headline: "Área exclusiva",
  bodyText: "Para entrar no site, digite a senha. Ela é enviada no nosso grupo VIP.",
  imageUrl: "",
  password: "",
  passwordPlaceholder: "Digite a senha",
  buttonText: "Entrar",
  groupUrl: "",
  groupButtonText: "Entrar no grupo VIP para receber a senha",
  backgroundColor: "#0f172a",
  textColor: "#ffffff",
  buttonColor: "#25d366",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 40, height: 40, border: "none", background: "none", padding: 0, cursor: "pointer" }}
      />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  );
}

export function PopupGatePanel() {
  const qc = useQueryClient();
  const load = useServerFn(getSiteGateSettings);
  const save = useServerFn(saveSiteGateSettings);
  const upload = useServerFn(uploadEnvioMedia);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({ queryKey: ["site-gate-settings"], queryFn: () => load() });
  const [form, setForm] = useState<GateForm>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      headline: data.headline,
      bodyText: data.bodyText,
      imageUrl: data.imageUrl ?? "",
      password: data.password,
      passwordPlaceholder: data.passwordPlaceholder,
      buttonText: data.buttonText,
      groupUrl: data.groupUrl ?? "",
      groupButtonText: data.groupButtonText,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      buttonColor: data.buttonColor,
    });
  }, [data]);

  const patch = (p: Partial<GateForm>) => setForm((current) => ({ ...current, ...p }));

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          enabled: form.enabled,
          headline: form.headline,
          bodyText: form.bodyText,
          imageUrl: form.imageUrl || null,
          password: form.password,
          passwordPlaceholder: form.passwordPlaceholder,
          buttonText: form.buttonText,
          groupUrl: form.groupUrl.trim() || null,
          groupButtonText: form.groupButtonText,
          backgroundColor: form.backgroundColor,
          textColor: form.textColor,
          buttonColor: form.buttonColor,
        },
      }),
    onSuccess: () => {
      toast.success(form.enabled ? "Trava salva e ativa no site." : "Trava salva (desativada).");
      qc.invalidateQueries({ queryKey: ["site-gate-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem.");
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await upload({ data: { fileName: file.name, base64Data: base64, contentType: file.type } });
      patch({ imageUrl: res.url });
    } catch (e: any) {
      toast.error("Falha no upload: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, py: 2 }}>
      <Stack spacing={2.5} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Lock size={18} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Trava de acesso por senha
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Cobre a tela inteira do site com uma janela sem botão de fechar. Só quem digitar a senha entra. A senha é divulgada no grupo VIP,
          e o botão abaixo do campo leva a pessoa para o grupo.
        </Typography>

        <FormControlLabel
          control={<Switch checked={form.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />}
          label={form.enabled ? "Trava ativa no site" : "Trava desativada"}
        />

        <TextField label="Título" value={form.headline} onChange={(e) => patch({ headline: e.target.value })} fullWidth slotProps={{ htmlInput: { maxLength: 120 } }} />
        <TextField
          label="Mensagem"
          value={form.bodyText}
          onChange={(e) => patch({ bodyText: e.target.value })}
          fullWidth
          multiline
          rows={4}
          slotProps={{ htmlInput: { maxLength: 800 } }}
        />

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.75 }}>
            Imagem (opcional)
          </Typography>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Button variant="outline" startIcon={<ImagePlus size={16} />} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Enviando…" : form.imageUrl ? "Trocar imagem" : "Subir imagem"}
            </Button>
            {form.imageUrl && (
              <>
                <Box component="img" src={form.imageUrl} alt="" sx={{ height: 44, borderRadius: 1, objectFit: "contain" }} />
                <IconButton size="small" onClick={() => patch({ imageUrl: "" })} title="Remover imagem">
                  <Trash2 size={16} />
                </IconButton>
              </>
            )}
          </Stack>
        </Box>

        <TextField
          label="Senha de acesso"
          value={form.password}
          onChange={(e) => patch({ password: e.target.value })}
          type={showPassword ? "text" : "password"}
          fullWidth
          helperText="Mínimo de 4 caracteres. Não diferencia maiúsculas de minúsculas. Ao trocar a senha, todo mundo precisa digitar a nova."
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField label="Texto do campo da senha" value={form.passwordPlaceholder} onChange={(e) => patch({ passwordPlaceholder: e.target.value })} />
          <TextField label="Texto do botão de entrar" value={form.buttonText} onChange={(e) => patch({ buttonText: e.target.value })} />
        </Box>
        <TextField
          label="Link do grupo VIP (WhatsApp)"
          value={form.groupUrl}
          onChange={(e) => patch({ groupUrl: e.target.value })}
          placeholder="https://chat.whatsapp.com/…"
          fullWidth
          helperText="Se ficar vazio, o botão do grupo não aparece."
        />
        <TextField label="Texto do botão do grupo" value={form.groupButtonText} onChange={(e) => patch({ groupButtonText: e.target.value })} fullWidth />

        <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap" }}>
          <ColorField label="Fundo" value={form.backgroundColor} onChange={(v) => patch({ backgroundColor: v })} />
          <ColorField label="Texto" value={form.textColor} onChange={(v) => patch({ textColor: v })} />
          <ColorField label="Botão" value={form.buttonColor} onChange={(v) => patch({ buttonColor: v })} />
        </Stack>

        <Box>
          <Button variant="contained" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </Box>

        <Alert severity="info">
          Esta trava funciona como uma porta de recepção do site: impede o acesso de quem não tem a senha, mas não é segurança bancária.
          Quem entende de navegador consegue contornar uma tela feita em JavaScript. Para o uso de “conteúdo só pra quem é do grupo VIP” isso costuma bastar.
          Use uma senha com 6 ou mais caracteres.
        </Alert>
      </Stack>

      <Box sx={{ position: { lg: "sticky" }, top: { lg: 96 }, alignSelf: { lg: "flex-start" } }}>
        <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Prévia (é assim que aparece no site)
        </Typography>
        <Box
          sx={{
            mt: 1,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: form.backgroundColor,
            color: form.textColor,
            p: 3,
            minHeight: 420,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box sx={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
            {form.imageUrl && <Box component="img" src={form.imageUrl} alt="" sx={{ display: "block", maxWidth: "100%", maxHeight: 200, mx: "auto", mb: 2.5, borderRadius: 2, objectFit: "contain" }} />}
            <Typography sx={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1, mb: 1.25 }}>{form.headline || "Título"}</Typography>
            {form.bodyText && (
              <Typography sx={{ fontSize: 14, lineHeight: 1.55, opacity: 0.85, whiteSpace: "pre-line", mb: 2.5 }}>{form.bodyText}</Typography>
            )}
            <Box sx={{ height: 46, borderRadius: 2, bgcolor: "#fff", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
              {form.passwordPlaceholder || "Digite a senha"}
            </Box>
            <Box sx={{ mt: 1.5, py: 1.5, borderRadius: 2, bgcolor: form.buttonColor, color: "#fff", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {form.buttonText || "Entrar"}
            </Box>
            {form.groupUrl.trim() && (
              <Box sx={{ mt: 1.5, py: 1.5, px: 1, borderRadius: 2, border: "2px solid", borderColor: form.buttonColor, fontWeight: 800, fontSize: 12 }}>
                {form.groupButtonText}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
