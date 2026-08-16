import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { finishEmbeddedSignup } from "@/lib/whatsapp-meta.functions";

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

let sdkLoadStarted = false;

function loadFacebookSdk(appId: string, onReady: () => void, onError: () => void) {
  if (window.FB) {
    onReady();
    return;
  }
  window.fbAsyncInit = () => {
    window.FB!.init({ appId, autoLogAppEvents: true, xfbml: true, version: "v20.0" });
    onReady();
  };
  if (sdkLoadStarted) return;
  sdkLoadStarted = true;
  const script = document.createElement("script");
  script.src = "https://connect.facebook.net/pt_BR/sdk.js";
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    sdkLoadStarted = false;
    console.error("Falha ao carregar o SDK do Facebook (connect.facebook.net bloqueado ou inacessível).");
    onError();
  };
  document.body.appendChild(script);
}

export function EmbeddedSignupButton({
  appId,
  configId,
  onConnected,
}: {
  appId: string;
  configId: string;
  onConnected: () => void;
}) {
  const runFinish = useServerFn(finishEmbeddedSignup);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const signupData = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  const startSdkLoad = () => {
    setSdkError(false);
    const slowLoadTimeout = setTimeout(() => {
      if (!window.FB) setSdkError(true);
    }, 10_000);
    loadFacebookSdk(
      appId,
      () => {
        clearTimeout(slowLoadTimeout);
        setSdkReady(true);
      },
      () => {
        clearTimeout(slowLoadTimeout);
        setSdkError(true);
      },
    );
    return slowLoadTimeout;
  };

  useEffect(() => {
    const slowLoadTimeout = startSdkLoad();

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          signupData.current.phoneNumberId = data.data?.phone_number_id;
          signupData.current.wabaId = data.data?.waba_id;
        }
      } catch {
        // mensagem de outro tipo, ignora
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      clearTimeout(slowLoadTimeout);
      window.removeEventListener("message", handleMessage);
    };
  }, [appId]);

  const handleRetry = () => {
    sdkLoadStarted = false;
    setSdkReady(false);
    startSdkLoad();
  };

  const handleConnect = () => {
    console.log("handleConnect called, FB SDK status:", !!window.FB);
    if (!window.FB) {
      toast.error("SDK do Facebook ainda não carregou — tenta de novo em alguns segundos.");
      return;
    }
    signupData.current = {};
    setConnecting(true);

    // Se nada acontecer em 20s (ex: popup bloqueado sem aviso do SDK), destrava o botão.
    const timeout = setTimeout(() => {
      setConnecting(false);
      toast.error(
        "A Meta não respondeu. Verifique se o navegador bloqueou o popup (ícone perto da barra de endereço) e tente de novo.",
      );
    }, 20_000);

    try {
      window.FB.login(
        async (response) => {
          clearTimeout(timeout);
          const code = response.authResponse?.code;
          if (!code) {
            toast.error("Conexão cancelada ou sem permissão concedida.");
            setConnecting(false);
            return;
          }

          // O postMessage com phone_number_id/waba_id pode chegar um instante depois do callback.
          let attempts = 0;
          while (!signupData.current.phoneNumberId && attempts < 20) {
            await new Promise((r) => setTimeout(r, 250));
            attempts++;
          }

          if (!signupData.current.phoneNumberId || !signupData.current.wabaId) {
            toast.error("Não recebemos o número conectado. Tenta novamente ou use a configuração manual abaixo.");
            setConnecting(false);
            return;
          }

          try {
            const res = await runFinish({
              data: { code, phoneNumberId: signupData.current.phoneNumberId, wabaId: signupData.current.wabaId },
            });
            if (!res.success) {
              toast.error(res.error || "Falha ao concluir a conexão.");
            } else {
              toast.success("WhatsApp conectado com sucesso!");
              onConnected();
            }
          } catch (err: any) {
            toast.error("Erro ao conectar: " + (err?.message ?? "falha desconhecida"));
          } finally {
            setConnecting(false);
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { sessionInfoVersion: "3" },
        },
      );
    } catch (err: any) {
      clearTimeout(timeout);
      setConnecting(false);
      console.error("FB.login falhou:", err);
      toast.error("Falha ao abrir o popup da Meta: " + (err?.message ?? "erro desconhecido"));
    }
  };

  if (sdkError) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-xs text-critical">
          Não deu pra carregar o SDK da Meta (connect.facebook.net). Verifique bloqueadores de anúncio/rastreamento
          no navegador.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" onClick={handleConnect} disabled={!sdkReady || connecting} className="gap-2">
      <MessageCircle className="size-4" />
      {!sdkReady ? "Carregando..." : connecting ? "Conectando..." : "Conectar com um clique"}
    </Button>
  );
}
