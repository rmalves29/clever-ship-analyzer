import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  completeWhatsappEmbeddedSignup,
  getWhatsappPhoneRegistrationState,
  registerWhatsappPhoneNumber,
} from "@/lib/whatsapp-phone-registration.functions";
import {
  META_GRAPH_API_VERSION,
  isValidWhatsappRegistrationPin,
  normalizeWhatsappRegistrationPin,
} from "@/lib/whatsapp-phone-registration";

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadFacebookSdk(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      try {
        window.FB!.init({ appId, autoLogAppEvents: true, xfbml: true, version: META_GRAPH_API_VERSION });
        resolve();
      } catch (error) {
        sdkPromise = null;
        reject(error);
      }
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src*="connect.facebook.net"]');
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("Falha ao carregar o SDK da Meta."));
    };
    document.body.appendChild(script);
  });

  return sdkPromise;
}

type SignupEventState = {
  phoneNumberId?: string;
  wabaId?: string;
  error?: string;
  wabaOnly?: boolean;
};

const TRUSTED_META_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://business.facebook.com",
]);

export function EmbeddedSignupButton({
  appId,
  configId,
  onConnected,
}: {
  appId: string;
  configId: string;
  onConnected: () => void;
}) {
  const runFinish = useServerFn(completeWhatsappEmbeddedSignup);
  const runRegister = useServerFn(registerWhatsappPhoneNumber);
  const [sdkReady, setSdkReady] = useState(Boolean(typeof window !== "undefined" && window.FB));
  const [sdkError, setSdkError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [pin, setPin] = useState("");
  const signupData = useRef<SignupEventState>({});

  const {
    data: phoneState,
    isFetching: refreshingPhoneState,
    refetch: refetchPhoneState,
  } = useQuery({
    queryKey: ["whatsapp-phone-registration-state"],
    queryFn: () => getWhatsappPhoneRegistrationState(),
    retry: 1,
  });

  const startSdkLoad = async () => {
    setSdkError(false);
    try {
      await Promise.race([
        loadFacebookSdk(appId),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000)),
      ]);
      setSdkReady(true);
    } catch {
      setSdkReady(false);
      setSdkError(true);
    }
  };

  useEffect(() => {
    void startSdkLoad();

    const handleMessage = (event: MessageEvent) => {
      if (!TRUSTED_META_ORIGINS.has(event.origin)) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;

        if (data.event === "FINISH") {
          const phoneNumberId = String(data.data?.phone_number_id ?? "");
          const wabaId = String(data.data?.waba_id ?? "");
          if (/^\d+$/.test(phoneNumberId) && /^\d+$/.test(wabaId)) {
            signupData.current = { phoneNumberId, wabaId };
          } else {
            signupData.current = { error: "A Meta concluiu o popup, mas não retornou IDs válidos do número e da WABA." };
          }
        } else if (data.event === "FINISH_ONLY_WABA") {
          signupData.current = {
            wabaId: String(data.data?.waba_id ?? ""),
            wabaOnly: true,
            error: "A conta do WhatsApp foi criada, mas nenhum número foi concluído. Abra o cadastro novamente e adicione/selecione o número.",
          };
        } else if (data.event === "CANCEL") {
          signupData.current = { error: "Cadastro do WhatsApp cancelado antes da conclusão." };
        } else if (data.event === "ERROR") {
          signupData.current = {
            error: String(data.data?.error_message ?? data.data?.message ?? "A Meta informou um erro no Cadastro Incorporado."),
          };
        }
      } catch {
        // Ignora postMessages que não pertencem ao Embedded Signup.
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [appId]);

  const handleRetrySdk = () => {
    sdkPromise = null;
    setSdkReady(false);
    void startSdkLoad();
  };

  const waitForSignupIds = async () => {
    for (let attempts = 0; attempts < 120; attempts++) {
      if (signupData.current.error) return signupData.current;
      if (signupData.current.phoneNumberId && signupData.current.wabaId) return signupData.current;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { error: "A Meta autorizou a conexão, mas não retornou os dados do número dentro do prazo. Tente novamente." };
  };

  const handleConnect = () => {
    if (!window.FB) {
      toast.error("O SDK da Meta ainda não carregou. Tente novamente em alguns segundos.");
      return;
    }
    if (!isValidWhatsappRegistrationPin(pin)) {
      toast.error("Escolha um PIN de 6 números. Ele será usado para concluir o registro do número na Cloud API.");
      return;
    }

    signupData.current = {};
    setConnecting(true);

    const popupTimeout = setTimeout(() => {
      setConnecting(false);
      toast.error("A Meta não concluiu o cadastro. Verifique se o popup foi bloqueado e tente novamente.");
    }, 120_000);

    const handleLoginResponse = async (response: { authResponse?: { code?: string } }) => {
      const code = response.authResponse?.code;
      if (!code) {
        clearTimeout(popupTimeout);
        toast.error(signupData.current.error || "Conexão cancelada ou sem permissão concedida.");
        setConnecting(false);
        return;
      }

      const embedded = await waitForSignupIds();
      if (!embedded.phoneNumberId || !embedded.wabaId) {
        clearTimeout(popupTimeout);
        toast.error(embedded.error || "Não recebemos os dados do número conectado.");
        setConnecting(false);
        return;
      }

      try {
        const res = await runFinish({
          data: {
            code,
            phoneNumberId: embedded.phoneNumberId,
            wabaId: embedded.wabaId,
            pin,
          },
        });
        if (!res.success) {
          toast.error(res.error || "Falha ao concluir o registro do número.");
          if ((res as any).credentialsSaved) {
            toast.info("A conexão foi salva. Corrija o PIN e use “Registrar número atual” sem refazer o popup.");
          }
          return;
        }

        if (res.warning) toast.warning(res.warning);
        else toast.success("WhatsApp conectado, número registrado e webhook inscrito com sucesso.");
        setPin("");
        await refetchPhoneState();
        onConnected();
      } catch (err: any) {
        toast.error("Erro ao conectar: " + (err?.message ?? "falha desconhecida"));
      } finally {
        clearTimeout(popupTimeout);
        setConnecting(false);
      }
    };

    try {
      window.FB.login(
        (response) => {
          void handleLoginResponse(response);
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { sessionInfoVersion: "3" },
        },
      );
    } catch (err: any) {
      clearTimeout(popupTimeout);
      setConnecting(false);
      toast.error("Falha ao abrir o popup da Meta: " + (err?.message ?? "erro desconhecido"));
    }
  };

  const handleRegisterCurrent = async () => {
    if (!isValidWhatsappRegistrationPin(pin)) {
      toast.error("Informe o PIN de 6 números para registrar o número atual.");
      return;
    }
    setRegistering(true);
    try {
      const res = await runRegister({ data: { pin } });
      if (!res.success) {
        toast.error(res.error || "A Meta recusou o registro do número.");
        return;
      }
      if (res.warning) toast.warning(res.warning);
      else toast.success(res.alreadyRegistered ? "O número já estava registrado; webhook revisado." : "Número registrado com sucesso.");
      setPin("");
      await refetchPhoneState();
      onConnected();
    } catch (err: any) {
      toast.error("Erro ao registrar: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setRegistering(false);
    }
  };

  const configuredState = phoneState?.success && phoneState.configured ? phoneState : null;
  const ready = configuredState?.ready === true;

  return (
    <div className="w-full space-y-3">
      {configuredState && (
        <div className="rounded-lg border border-border bg-background/70 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {ready ? <CheckCircle2 className="size-4 text-success" /> : <ShieldCheck className="size-4 text-warning" />}
              <span className="font-semibold">{configuredState.displayPhoneNumber || "Número conectado"}</span>
            </div>
            <Badge variant="outline">{ready ? "Pronto para uso" : "Registro pendente"}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>API: {configuredState.apiVersion}</span>
            <span>Verificação: {configuredState.codeVerificationStatus || "—"}</span>
            <span>Plataforma: {configuredState.platformType || "—"}</span>
            <span>Webhook: {configuredState.webhookSubscribed === true ? "inscrito" : configuredState.webhookSubscribed === false ? "não inscrito" : "não confirmado"}</span>
          </div>
          {configuredState.issues?.length > 0 && (
            <p className="mt-2 text-warning-foreground">{configuredState.issues[0]}</p>
          )}
        </div>
      )}

      {phoneState && !phoneState.success && (
        <p className="text-xs text-critical">Não foi possível consultar o número na Meta: {phoneState.error}</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[190px] flex-1 space-y-1">
          <label htmlFor="waRegistrationPin" className="text-xs font-medium">PIN de registro (6 números)</label>
          <Input
            id="waRegistrationPin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="••••••"
            value={pin}
            onChange={(event) => setPin(normalizeWhatsappRegistrationPin(event.target.value))}
          />
          <p className="text-[10px] text-muted-foreground">O PIN é enviado somente à Meta no momento do registro e não é salvo no sistema.</p>
        </div>

        <Button
          type="button"
          onClick={handleConnect}
          disabled={!sdkReady || connecting || registering || !isValidWhatsappRegistrationPin(pin)}
          className="gap-2"
        >
          <MessageCircle className="size-4" />
          {!sdkReady ? "Carregando Meta..." : connecting ? "Conectando e registrando..." : "Conectar novo número"}
        </Button>

        {configuredState && !ready && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRegisterCurrent}
            disabled={registering || connecting || !isValidWhatsappRegistrationPin(pin)}
          >
            {registering && <RefreshCw className="mr-2 size-4 animate-spin" />}
            Registrar número atual
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => refetchPhoneState()}
          disabled={refreshingPhoneState}
          title="Consultar novamente o estado do número na Meta"
        >
          <RefreshCw className={`size-4 ${refreshingPhoneState ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {sdkError && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-critical">
          <span>Não foi possível carregar o SDK da Meta. Desative bloqueadores para connect.facebook.net e tente novamente.</span>
          <Button type="button" variant="outline" size="sm" onClick={handleRetrySdk}>Tentar de novo</Button>
        </div>
      )}
    </div>
  );
}
