import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { getPopupInstallInfo } from "@/lib/popup.functions";

export function PopupInstallPanel() {
  const get = useServerFn(getPopupInstallInfo);
  const { data, refetch, isFetching } = useQuery({ queryKey: ["popup-install-info"], queryFn: () => get() });

  const lastVisit = data?.lastVisitAt ? new Date(data.lastVisitAt) : null;
  const minutesAgo = lastVisit ? Math.round((Date.now() - lastVisit.getTime()) / 60000) : null;

  return (
    <div className="max-w-2xl space-y-4 py-4">
      <div className="surface-card space-y-2 p-4">
        <p className="font-semibold">Status</p>
        {lastVisit ? (
          <p className="text-sm text-muted-foreground">
            Última visita recebida {minutesAgo !== null && minutesAgo < 60 ? `há ${minutesAgo} min` : lastVisit.toLocaleString("pt-BR")} —
            o snippet está ativo no site.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma visita registrada ainda. Cole o snippet abaixo no <code>theme.liquid</code> da loja (antes de{" "}
            <code>&lt;/body&gt;</code>) e abra o site pra confirmar aqui.
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={isFetching}
          onClick={async () => {
            const result = await refetch();
            const visitAt = result.data?.lastVisitAt;
            toast.success(visitAt ? `Verificado: última visita em ${new Date(visitAt).toLocaleString("pt-BR")}.` : "Verificado: ainda nenhuma visita registrada.");
          }}
        >
          {isFetching ? "Verificando..." : "Verificar novamente"}
        </Button>
      </div>

      <div className="surface-card space-y-2 p-4">
        <p className="font-semibold">Snippet de instalação</p>
        <p className="text-sm text-muted-foreground">
          Cole este código 1 única vez no <code>theme.liquid</code> da Shopify, logo antes de <code>&lt;/body&gt;</code>. Ele já cuida de
          registrar visitas e mostrar o pop-up ativo sozinho — nenhuma outra edição no tema é necessária.
        </p>
        <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">
          <code>{data?.script ?? "Carregando..."}</code>
        </pre>
        <Button
          size="sm"
          className="gap-2"
          disabled={!data?.script}
          onClick={() => {
            if (!data?.script) return;
            navigator.clipboard.writeText(data.script);
            toast.success("Snippet copiado.");
          }}
        >
          <Copy className="size-4" /> Copiar snippet
        </Button>
      </div>
    </div>
  );
}
