import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { Banknote, Receipt, Settings2, Users } from "lucide-react";
import { AffiliatesManager } from "@/components/afiliadas/AffiliatesManager";
import { AffiliateSalesPanel } from "@/components/afiliadas/AffiliateSalesPanel";
import { AffiliatePayoutsPanel } from "@/components/afiliadas/AffiliatePayoutsPanel";
import { AffiliateSettingsPanel } from "@/components/afiliadas/AffiliateSettingsPanel";

const VALID_TABS = ["afiliadas", "vendas", "pagamentos", "configuracoes"] as const;

export const Route = createFileRoute("/afiliadas")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (VALID_TABS as readonly string[]).includes(search["tab"] as string) ? (search["tab"] as string) : "afiliadas",
  }),
  head: () => ({
    meta: [
      { title: "Afiliadas | CRM Insights" },
      { name: "description", content: "Programa de afiliadas: cadastro, cupom exclusivo, vendas, comissões e pagamentos." },
    ],
  }),
  component: Afiliadas,
});

function Afiliadas() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/afiliadas", search: { tab: value } });

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab value="afiliadas" icon={<Users size={16} />} iconPosition="start" label="Afiliadas" sx={{ minHeight: 40 }} />
          <Tab value="vendas" icon={<Receipt size={16} />} iconPosition="start" label="Vendas e comissões" sx={{ minHeight: 40 }} />
          <Tab value="pagamentos" icon={<Banknote size={16} />} iconPosition="start" label="Pagamentos" sx={{ minHeight: 40 }} />
          <Tab value="configuracoes" icon={<Settings2 size={16} />} iconPosition="start" label="Configurações" sx={{ minHeight: 40 }} />
        </Tabs>
      </Box>

      {tab === "afiliadas" && <AffiliatesManager />}
      {tab === "vendas" && <AffiliateSalesPanel />}
      {tab === "pagamentos" && <AffiliatePayoutsPanel />}
      {tab === "configuracoes" && <AffiliateSettingsPanel />}
    </Box>
  );
}
