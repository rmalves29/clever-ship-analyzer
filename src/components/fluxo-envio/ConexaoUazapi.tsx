import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wifi, WifiOff, QrCode } from "lucide-react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getEnvioConnectionStatus, saveEnvioCredentials, generateEnvioQrCode, disconnectEnvio } from "@/lib/envio-connection.functions";

const QR_SECONDS = 60;

const STATUS_LABEL: Record<string, string> = {
  connected: "Conectado",
  connecting: "Conectando…",
  disconnected: "Desconectado",
  hibernated: "Hibernada",
};

function formatPhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length === 13) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith("55") && d.length === 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d ? `+${d}` : "";
}

function urlProblem(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return "A URL precisa começar com https://";
    if (!u.hostname.includes(".")) return "URL incompleta";
    return null;
  } catch {
    return "URL inválida";
  }
}

export function ConexaoUazapi() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getEnvioConnectionStatus);
  const runSave = useServerFn(saveEnvioCredentials);
  const runQr = useServerFn(generateEnvioQrCode);
  const runDisconnect = useServerFn(disconnectEnvio);

  const {
    data: status,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["envio-connection-status"],
    queryFn: () => getStatus(),
    refetchInterval: 5000,
  });

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [editingCreds, setEditingCreds] = useState(false);
  const [pairPhone, setPairPhone] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const clearPairing = () => {
    setQr(null);
    setPaircode(null);
    setSecondsLeft(0);
  };

  // Contagem regressiva; ao zerar o QR/código some em vez de ficar na tela já inválido.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);
  useEffect(() => {
    if (secondsLeft === 0 && (qr || paircode)) clearPairing();
  }, [secondsLeft, qr, paircode]);

  // Conectou: limpa o QR.
  useEffect(() => {
    if (status?.connected && (qr || paircode)) {
      clearPairing();
      toast.success("WhatsApp conectado.");
    }
  }, [status?.connected, qr, paircode]);

  const saveMut = useMutation({
    mutationFn: () => runSave({ data: { url: url.trim(), token: token.trim(), adminToken: adminToken.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Credenciais salvas.");
      setToken("");
      setAdminToken("");
      setEditingCreds(false);
      qc.invalidateQueries({ queryKey: ["envio-connection-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qrMut = useMutation({
    mutationFn: (phone: string | undefined) => runQr({ data: phone ? { phone } : {} }),
    onSuccess: (res) => {
      if (res.qrcode || res.paircode) {
        setQr(res.qrcode ? (res.qrcode.startsWith("data:") ? res.qrcode : `data:image/png;base64,${res.qrcode}`) : null);
        setPaircode(res.paircode ?? null);
        setSecondsLeft(QR_SECONDS);
      } else {
        toast.info("Nenhum QR code retornado — talvez já esteja conectado.");
        qc.invalidateQueries({ queryKey: ["envio-connection-status"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => runDisconnect(),
    onSuccess: () => {
      toast.success("Desconectado.");
      setConfirmDisconnect(false);
      clearPairing();
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

  // Falha ao consultar a instância NÃO pode cair no formulário de credenciais (levaria a sobrescrever dados bons).
  if (isError || !status) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => refetch()}>Tentar de novo</Button>}>
          Não consegui consultar o WhatsApp agora: {(error as Error | null)?.message ?? "erro desconhecido"}. Suas credenciais não foram alteradas.
        </Alert>
      </Stack>
    );
  }

  const urlError = urlProblem(url);
  const showCredsForm = !status.configured || editingCreds;
  const statusText = STATUS_LABEL[status.status] ?? status.status;
  let host = "";
  try {
    host = status.instanceUrl ? new URL(status.instanceUrl).host : "";
  } catch {
    host = status.instanceUrl ?? "";
  }

  return (
    <Stack spacing={3} sx={{ py: 2 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {status.connected ? <Wifi size={20} color="var(--mui-palette-success-main, #28C76F)" /> : <WifiOff size={20} color="var(--mui-palette-text-secondary)" />}
            <Typography sx={{ fontWeight: 600 }}>{status.configured ? statusText : "Não configurado"}</Typography>
            {status.configured && <Chip size="small" color={status.connected ? "success" : "default"} label={status.connected ? "Enviando e recebendo" : "Sem envio"} />}
          </Stack>
          {status.connectedPhone && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Número: {formatPhone(status.connectedPhone)}
            </Typography>
          )}
          {host && (
            <Typography variant="body2" color="text.secondary">
              Instância: {host}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Essa instância é a mesma do Cartzy, que cuida das entradas e saídas dos grupos, das boas-vindas e dos envios. Conectar ou salvar credenciais por aqui não muda o endereço de recebimento (webhook).
          </Typography>
        </CardContent>
      </Card>

      {showCredsForm && (
        <Card variant="outlined">
          <CardContent>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>{status.configured ? "Alterar credenciais" : "Configurar credenciais"}</Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="URL da instância"
                  value={url}
                  error={Boolean(urlError)}
                  helperText={urlError ?? " "}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://sua-instancia.uazapi.com"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" label="Admin Token (opcional)" type="password" autoComplete="off" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button variant="contained" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !url.trim() || !token.trim() || Boolean(urlError)}>
                {saveMut.isPending ? "Testando…" : "Testar e salvar"}
              </Button>
              {status.configured && (
                <Button variant="outline" onClick={() => setEditingCreds(false)}>
                  Cancelar
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {status.configured && !status.connected && (
        <Card variant="outlined">
          <CardContent>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Conectar o WhatsApp</Typography>
            <Stack spacing={2}>
              <Box>
                <Button variant="contained" startIcon={<QrCode size={16} />} onClick={() => qrMut.mutate(undefined)} disabled={qrMut.isPending}>
                  {qrMut.isPending ? "Gerando…" : "Gerar QR Code"}
                </Button>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
                <TextField
                  size="small"
                  label="Ou conectar por código (seu número)"
                  value={pairPhone}
                  onChange={(e) => setPairPhone(e.target.value)}
                  placeholder="5511999999999"
                  sx={{ minWidth: 260 }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button variant="outline" onClick={() => qrMut.mutate(pairPhone.replace(/\D/g, ""))} disabled={qrMut.isPending || pairPhone.replace(/\D/g, "").length < 10}>
                  Gerar código
                </Button>
              </Stack>

              {(qr || paircode) && (
                <Stack spacing={1} sx={{ alignItems: "center" }}>
                  {qr && <Box component="img" src={qr} alt="QR Code" sx={{ width: 288, height: 288, borderRadius: 2, border: "1px solid", borderColor: "divider" }} />}
                  {paircode && (
                    <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: 4 }}>{paircode}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {paircode && !qr
                      ? `Expira em ${secondsLeft}s — no WhatsApp, vá em Aparelhos conectados > Conectar com número e digite o código.`
                      : `Expira em ${secondsLeft}s — escaneie no WhatsApp do celular.`}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {status.configured && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {status.connected && (
            <Button variant="outline" onClick={() => setConfirmDisconnect(true)} disabled={disconnectMut.isPending}>
              Desconectar
            </Button>
          )}
          {!showCredsForm && (
            <Button variant="text" onClick={() => setEditingCreds(true)}>
              Alterar credenciais
            </Button>
          )}
        </Stack>
      )}

      <Dialog open={confirmDisconnect} onClose={() => setConfirmDisconnect(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Desconectar o WhatsApp?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Esse número também é usado pelo Cartzy. Desconectando, param os envios, as boas-vindas e o registro de entradas e saídas dos grupos até você reconectar com o QR Code.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
            {disconnectMut.isPending ? "Desconectando…" : "Desconectar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
