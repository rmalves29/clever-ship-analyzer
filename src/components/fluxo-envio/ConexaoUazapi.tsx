import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wifi, WifiOff, QrCode } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  getEnvioConnectionStatus,
  saveEnvioCredentials,
  generateEnvioQrCode,
  disconnectEnvio,
} from "@/lib/envio-connection.functions";

export function ConexaoUazapi() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getEnvioConnectionStatus);
  const runSave = useServerFn(saveEnvioCredentials);
  const runQr = useServerFn(generateEnvioQrCode);
  const runDisconnect = useServerFn(disconnectEnvio);

  const { data: status, isLoading } = useQuery({
    queryKey: ["envio-connection-status"],
    queryFn: () => getStatus(),
    refetchInterval: 5000,
  });

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const saveMut = useMutation({
    mutationFn: () => runSave({ data: { url, token, adminToken: adminToken || undefined } }),
    onSuccess: () => {
      toast.success("Credenciais salvas e webhook registrado.");
      qc.invalidateQueries({ queryKey: ["envio-connection-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qrMut = useMutation({
    mutationFn: () => runQr({ data: {} }),
    onSuccess: (res) => {
      if (res.qrcode) {
        setQr(res.qrcode.startsWith("data:") ? res.qrcode : `data:image/png;base64,${res.qrcode}`);
        setSecondsLeft(60);
      } else {
        toast.info("Sem QR code retornado — talvez já esteja conectado.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => runDisconnect(),
    onSuccess: () => {
      toast.success("Desconectado.");
      qc.invalidateQueries({ queryKey: ["envio-connection-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
        Carregando…
      </Typography>
    );
  }

  return (
    <Stack spacing={3} sx={{ py: 2 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {status?.connected ? <Wifi size={20} color="var(--mui-palette-success-main, #28C76F)" /> : <WifiOff size={20} color="var(--mui-palette-text-secondary)" />}
            <Typography sx={{ fontWeight: 600 }}>{status?.connected ? "Conectado" : "Desconectado"}</Typography>
          </Stack>
          {status?.connectedPhone && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Número: {status.connectedPhone}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            Essa instância UazAPI é compartilhada com o live-launchpad-79 — reconectar por aqui reaponta o webhook pra este app.
          </Typography>
        </CardContent>
      </Card>

      {!status?.configured && (
        <Card variant="outlined">
          <CardContent>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Configurar credenciais</Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="URL da instância"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://sua-instancia.uazapi.com"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Token" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Admin Token (opcional)"
                  type="password"
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                />
              </Grid>
            </Grid>
            <Button variant="contained" sx={{ mt: 2 }} onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !url || !token}>
              Salvar e registrar webhook
            </Button>
          </CardContent>
        </Card>
      )}

      {status?.configured && !status?.connected && (
        <Card variant="outlined">
          <CardContent>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Conectar via QR Code</Typography>
            <Button variant="contained" startIcon={<QrCode size={16} />} onClick={() => qrMut.mutate()} disabled={qrMut.isPending}>
              Gerar QR Code
            </Button>
            {qr && (
              <Stack spacing={1} sx={{ alignItems: "center", mt: 2 }}>
                <Box component="img" src={qr} alt="QR Code" sx={{ width: 288, height: 288, borderRadius: 2, border: "1px solid", borderColor: "divider" }} />
                <Typography variant="caption" color="text.secondary">
                  Expira em {secondsLeft}s — escaneie no WhatsApp do celular.
                </Typography>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {status?.configured && status?.connected && (
        <Box>
          <Button variant="outline" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
            Desconectar
          </Button>
        </Box>
      )}
    </Stack>
  );
}
