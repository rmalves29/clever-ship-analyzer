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
  Sparkles,
  Trash2,
  X,
  Download,
  BarChart3,
  Pencil,
} from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getCustomersList, getCRMStats, getSegmentsList, deleteSegment, exportSegmentCustomers, saveSegment } from "@/lib/crm-segmentation.functions";
import { syncShopifyData } from "@/lib/crm-sync.functions";
import { RFMAnalysis } from "@/components/crm/RFMAnalysis";
import { ImportContactsDialog } from "@/components/crm/ImportContactsDialog";
import { fixCustomerPhone, deepSyncCustomer, checkSpecificAbandonedCheckout } from "@/lib/admin-maintenance.functions";
import { RFM_SEGMENTS_CONFIG } from "@/lib/crm-rfm-shared";
import { normalizeAllPhones } from "@/lib/maintenance-scripts.functions";
import { identifyAbandonedCheckouts } from "@/lib/abandoned-checkout.functions";
import { brl } from "@/lib/crm-mock";
import { updateCustomerTags } from "@/lib/crm-tags.functions";
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
      { name: "description", content: "Gerencie contatos, crie segmentos dinâmicos e visualize análises RFM." },
    ],
  }),
  component: CRMPage,
});

function StatCard({ label, value, hint, trend }: any) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          {label}
        </Typography>
        {trend && (
          <Chip
            size="small"
            color="success"
            icon={<ArrowUpRight size={12} />}
            label={trend}
            sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
          />
        )}
      </Stack>
      <Typography variant="h4" sx={{ fontWeight: 700, mt: 1.5 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
        {hint}
      </Typography>
    </Box>
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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenu, setRowMenu] = useState<{ el: HTMLElement; customer: any } | null>(null);

  const fetchList = useServerFn(getCustomersList);
  const fetchStats = useServerFn(getCRMStats);
  const fetchSegments = useServerFn(getSegmentsList);
  const runDeleteSegment = useServerFn(deleteSegment);
  const runFixPhone = useServerFn(fixCustomerPhone);
  const runDeepSync = useServerFn(deepSyncCustomer);
  const runExport = useServerFn(exportSegmentCustomers);
  const runSaveSegment = useServerFn(saveSegment);
  const runNormalizePhones = useServerFn(normalizeAllPhones);
  const runIdentifyAbandoned = useServerFn(identifyAbandonedCheckouts);
  const runCheckSpecificAbandoned = useServerFn(checkSpecificAbandonedCheckout);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const { csv } = await runExport({
        data: {
          segmentId: selectedSegment || undefined,
          search: search || undefined,
        },
      });

      if (!csv) {
        toast.error("Nenhum dado para exportar.");
        return;
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const filename = selectedSegment
        ? `segmento-${segments?.find((s) => s.id === selectedSegment)?.nome.toLowerCase().replace(/\s+/g, "-")}.csv`
        : `contatos-crm-${new Date().toISOString().split("T")[0]}.csv`;
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
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

  const runUpdateTags = useServerFn(updateCustomerTags);
  const handleEditTags = async (customerId: string, currentTags: string[]) => {
    const newTagsStr = prompt("Gerenciar Tags (separadas por vírgula):", currentTags.join(", "));
    if (newTagsStr === null) return;

    const tags = newTagsStr.split(",").map((t) => t.trim()).filter((t) => t.length > 0);

    const promise = runUpdateTags({ data: { customerId, tags } });
    toast.promise(promise, {
      loading: "Atualizando tags...",
      success: () => {
        queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
        return "Tags atualizadas!";
      },
      error: (err) => "Erro: " + err.message,
    });
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const runSync = useServerFn(syncShopifyData);
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await runSync({ data: { fullSync: false } });
      toast.success(`Sincronização concluída: ${res.totalImported} pedido(s) atualizados.`);
      queryClient.invalidateQueries();
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setIsSyncing(false);
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
      error: (err) => "Erro ao atualizar: " + err.message,
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
      error: (err) => "Erro ao sincronizar: " + err.message,
    });
  };

  if (showEditor) {
    return (
      <Box sx={{ minHeight: "100vh", p: 4 }}>
        <Box sx={{ maxWidth: 960, mx: "auto" }}>
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
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 4,
                background: "linear-gradient(135deg, #7367F0, #9C93F3)",
                color: "#fff",
              }}
            >
              <Users size={20} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>Contatos</Typography>
              <Typography variant="body2" color="text.secondary">Base completa de clientes e leads.</Typography>
            </Box>
          </Stack>
          <Box>
            <Button variant="contained" startIcon={<UserPlus size={16} />} onClick={(e) => setAddMenuAnchor(e.currentTarget)}>
              Adicionar contatos
            </Button>
            <Menu anchorEl={addMenuAnchor} open={Boolean(addMenuAnchor)} onClose={() => setAddMenuAnchor(null)}>
              <MenuItem onClick={() => { setAddMenuAnchor(null); setImportDialogOpen(true); }}>Importar CSV</MenuItem>
              <MenuItem
                onClick={() => {
                  setAddMenuAnchor(null);
                  const promise = runNormalizePhones();
                  toast.promise(promise, {
                    loading: "Normalizando e recuperando telefones...",
                    success: (res: any) => {
                      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
                      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
                      return `${res.fixedCount} telefones ajustados/recuperados!`;
                    },
                    error: "Erro na normalização.",
                  });
                }}
              >
                Ajustar todos os telefones
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAddMenuAnchor(null);
                  const promise = runIdentifyAbandoned();
                  toast.promise(promise, {
                    loading: "Analisando checkouts abandonados...",
                    success: (res: any) => {
                      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
                      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
                      return res.message;
                    },
                    error: "Erro na análise de abandono.",
                  });
                }}
              >
                Identificar Checkouts Abandonados
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAddMenuAnchor(null);
                  const query = prompt("Digite o nome ou e-mail da cliente para buscar na Shopify:");
                  if (!query) return;

                  const promise = runCheckSpecificAbandoned({ data: { query } });
                  toast.promise(promise, {
                    loading: `Buscando '${query}' na Shopify...`,
                    success: (res: any) => {
                      if (res.success) {
                        queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
                        queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
                        return res.message;
                      }
                      return res.message || "Não encontrado.";
                    },
                    error: (err) => "Erro na busca: " + err.message,
                  });
                }}
              >
                Localizar Cliente Específico (Shopify)
              </MenuItem>
              <MenuItem onClick={() => { setAddMenuAnchor(null); handleSync(); }} disabled={isSyncing}>
                Sincronizar Shopify
              </MenuItem>
            </Menu>
          </Box>
        </Stack>

        <Box sx={{ mt: 4 }}>
          <Stack direction="row" sx={{ justifyContent: "center" }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab value="contatos" label="Contatos" sx={{ px: 3 }} />
              <Tab value="segmentos" label="Segmentos" sx={{ px: 3 }} />
              <Tab value="listas" label="Listas Estáticas" sx={{ px: 3 }} />
              <Tab value="rfm" icon={<BarChart3 size={16} />} iconPosition="start" label="Análise RFM" sx={{ px: 3 }} />
            </Tabs>
          </Stack>

          {tab === "contatos" && (
            <Stack spacing={4} sx={{ mt: 4 }}>
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" } }}>
                <StatCard label="Total de Contatos" value={new Intl.NumberFormat().format(stats?.total || 0)} hint="Todos os contatos da base." trend="+42%" />
                <StatCard label="Checkouts Abandonados" value={new Intl.NumberFormat().format(stats?.abandoned || 0)} hint="Identificados por pedidos expirados" trend="+15%" />
                <StatCard label="Clientes" value={new Intl.NumberFormat().format(stats?.customers || 0)} hint="Contatos com compras" trend="+32%" />
                <StatCard label="Novos Contatos" value={new Intl.NumberFormat().format(stats?.newContacts || 0)} hint="Cadastrados nos últimos 30 dias." trend="+42%" />
              </Box>

              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
                <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid", borderColor: "divider", p: 2 }}>
                  <TextField
                    size="small"
                    placeholder="Nome, e-mail ou telefone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ width: "100%", maxWidth: 384 }}
                    slotProps={{ input: { startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.5 }} /> } }}
                  />
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    {selectedSegment && (
                      <Chip
                        color="primary"
                        variant="outlined"
                        label={`Segmento: ${segments?.find((s) => s.id === selectedSegment)?.nome}`}
                        onDelete={() => setSelectedSegment(null)}
                        deleteIcon={<X size={12} />}
                      />
                    )}
                    <Button
                      variant="outline"
                      size="small"
                      startIcon={isExporting ? <CircularProgress size={14} /> : <Download size={14} />}
                      onClick={handleExport}
                      disabled={isExporting}
                    >
                      Exportar Lista
                    </Button>
                    <Button variant="outline" size="small" endIcon={<Filter size={14} />}>
                      Todos os status
                    </Button>
                    <Typography variant="caption" color="text.secondary">{listData?.total || 0} contatos</Typography>
                  </Stack>
                </Stack>

                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "action.hover" }}>
                        <TableCell padding="checkbox" />
                        <TableCell>NOME / E-MAIL</TableCell>
                        <TableCell>TELEFONE</TableCell>
                        <TableCell>TAGS</TableCell>
                        <TableCell>RFM / PERFIL</TableCell>
                        <TableCell align="center">COMPRAS</TableCell>
                        <TableCell align="right">TOTAL GASTO</TableCell>
                        <TableCell align="right">ÚLTIMA COMPRA</TableCell>
                        <TableCell padding="checkbox" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={9} align="center" sx={{ height: 128 }}>
                            <CircularProgress size={24} />
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Carregando contatos...</Typography>
                          </TableCell>
                        </TableRow>
                      ) : listData?.customers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} align="center" sx={{ height: 128, color: "text.secondary" }}>
                            Nenhum contato encontrado.
                          </TableCell>
                        </TableRow>
                      ) : (
                        listData?.customers.map((c: any) => (
                          <TableRow key={c.id} hover>
                            <TableCell padding="checkbox">
                              <Checkbox size="small" />
                            </TableCell>
                            <TableCell>
                              <Box
                                component="button"
                                type="button"
                                onClick={() => navigate({ to: "/crm/cliente/$customerId", params: { customerId: c.id } })}
                                sx={{ display: "block", textAlign: "left", background: "none", border: "none", p: 0, cursor: "pointer", fontWeight: 600, fontSize: 14, color: "text.primary", "&:hover": { color: "primary.main", textDecoration: "underline" } }}
                              >
                                {c.name}
                              </Box>
                              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
                                <Mail size={12} />
                                <Typography variant="caption">{c.email || "—"}</Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              {c.phone ? (
                                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
                                  <Phone size={12} />
                                  <Typography variant="body2">{c.phone}</Typography>
                                </Stack>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", maxWidth: 200, alignItems: "center" }}>
                                {(c.tagsCustom || []).map((tag: string) => (
                                  <Chip key={tag} size="small" variant="outlined" color="primary" label={tag} sx={{ fontSize: 10, height: 20 }} />
                                ))}
                                <IconButton size="small" onClick={() => handleEditTags(c.id, c.tagsCustom || [])}>
                                  <Plus size={12} />
                                </IconButton>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                                {c.rfmSegment && (
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    label={c.rfmSegment}
                                    sx={{
                                      fontSize: 9,
                                      height: 18,
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      color: RFM_SEGMENTS_CONFIG[c.rfmSegment as keyof typeof RFM_SEGMENTS_CONFIG]?.color,
                                      borderColor: `${RFM_SEGMENTS_CONFIG[c.rfmSegment as keyof typeof RFM_SEGMENTS_CONFIG]?.color}40`,
                                    }}
                                  />
                                )}
                                <Chip
                                  size="small"
                                  label={c.tags?.includes("Carrinho Abandonado") ? "Carrinho" : (c.totalOrders > 0 ? "Ativo" : "Lead")}
                                  sx={{ fontSize: 10, height: 20, textTransform: "uppercase", fontWeight: 500 }}
                                />
                              </Stack>
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700 }}>{c.totalOrders}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>{brl(c.totalSpent)}</TableCell>
                            <TableCell align="right" sx={{ color: "text.secondary" }}>
                              {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR") : "—"}
                            </TableCell>
                            <TableCell padding="checkbox">
                              <IconButton size="small" onClick={(e) => setRowMenu({ el: e.currentTarget, customer: c })}>
                                <MoreHorizontal size={16} />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Stack>
          )}

          {tab === "segmentos" && (
            <Stack spacing={3} sx={{ mt: 4 }}>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3 }}>
                <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Biblioteca de Segmentos</Typography>
                    <Typography variant="body2" color="text.secondary">Públicos dinâmicos baseados em regras.</Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outline"
                      startIcon={<Sparkles size={16} />}
                      sx={{ borderColor: "primary.main", color: "primary.main" }}
                      onClick={async () => {
                        const segmentsToCreate = [
                          {
                            nome: "Compraram Hoje (Calendário)",
                            descricao: "Clientes que realizaram pedidos no dia de hoje (00:00 às 23:59).",
                            regras: { groups: [{ id: "g1", type: "AND", conditions: [{ id: "c1", category: "comportamento", field: "data_pedido_hoje", operator: "eq", value: "sim", label: "Compra Realizada Hoje" }] }] },
                          },
                          {
                            nome: "Compraram nas últimas 24h",
                            descricao: "Clientes que realizaram pedidos nas últimas 24 horas a partir de agora.",
                            regras: { groups: [{ id: "g1", type: "AND", conditions: [{ id: "c1", category: "comportamento", field: "data_pedido_24h", operator: "eq", value: "sim", label: "Compra Realizada (Últimas 24h)" }] }] },
                          },
                          {
                            nome: "Enviados Hoje",
                            descricao: "Pedidos que tiveram o envio processado hoje.",
                            regras: { groups: [{ id: "g1", type: "AND", conditions: [{ id: "c1", category: "comportamento", field: "data_envio_hoje", operator: "eq", value: "sim", label: "Pedido Enviado Hoje" }] }] },
                          },
                          {
                            nome: "Pedido Pendente (Pix)",
                            descricao: "Clientes com pedido criado hoje aguardando confirmação de pagamento (ex.: Pix via Mercado Pago).",
                            regras: { groups: [{ id: "g1", type: "AND", conditions: [{ id: "c1", category: "comportamento", field: "pedido_pendente_hoje", operator: "eq", value: "sim", label: "Pedido Pendente (Pix) Criado Hoje" }] }] },
                          },
                          {
                            nome: "Checkouts Abandonados (CAR24)",
                            descricao: "Clientes capturados da integração de checkouts abandonados da Shopify.",
                            regras: { groups: [{ id: "g1", type: "AND", conditions: [{ id: "c1", category: "comportamento", field: "checkout_abandonado", operator: "eq", value: "sim", label: "Checkout Abandonado (CAR24)" }] }] },
                          },
                          {
                            nome: "Acessou e Não Comprou",
                            descricao: "Leads que interagiram mas ainda não possuem pedidos.",
                            regras: { groups: [{ id: "g1", type: "AND", conditions: [{ id: "c1", category: "comportamento", field: "perfil", operator: "eq", value: "acesso_sem_compra", label: "Acessou e não comprou" }] }] },
                          },
                          {
                            nome: "Primeira Compra",
                            descricao: "Clientes que realizaram sua primeira e única compra.",
                            regras: { groups: [{ id: "g1", type: "AND", conditions: [{ id: "c1", category: "comportamento", field: "perfil", operator: "eq", value: "primeira_compra", label: "Perfil do Cliente" }] }] },
                          },
                        ];

                        try {
                          const existingNames = new Set((segments || []).map((s: any) => s.nome));
                          const toCreate = segmentsToCreate.filter((seg) => !existingNames.has(seg.nome));

                          if (toCreate.length === 0) {
                            toast.info("Os segmentos sugeridos já existem.");
                            return;
                          }

                          for (const seg of toCreate) {
                            await runSaveSegment({ data: { ...seg, tipo: "dinamico" } as any });
                          }
                          toast.success("Segmentos sugeridos criados com sucesso!");
                          refetchSegments();
                        } catch (err: any) {
                          toast.error("Erro ao criar segmentos: " + err.message);
                        }
                      }}
                    >
                      Criar Segmentos Sugeridos
                    </Button>
                    <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setShowEditor(true)}>
                      Criar segmento
                    </Button>
                  </Stack>
                </Stack>

                <Box sx={{ mt: 4 }}>
                  {segments?.length === 0 ? (
                    <Box sx={{ textAlign: "center", py: 8, border: "2px dashed", borderColor: "divider", borderRadius: 3 }}>
                      <Sparkles size={48} style={{ margin: "0 auto", opacity: 0.3 }} />
                      <Typography sx={{ fontWeight: 600, mt: 2 }}>Nenhum segmento customizado</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 384, mx: "auto", mt: 0.5 }}>
                        Você ainda não criou segmentos baseados em regras dinâmicas.
                      </Typography>
                      <Button variant="outline" sx={{ mt: 2 }} onClick={() => setShowEditor(true)}>Criar meu primeiro segmento</Button>
                    </Box>
                  ) : (
                    <Stack spacing={1}>
                      {segments?.map((seg: any) => (
                        <Stack
                          key={seg.id}
                          direction="row"
                          spacing={2}
                          sx={{
                            flexWrap: "wrap",
                            alignItems: "center",
                            border: "1px solid",
                            borderColor: selectedSegment === seg.id ? "primary.main" : "divider",
                            bgcolor: selectedSegment === seg.id ? "action.hover" : "transparent",
                            borderRadius: 3,
                            p: 2,
                          }}
                        >
                          <Box sx={{ minWidth: 200, flex: 1 }}>
                            <Typography sx={{ fontWeight: 600 }}>{seg.nome}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {seg.descricao || "Sem descrição."}
                            </Typography>
                          </Box>
                          <Chip size="small" variant="outlined" color="primary" label="DINÂMICO" sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }} />
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
                            <Users size={12} />
                            <Typography variant="caption">{seg.memberCount !== undefined ? `${seg.memberCount} contatos` : "Calculando..."}</Typography>
                          </Stack>
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => {
                              setSelectedSegment(seg.id);
                              setTab("contatos");
                            }}
                          >
                            Ver Contatos
                          </Button>
                          <Button
                            variant="outline"
                            size="small"
                            startIcon={<Pencil size={14} />}
                            onClick={() => {
                              setEditingSegment(seg);
                              setShowEditor(true);
                            }}
                          >
                            Editar Regras
                          </Button>
                          <IconButton size="small" onClick={() => handleDeleteSegment(seg.id)}>
                            <Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" />
                          </IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Box>
            </Stack>
          )}

          {tab === "listas" && (
            <Box sx={{ mt: 4, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 3, textAlign: "center", py: 8, borderStyle: "dashed" }}>
              <Plus size={48} style={{ margin: "0 auto", opacity: 0.3 }} />
              <Typography sx={{ fontWeight: 600, mt: 2 }}>Listas Estáticas</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 384, mx: "auto", mt: 0.5 }}>
                Agrupe contatos manualmente para envios pontuais.
              </Typography>
              <Button variant="outline" sx={{ mt: 2 }}>Criar primeira lista</Button>
            </Box>
          )}

          {tab === "rfm" && (
            <Box sx={{ mt: 4 }}>
              <RFMAnalysis />
            </Box>
          )}
        </Box>
      </Box>

      <Menu anchorEl={rowMenu?.el} open={Boolean(rowMenu)} onClose={() => setRowMenu(null)}>
        <MenuItem onClick={() => { handleFixPhone(rowMenu!.customer.email); setRowMenu(null); }}>
          <Phone size={14} style={{ marginRight: 8 }} /> Corrigir Telefone
        </MenuItem>
        <MenuItem onClick={() => { handleDeepSync(String(rowMenu!.customer.id).replace("email:", "").replace("id:", "")); setRowMenu(null); }}>
          <RefreshCw size={14} style={{ marginRight: 8 }} /> Forçar Sincronia Shopify
        </MenuItem>
        <MenuItem
          onClick={() => {
            navigate({ to: "/crm/cliente/$customerId", params: { customerId: rowMenu!.customer.id } });
            setRowMenu(null);
          }}
        >
          Ver Detalhes 360º
        </MenuItem>
      </Menu>

      <ImportContactsDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
    </Box>
  );
}
