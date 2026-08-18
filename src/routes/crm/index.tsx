import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Phone,
  LayoutDashboard,
  Sparkles,
  Trash2,
  X,
  Download,
  BarChart3
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
import { getCustomersList, getCRMStats, getSegmentsList, deleteSegment, exportSegmentCustomers } from "@/lib/crm-segmentation.functions";
import { RFMAnalysis } from "@/components/crm/RFMAnalysis";
import { fixCustomerPhone, deepSyncCustomer } from "@/lib/admin-maintenance.functions";
import { normalizeAllPhones } from "@/lib/maintenance-scripts.functions";
import { brl } from "@/lib/crm-mock";
import { SegmentEditor } from "@/components/crm/SegmentEditor";
import { toast } from "sonner";

const VALID_TABS = ["contatos", "segmentos", "listas", "rfm"] as const;

export const Route = createFileRoute("/crm/")({
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
  const queryClient = useQueryClient();
  const { tab } = Route.useSearch();
  const setTab = (value: string) => navigate({ to: "/crm", search: { tab: value } });

  const [search, setSearch] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [editingSegment, setEditingSegment] = useState<any>(null);
  const [showEditor, setShowEditor] = useState(false);
  
  const fetchList = useServerFn(getCustomersList);
  const fetchStats = useServerFn(getCRMStats);
  const fetchSegments = useServerFn(getSegmentsList);
  const runDeleteSegment = useServerFn(deleteSegment);
  const runFixPhone = useServerFn(fixCustomerPhone);
  const runDeepSync = useServerFn(deepSyncCustomer);
  const runExport = useServerFn(exportSegmentCustomers);
  const runNormalizePhones = useServerFn(normalizeAllPhones);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const { csv } = await runExport({ 
        data: { 
          segmentId: selectedSegment || undefined,
          search: search || undefined
        } 
      });

      if (!csv) {
        toast.error("Nenhum dado para exportar.");
        return;
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const filename = selectedSegment 
        ? `segmento-${segments?.find(s => s.id === selectedSegment)?.nome.toLowerCase().replace(/\s+/g, '-')}.csv`
        : `contatos-crm-${new Date().toISOString().split('T')[0]}.csv`;
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Exportação concluída!");
    } catch (err: any) {
      toast.error("Erro na exportação: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const { data: stats } = useQuery({
    queryKey: ["crm-stats"],
    queryFn: () => fetchStats(),
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ["crm-customers", search, selectedSegment],
    queryFn: () => fetchList({ data: { search, segmentId: selectedSegment || undefined } }),
  });

  const { data: segments, refetch: refetchSegments } = useQuery({
    queryKey: ["crm-segments"],
    queryFn: () => fetchSegments(),
    enabled: tab === "segmentos",
  });

  const handleDeleteSegment = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este segmento?")) return;
    try {
      await runDeleteSegment({ data: { id } });
      toast.success("Segmento excluído.");
      refetchSegments();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  const handleFixPhone = async (email: string) => {
    const phone = prompt("Digite o telefone correto para " + email + " (formato: +55...):");
    if (!phone) return;
    
    const promise = runFixPhone({ data: { email, phone } });
    toast.promise(promise, {
      loading: "Corrigindo telefone...",
      success: () => {
        queryClient.refetchQueries({ queryKey: ["crm-customers"] });
        return "Telefone atualizado com sucesso!";
      },
      error: (err) => "Erro ao atualizar: " + err.message
    });
  };
  
  const handleDeepSync = async (customerId: string) => {
    const promise = runDeepSync({ data: { customerId } });
    toast.promise(promise, {
      loading: "Buscando dados detalhados na Shopify...",
      success: (res: any) => {
        if (res.success) {
          queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
          return `Sincronizado! Telefone: ${res.phone || "Não encontrado"}`;
        }
        return "Cliente não encontrado na Shopify.";
      },
      error: (err) => "Erro ao sincronizar: " + err.message
    });
  };

  if (showEditor) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-4xl">
          <SegmentEditor 
            initialData={editingSegment}
            onCancel={() => {
              setShowEditor(false);
              setEditingSegment(null);
            }} 
            onSave={() => {
              setShowEditor(false);
              setEditingSegment(null);
              refetchSegments();
            }} 
          />
        </div>
      </div>
    );
  }

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
                <DropdownMenuItem onClick={async () => {
                  const promise = runNormalizePhones();
                  toast.promise(promise, {
                    loading: "Normalizando e recuperando telefones...",
                    success: (res: any) => {
                      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
                      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
                      return `${res.fixedCount} telefones ajustados/recuperados!`;
                    },
                    error: "Erro na normalização."
                  });
                }}>
                  Ajustar todos os telefones
                </DropdownMenuItem>
                <DropdownMenuItem>Sincronizar Shopify</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <div className="flex justify-center">
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="contatos" className="px-6">Contatos</TabsTrigger>
              <TabsTrigger value="segmentos" className="px-6">Segmentos</TabsTrigger>
              <TabsTrigger value="listas" className="px-6">Listas Estáticas</TabsTrigger>
              <TabsTrigger value="rfm" className="px-6 flex gap-2 items-center">
                <BarChart3 className="size-4" /> Análise RFM
              </TabsTrigger>
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
                  {selectedSegment && (
                    <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20 gap-1 pr-1">
                      Segmento: {segments?.find(s => s.id === selectedSegment)?.nome}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="size-4 hover:bg-transparent" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSegment(null);
                        }}
                      >
                        <X className="size-3" />
                      </Button>
                    </Badge>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2"
                    onClick={handleExport}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <RefreshCw className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Exportar Lista
                  </Button>
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
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleFixPhone(c.email)}>
                                  <Phone className="mr-2 size-4" /> Corrigir Telefone
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeepSync(c.id.replace('email:', '').replace('id:', ''))}>
                                  <RefreshCw className="mr-2 size-4" /> Forçar Sincronia Shopify
                                </DropdownMenuItem>
                                <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                    <h2 className="text-lg font-bold">Biblioteca de Segmentos</h2>
                    <p className="text-sm text-muted-foreground">Públicos dinâmicos baseados em regras.</p>
                  </div>
                  <Button onClick={() => setShowEditor(true)} className="gap-2 bg-brand hover:bg-brand/90 text-white">
                    <Plus className="size-4" /> Criar segmento
                  </Button>
                </div>
                
                <div className="mt-8">
                  {segments?.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
                      <Sparkles className="mx-auto size-12 text-muted-foreground/30" />
                      <h3 className="mt-4 font-semibold">Nenhum segmento customizado</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                        Você ainda não criou segmentos baseados em regras dinâmicas.
                      </p>
                      <Button variant="outline" className="mt-4" onClick={() => setShowEditor(true)}>Criar meu primeiro segmento</Button>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {segments?.map((seg: any) => (
                        <div 
                          key={seg.id} 
                          className={`group relative rounded-xl border p-4 transition-all hover:border-brand/50 hover:shadow-md cursor-pointer ${selectedSegment === seg.id ? 'border-brand bg-brand/5 shadow-sm' : 'border-border bg-card'}`}
                          onClick={() => {
                            setSelectedSegment(seg.id);
                            setTab("contatos");
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px] uppercase font-bold text-brand border-brand/20">DINÂMICO</Badge>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="size-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteSegment(seg.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <h4 className="font-bold text-lg">{seg.nome}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{seg.descricao || "Sem descrição."}</p>
                          
                          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="size-3" /> {seg.memberCount !== undefined ? `${seg.memberCount} contatos` : "Calculando..."}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-brand text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingSegment(seg);
                                setShowEditor(true);
                              }}
                            >
                              Editar Regras
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
