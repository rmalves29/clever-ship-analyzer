import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { ExternalLink, Send, Smartphone } from "lucide-react";
import { ConexaoUazapi } from "@/components/fluxo-envio/ConexaoUazapi";

// O Fluxo de Envio é o painel ORIGINAL do OrderZaps, aberto dentro do CRM: mesma tela, mesmo banco e
// mesmas funções nos dois sistemas (nada é duplicado). Exige login no OrderZaps (sessão própria).
// Antes (cópia local com componentes próprios) está no histórico do git: branch/commit anterior a esta troca.
const ORDERZAPS_PAINEL_URL = (import.meta.env["VITE_ORDERZAPS_FLUXO_URL"] as string | undefined) || "https://app.orderzaps.com/fluxo-envio/painel";

// Links antigos usavam ?tab=grupos|campanhas|envios|automacoes|relatorios — tudo isso agora vive no painel do OrderZaps.
const VALID_TABS = ["painel", "conexao"] as const;

export const Route = createFileRoute("/fluxo-envio")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search["tab"] === "conexao" ? "conexao" : "painel",
  }),
  head: () => ({
    meta: [
      { title: "Fluxo de Envio | CRM Insights" },
      { name: "description", content: "Painel de Fluxo de Envio do OrderZaps dentro do CRM: grupos, campanhas, envios, automações e relatórios." },
    ],
  }),
  component: FluxoEnvio,
});

function FluxoEnvio() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const current = (VALID_TABS as readonly string[]).includes(tab) ? tab : "painel";
  const setTab = (value: string) => navigate({ to: "/fluxo-envio", search: { tab: value } });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 520 }}>
      <Box sx={{ px: { xs: 2, md: 4 }, pt: 3, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", gap: 2, flexWrap: "wrap" }}>
        {current === "painel" && (
          <Button
            size="small"
            variant="outlined"
            component="a"
            href={ORDERZAPS_PAINEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<ExternalLink size={14} />}
          >
            Abrir em nova aba
          </Button>
        )}
      </Box>

      <Box sx={{ px: { xs: 2, md: 4 }, borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={current} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab value="painel" icon={<Send size={16} />} iconPosition="start" label="Painel" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="conexao" icon={<Smartphone size={16} />} iconPosition="start" label="Conexão do CRM" sx={{ minHeight: 40, minWidth: "auto" }} />
        </Tabs>
      </Box>

      {current === "painel" && (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Typography variant="caption" color="text.secondary" sx={{ px: { xs: 2, md: 4 }, py: 0.75 }}>
            Se o painel pedir login, entre com sua conta do OrderZaps — o navegador lembra da sessão. Se não aparecer nada, use "Abrir em nova aba".
          </Typography>
          <iframe
            title="Fluxo de Envio - OrderZaps"
            src={ORDERZAPS_PAINEL_URL}
            style={{ flex: 1, width: "100%", border: 0, minHeight: 480 }}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        </Box>
      )}
      {current === "conexao" && (
        <Box sx={{ px: { xs: 2, md: 4 }, py: 3, overflow: "auto" }}>
          <ConexaoUazapi />
        </Box>
      )}
    </Box>
  );
}
