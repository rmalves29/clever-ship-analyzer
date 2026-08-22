import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, WifiOff, QrCode } from "lucide-react";
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

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6 py-4">
      <div className="surface-card p-5">
        <div className="flex items-center gap-2">
          {status?.connected ? <Wifi className="size-5 text-success" /> : <WifiOff className="size-5 text-muted-foreground" />}
          <p className="font-semibold">{status?.connected ? "Conectado" : "Desconectado"}</p>
        </div>
        {status?.connectedPhone && <p className="mt-1 text-sm text-muted-foreground">Número: {status.connectedPhone}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Essa instância UazAPI é compartilhada com o live-launchpad-79 — reconectar por aqui reaponta o webhook pra este app.
        </p>
      </div>

      {!status?.configured && (
        <div className="surface-card space-y-3 p-5">
          <p className="font-semibold">Configurar credenciais</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>URL da instância</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://sua-instancia.uazapi.com" />
            </div>
            <div>
              <Label>Token</Label>
              <Input value={token} onChange={(e) => setToken(e.target.value)} type="password" />
            </div>
            <div>
              <Label>Admin Token (opcional)</Label>
              <Input value={adminToken} onChange={(e) => setAdminToken(e.target.value)} type="password" />
            </div>
          </div>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !url || !token}>
            Salvar e registrar webhook
          </Button>
        </div>
      )}

      {status?.configured && !status?.connected && (
        <div className="surface-card space-y-3 p-5">
          <p className="font-semibold">Conectar via QR Code</p>
          <Button onClick={() => qrMut.mutate()} disabled={qrMut.isPending} className="gap-2">
            <QrCode className="size-4" /> Gerar QR Code
          </Button>
          {qr && (
            <div className="flex flex-col items-center gap-2">
              <img src={qr} alt="QR Code" className="size-72 rounded-lg border border-border" />
              <p className="text-xs text-muted-foreground">Expira em {secondsLeft}s — escaneie no WhatsApp do celular.</p>
            </div>
          )}
        </div>
      )}

      {status?.configured && status?.connected && (
        <Button variant="outline" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
          Desconectar
        </Button>
      )}
    </div>
  );
}
