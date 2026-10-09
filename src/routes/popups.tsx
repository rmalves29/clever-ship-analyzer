import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { LayoutTemplate, Users, Code2, ShoppingBag, Lock } from "lucide-react";
import { PopupCampaignsManager } from "@/components/popups/PopupCampaignsManager";
import { PopupLeadsTable } from "@/components/popups/PopupLeadsTable";
import { PopupInstallPanel } from "@/components/popups/PopupInstallPanel";
import { SocialProofSettingsPanel } from "@/components/popups/SocialProofSettingsPanel";
import { PopupGatePanel } from "@/components/popups/PopupGatePanel";

const VALID_TABS = ["popups", "compras-recentes", "leads", "trava-senha", "instalacao"] as const;

export const Route = createFileRoute("/popups")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (VALID_TABS as readonly string[]).includes(search["tab"] as string) ? (search["tab"] as string) : "popups",
  }),
  head: () => ({
    meta: [
      { title: "Pop-ups | CRM Insights" },
      { name: "description", content: "Construtor visual de pop-ups para captura de WhatsApp, benefícios e leads do site." },
    ],
  }),
  component: Popups,
});

function Popups() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/popups", search: { tab: value } });

  return (
    <Box sx={{ maxWidth: 1600, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab value="popups" icon={<LayoutTemplate size={16} />} iconPosition="start" label="Pop-ups" sx={{ minHeight: 40 }} />
          <Tab value="compras-recentes" icon={<ShoppingBag size={16} />} iconPosition="start" label="Compras recentes" sx={{ minHeight: 40 }} />
          <Tab value="leads" icon={<Users size={16} />} iconPosition="start" label="Leads Capturadas" sx={{ minHeight: 40 }} />
          <Tab value="trava-senha" icon={<Lock size={16} />} iconPosition="start" label="Trava por senha" sx={{ minHeight: 40 }} />
          <Tab value="instalacao" icon={<Code2 size={16} />} iconPosition="start" label="Instalação" sx={{ minHeight: 40 }} />
        </Tabs>
      </Box>

      {tab === "popups" && <PopupCampaignsManager onOpenSocialProof={() => setTab("compras-recentes")} />}
      {tab === "compras-recentes" && <SocialProofSettingsPanel />}
      {tab === "leads" && <PopupLeadsTable />}
      {tab === "trava-senha" && <PopupGatePanel />}
      {tab === "instalacao" && <PopupInstallPanel />}
    </Box>
  );
}
