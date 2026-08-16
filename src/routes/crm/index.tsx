import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal, 
  UserPlus, 
  ArrowUpRight,
  RefreshCw,
  Mail,
  Phone
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCustomersList, getCRMStats } from "@/lib/crm-segmentation.functions";
import { brl } from "@/lib/crm-mock";

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

function StatCard({ label, value, hint, trend, icon: Icon }: any) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        {trend && (
          <div className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
            <ArrowUpRight className="size-3" /> {trend}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function CRMPage() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/crm", search: { tab: value } });

  const [search, setSearch] = useState("");
  const fetchList = useServerFn(getCustomersList);
  const fetchStats = useServerFn(getCRMStats);

  const { data: stats } = useQuery({
    queryKey: ["crm-stats"],
    queryFn: () => fetchStats(),
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ["crm-customers", search],
    queryFn: () => fetchList({ data: { search } }),
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="gradient-brand flex size-11 items-center justify-center rounded-2xl text-primary-foreground">
              <Users className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Contatos</h1>
              <p className="text-sm text-muted-foreground">Gerencie e visualize todos os contatos da sua base.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2 bg-brand hover:bg-brand/90 text-white">
                  <UserPlus className="size-4" /> Adicionar contatos
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Importar CSV</DropdownMenuItem>
                <DropdownMenuItem>Sincronizar Shopify</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <div className="flex justify-center">
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="contatos" className="px-8">Contatos</TabsTrigger>
              <TabsTrigger value="segmentos" className="px-8">Segmentos</TabsTrigger>
              <TabsTrigger value="listas" className="px-8">Listas Estáticas</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="contatos" className="mt-8 space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard 
                label="Total de Contatos" 
                value={new Intl.NumberFormat().format(stats?.total || 0)} 
                hint="Todos os contatos da base." 
                trend="+42%" 
              />
              <StatCard 
                label="Leads" 
                value={new Intl.NumberFormat().format(stats?.leads || 0)} 
                hint="Contatos que nunca compraram" 
                trend="+58%" 
              />
              <StatCard 
                label="Clientes" 
                value={new Intl.NumberFormat().format(stats?.customers || 0)} 
                hint="Contatos com compras" 
                trend="+32%" 
              />
              <StatCard 
                label="Novos Contatos" 
                value={new Intl.NumberFormat().format(stats?.newContacts || 0)} 
                hint="Cadastrados nos últimos 30 dias." 
                trend="+42%" 
              />
            </div>

            <div className="surface-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Nome, e-mail ou telefone..." 
                    className="pl-9" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2">
                    Todos os status <Filter className="size-3.5" />
                  </Button>
                  <p className="text-xs text-muted-foreground">{listData?.total || 0} contatos</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-12"></TableHead>
                      <TableHead>NOME / E-MAIL</TableHead>
                      <TableHead>TELEFONE</TableHead>
                      <TableHead>PERFIL</TableHead>
                      <TableHead className="text-center">COMPRAS</TableHead>
                      <TableHead className="text-right">TOTAL GASTO</TableHead>
                      <TableHead className="text-right">ÚLTIMA COMPRA</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                          <RefreshCw className="mx-auto size-6 animate-spin" />
                          <p className="mt-2">Carregando contatos...</p>
                        </TableCell>
                      </TableRow>
                    ) : listData?.customers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                          Nenhum contato encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      listData?.customers.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-center">
                            <input type="checkbox" className="size-4 rounded border-gray-300" />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground">{c.name}</span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="size-3" /> {c.email || "—"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {c.phone ? (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Phone className="size-3" /> {c.phone}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-muted text-[10px] font-medium uppercase tracking-wider">
                              {c.totalOrders > 0 ? "Ativo" : "Lead"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-bold">{c.totalOrders}</TableCell>
                          <TableCell className="text-right font-bold">{brl(c.totalSpent)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR") : "—"}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="segmentos" className="mt-8 space-y-6">
             <div className="surface-card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Segmentos</h2>
                    <p className="text-sm text-muted-foreground">Crie e gerencie públicos dinâmicos para campanhas e automações.</p>
                  </div>
                  <Button className="gap-2 bg-brand hover:bg-brand/90 text-white">
                    <Plus className="size-4" /> Criar segmento
                  </Button>
                </div>
                
                <div className="mt-8 text-center py-20 border-2 border-dashed border-border rounded-xl">
                  <Sparkles className="mx-auto size-12 text-muted-foreground/30" />
                  <h3 className="mt-4 font-semibold">Biblioteca de segmentos</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                    Aqui você verá seus públicos dinâmicos. A interface de regras (E/OU) baseada em Comportamento, RFM e Dados Pessoais está sendo integrada.
                  </p>
                </div>
             </div>
          </TabsContent>

          <TabsContent value="listas" className="mt-8 space-y-6">
            <div className="surface-card p-6 text-center py-20 border-2 border-dashed border-border rounded-xl">
              <Plus className="mx-auto size-12 text-muted-foreground/30" />
              <h3 className="mt-4 font-semibold">Listas Estáticas</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                Agrupe contatos manualmente para envios pontuais.
              </p>
              <Button variant="outline" className="mt-4">Criar primeira lista</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
