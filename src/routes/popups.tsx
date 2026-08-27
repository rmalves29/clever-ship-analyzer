import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutTemplate, Users, Code2 } from "lucide-react";
import { PopupCampaignsManager } from "@/components/popups/PopupCampaignsManager";
import { PopupLeadsTable } from "@/components/popups/PopupLeadsTable";
import { PopupInstallPanel } from "@/components/popups/PopupInstallPanel";

const VALID_TABS = ["popups", "leads", "instalacao"] as const;

export const Route = createFileRoute("/popups")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (VALID_TABS as readonly string[]).includes(search["tab"] as string) ? (search["tab"] as string) : "popups",
  }),
  head: () => ({
    meta: [
      { title: "Pop-ups | CRM Insights" },
      { name: "description", content: "Pop-up de captura de WhatsApp no site, leads capturadas e instalação do snippet." },
    ],
  }),
  component: Popups,
});

function Popups() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/popups", search: { tab: value } });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pop-ups</h1>
        <p className="text-sm text-muted-foreground">Captura de WhatsApp no site, leads capturadas e instalação do snippet.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="popups" className="gap-1">
            <LayoutTemplate className="size-4" /> Pop-ups
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1">
            <Users className="size-4" /> Leads Capturadas
          </TabsTrigger>
          <TabsTrigger value="instalacao" className="gap-1">
            <Code2 className="size-4" /> Instalação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="popups"><PopupCampaignsManager /></TabsContent>
        <TabsContent value="leads"><PopupLeadsTable /></TabsContent>
        <TabsContent value="instalacao"><PopupInstallPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
