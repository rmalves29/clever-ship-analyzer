import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getPopupInstallInfo } from "@/lib/popup.functions";

export function PopupInstallPanel() {
  const get = useServerFn(getPopupInstallInfo);
  const { data, refetch, isFetching } = useQuery({ queryKey: ["popup-install-info"], queryFn: () => get() });

  const lastVisit = data?.lastVisitAt ? new Date(data.lastVisitAt) : null;
  const minutesAgo = lastVisit ? Math.round((Date.now() - lastVisit.getTime()) / 60000) : null;

  return (
    <Stack spacing={2} sx={{ maxWidth: 720, py: 2 }}>
      <Card variant="outlined">
        <CardContent>
          <Typography sx={{ fontWeight: 600 }}>Status</Typography>
          {lastVisit ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Última visita recebida {minutesAgo !== null && minutesAgo < 60 ? `há ${minutesAgo} min` : lastVisit.toLocaleString("pt-BR")} —
              o snippet está ativo no site.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Nenhuma visita registrada ainda. Cole o snippet abaixo no <code>theme.liquid</code> da loja (antes de{" "}
              <code>&lt;/body&gt;</code>) e abra o site pra confirmar aqui.
            </Typography>
          )}
          <Button
            variant="outline"
            size="small"
            disabled={isFetching}
            sx={{ mt: 1.5 }}
            onClick={async () => {
              const result = await refetch();
              const visitAt = result.data?.lastVisitAt;
              toast.success(visitAt ? `Verificado: última visita em ${new Date(visitAt).toLocaleString("pt-BR")}.` : "Verificado: ainda nenhuma visita registrada.");
            }}
          >
            {isFetching ? "Verificando..." : "Verificar novamente"}
          </Button>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography sx={{ fontWeight: 600 }}>Snippet de instalação</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
            Cole este código 1 única vez no <code>theme.liquid</code> da Shopify, logo antes de <code>&lt;/body&gt;</code>. Ele já cuida de
            registrar visitas e mostrar o pop-up ativo sozinho — nenhuma outra edição no tema é necessária.
          </Typography>
          <Box
            component="pre"
            sx={{
              maxHeight: 320,
              overflow: "auto",
              borderRadius: 2,
              bgcolor: "action.hover",
              p: 1.5,
              fontSize: 12,
              m: 0,
            }}
          >
            <code>{data?.script ?? "Carregando..."}</code>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<Copy size={16} />}
            disabled={!data?.script}
            sx={{ mt: 1.5 }}
            onClick={() => {
              if (!data?.script) return;
              navigator.clipboard.writeText(data.script);
              toast.success("Snippet copiado.");
            }}
          >
            Copiar snippet
          </Button>
        </CardContent>
      </Card>
    </Stack>
  );
}
