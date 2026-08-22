import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Fluxo de Envio</h1>
        <p className="text-sm text-muted-foreground">Grupos, campanhas e envio de mensagens no WhatsApp via UazAPI</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto grid grid-cols-6 sm:inline-flex">
          <TabsTrigger value="conexao" className="gap-1">
            <Smartphone className="size-4" /> <span className="hidden sm:inline">Conexão</span>
          </TabsTrigger>
          <TabsTrigger value="grupos" className="gap-1">
            <Users className="size-4" /> <span className="hidden sm:inline">Grupos</span>
          </TabsTrigger>
          <TabsTrigger value="campanhas" className="gap-1">
            <Megaphone className="size-4" /> <span className="hidden sm:inline">Campanhas</span>
          </TabsTrigger>
          <TabsTrigger value="envios" className="gap-1">
            <Send className="size-4" /> <span className="hidden sm:inline">Envios</span>
          </TabsTrigger>
          <TabsTrigger value="automacoes" className="gap-1">
            <Bot className="size-4" /> <span className="hidden sm:inline">Automações</span>
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1">
            <BarChart3 className="size-4" /> <span className="hidden sm:inline">Relatórios</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conexao"><ConexaoUazapi /></TabsContent>
        <TabsContent value="grupos"><GroupsManager /></TabsContent>
        <TabsContent value="campanhas"><CampaignsManager /></TabsContent>
        <TabsContent value="envios"><MessageComposer /></TabsContent>
        <TabsContent value="automacoes"><AutoMessagesManager /></TabsContent>
        <TabsContent value="relatorios"><ReportsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
