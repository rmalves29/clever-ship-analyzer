import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { Smartphone, Users, Megaphone, Send, Bot, BarChart3 } from "lucide-react";
import { ConexaoUazapi } from "@/components/fluxo-envio/ConexaoUazapi";
import { GroupsManager } from "@/components/fluxo-envio/GroupsManager";
import { CampaignsManager } from "@/components/fluxo-envio/CampaignsManager";
import { MessageComposer } from "@/components/fluxo-envio/MessageComposer";
import { AutoMessagesManager } from "@/components/fluxo-envio/AutoMessagesManager";
import { ReportsPanel } from "@/components/fluxo-envio/ReportsPanel";

const VALID_TABS = ["conexao", "grupos", "campanhas", "envios", "automacoes", "relatorios"] as const;

export const Route = createFileRoute("/fluxo-envio")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (VALID_TABS as readonly string[]).includes(search["tab"] as string) ? (search["tab"] as string) : "conexao",
  }),
  head: () => ({
    meta: [
      { title: "Fluxo de Envio | CRM Insights" },
      { name: "description", content: "Grupos de WhatsApp, campanhas com link público, auto-clonagem e automações de retorno." },
    ],
  }),
  component: FluxoEnvio,
});

function FluxoEnvio() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/fluxo-envio", search: { tab: value } });

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Fluxo de Envio
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Grupos, campanhas e envio de mensagens no WhatsApp via UazAPI
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab value="conexao" icon={<Smartphone size={16} />} iconPosition="start" label="Conexão" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="grupos" icon={<Users size={16} />} iconPosition="start" label="Grupos" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="campanhas" icon={<Megaphone size={16} />} iconPosition="start" label="Campanhas" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="envios" icon={<Send size={16} />} iconPosition="start" label="Envios" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="automacoes" icon={<Bot size={16} />} iconPosition="start" label="Automações" sx={{ minHeight: 40, minWidth: "auto" }} />
          <Tab value="relatorios" icon={<BarChart3 size={16} />} iconPosition="start" label="Relatórios" sx={{ minHeight: 40, minWidth: "auto" }} />
        </Tabs>
      </Box>

      {tab === "conexao" && <ConexaoUazapi />}
      {tab === "grupos" && <GroupsManager />}
      {tab === "campanhas" && <CampaignsManager />}
      {tab === "envios" && <MessageComposer />}
      {tab === "automacoes" && <AutoMessagesManager />}
      {tab === "relatorios" && <ReportsPanel />}
    </Box>
  );
}
