import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users } from "lucide-react";

const VALID_TABS = ["contatos", "segmentos", "listas"] as const;

export const Route = createFileRoute("/crm")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (VALID_TABS as readonly string[]).includes(search["tab"] as string) ? (search["tab"] as string) : "contatos",
  }),
  head: () => ({
    meta: [
      { title: "Gestão de Clientes | CRM Insights" },
      { name: "description", content: "Gerencie contatos, crie segmentos dinâmicos e organize listas estáticas para suas campanhas." },
    ],
  }),
  component: CRMPage,
});

function CRMPage() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/crm", search: { tab: value } });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <div className="flex items-center gap-4">
          <span className="gradient-brand flex size-11 items-center justify-center rounded-2xl text-primary-foreground">
            <Users className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Clientes</h1>
            <p className="text-sm text-muted-foreground">Gerencie sua base de contatos e crie públicos personalizados.</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList>
            <TabsTrigger value="contatos">Contatos</TabsTrigger>
            <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
            <TabsTrigger value="listas">Listas Estáticas</TabsTrigger>
          </TabsList>

          <TabsContent value="contatos">
            <div className="mt-6">
              <p className="text-muted-foreground">Em breve: Lista detalhada de todos os clientes Shopify com filtros rápidos.</p>
            </div>
          </TabsContent>

          <TabsContent value="segmentos">
            <div className="mt-6">
              <p className="text-muted-foreground">Em breve: Biblioteca de segmentos dinâmicos e editor de regras.</p>
            </div>
          </TabsContent>

          <TabsContent value="listas">
            <div className="mt-6">
              <p className="text-muted-foreground">Em breve: Gestão de listas estáticas manuais.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
