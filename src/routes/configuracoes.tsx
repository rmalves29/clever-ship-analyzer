import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Save,
  ChevronLeft,
  Sparkles,
  MessageCircle,
  Link2,
} from "lucide-react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { toast } from "sonner";
import { testShopifyConnection } from "@/lib/shopify-operations.functions";
import { syncShopifyData } from "@/lib/crm-sync.functions";
import { getStoreSettings, saveStoreSettings } from "@/lib/store-settings.functions";
import { getLatestAiAnalysis, saveOpenAiApiKey } from "@/lib/ai-analysis.functions";
import { getWhatsappMetaStatus, saveWhatsappMetaSettings, activateTemplateStatusWebhook } from "@/lib/whatsapp-meta.functions";
import { getLiveLaunchpadStatus, saveLiveLaunchpadSettings } from "@/lib/live-launchpad-settings.functions";
import { EmbeddedSignupButton } from "@/components/crm/EmbeddedSignupButton";

export const Route = createFileRoute("/configuracoes")({
  component: Configuracoes,
});

function Configuracoes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [formData, setFormData] = useState({
    domain: "",
    clientId: "",
    clientSecret: "",
  });

  // Load store settings (server-side, secrets never leave the server)
  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ["store-settings"],
    queryFn: () => getStoreSettings(),
  });

  // Update form when data loads
  useEffect(() => {
    if (settings) {
      setFormData((prev) => ({
        ...prev,
        domain: settings.domain || "",
      }));
    }
  }, [settings]);

  const testConnectionMutation = useMutation({
    mutationFn: () => testShopifyConnection({ data: {} }),
    onSuccess: (res: any) => {
      console.log("Test Connection Result:", res);
      if (res.success) {
        toast.success(res.message || "Conexão testada com sucesso!");
        refetch();
      } else {
        toast.error(res.message || "Erro ao testar conexão");
      }
    },
    onError: (err: any) => {
      toast.error("Erro na requisição: " + err.message);
    }
  });

  const [openAiKey, setOpenAiKey] = useState("");
  const { data: aiStatus, refetch: refetchAiStatus } = useQuery({
    queryKey: ["ai-analysis-status"],
    queryFn: () => getLatestAiAnalysis(),
  });
  const saveOpenAiMutation = useMutation({
    mutationFn: () => saveOpenAiApiKey({ data: { apiKey: openAiKey.trim() } }),
    onSuccess: (res: any) => {
      if (res.success) {
        toast.success("API key da OpenAI salva.");
        setOpenAiKey("");
        refetchAiStatus();
      } else {
        toast.error(res.error || "Erro ao salvar a API key.");
      }
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const [liveLaunchpadForm, setLiveLaunchpadForm] = useState({ url: "https://hxtbsieodbtzgcvvkeqx.supabase.co", key: "" });
  const { data: liveLaunchpadStatus, refetch: refetchLiveLaunchpad } = useQuery({
    queryKey: ["live-launchpad-status"],
    queryFn: () => getLiveLaunchpadStatus(),
  });
  useEffect(() => {
    if (liveLaunchpadStatus?.url) {
      setLiveLaunchpadForm((prev) => ({ ...prev, url: liveLaunchpadStatus.url as string }));
    }
  }, [liveLaunchpadStatus]);
  const saveLiveLaunchpadMutation = useMutation({
    mutationFn: () => saveLiveLaunchpadSettings({ data: { url: liveLaunchpadForm.url.trim(), serviceRoleKey: liveLaunchpadForm.key.trim() } }),
    onSuccess: (res: any) => {
      if (res.success) {
        toast.success("Conexão com o live-launchpad-79 salva.");
        setLiveLaunchpadForm((prev) => ({ ...prev, key: "" }));
        refetchLiveLaunchpad();
      } else {
        toast.error(res.error || "Erro ao salvar.");
      }
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const [waForm, setWaForm] = useState({
    accessToken: "",
    phoneNumberId: "",
    templateName: "",
    templateLanguage: "",
    wabaId: "",
    verifyToken: "",
    costMarketing: "",
    costUtility: "",
    appId: "",
    appSecret: "",
    configId: "",
  });
  const { data: waStatus, refetch: refetchWaStatus } = useQuery({
    queryKey: ["whatsapp-meta-status"],
    queryFn: () => getWhatsappMetaStatus(),
  });
  useEffect(() => {
    if (waStatus) {
      setWaForm((prev) => ({
        ...prev,
        templateName: prev.templateName || waStatus.templateName,
        templateLanguage: prev.templateLanguage || waStatus.templateLanguage,
        costMarketing: prev.costMarketing || (waStatus.costMarketing != null ? String(waStatus.costMarketing) : ""),
        costUtility: prev.costUtility || (waStatus.costUtility != null ? String(waStatus.costUtility) : ""),
      }));
    }
  }, [waStatus]);
  const saveWaMutation = useMutation({
    mutationFn: () =>
      saveWhatsappMetaSettings({
        data: {
          accessToken: waForm.accessToken.trim() || undefined,
          phoneNumberId: waForm.phoneNumberId.trim() || undefined,
          templateName: waForm.templateName.trim() || undefined,
          templateLanguage: waForm.templateLanguage.trim() || undefined,
          wabaId: waForm.wabaId.trim() || undefined,
          verifyToken: waForm.verifyToken.trim() || undefined,
          costMarketing: waForm.costMarketing.trim() ? Number(waForm.costMarketing) : undefined,
          costUtility: waForm.costUtility.trim() ? Number(waForm.costUtility) : undefined,
          appId: waForm.appId.trim() || undefined,
          appSecret: waForm.appSecret.trim() || undefined,
          configId: waForm.configId.trim() || undefined,
        },
      }),
    onSuccess: (res: any) => {
      if (res.success) {
        toast.success("Configurações do WhatsApp (Meta) salvas.");
        setWaForm((prev) => ({
          ...prev,
          accessToken: "",
          phoneNumberId: "",
          wabaId: "",
          verifyToken: "",
          appSecret: "",
        }));
        refetchWaStatus();
      } else {
        toast.error(res.error || "Erro ao salvar.");
      }
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const activateTemplateWebhookMutation = useMutation({
    mutationFn: () => activateTemplateStatusWebhook(),
    onSuccess: (res: any) => {
      if (res.success) toast.success("Notificações de aprovação de template ativadas.");
      else toast.error(res.error || "Erro ao ativar.");
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await saveStoreSettings({
        data: {
          domain: formData.domain,
          clientId: formData.clientId || undefined,
          clientSecret: formData.clientSecret || undefined,
        },
      });
      setFormData((prev) => ({ ...prev, clientId: "", clientSecret: "" }));
      toast.success("Configurações salvas com sucesso!");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // @ts-ignore - syncShopifyData return type might be tricky but we know its shape from implementation
      const res = await syncShopifyData({ data: { fullSync: false } });
      if (res.success) {
        toast.success(`Sincronização concluída: ${res.totalImported} pedidos importados.`);
        queryClient.invalidateQueries();
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <RefreshCw size={32} className="animate-spin" color="var(--mui-palette-primary-main, #7367F0)" />
      </Box>
    );
  }

  const isTesting = testConnectionMutation.isPending;
  const testResult = testConnectionMutation.data as any;

  const renderScopesStatus = () => {
    if (!testResult?.scopes) return null;
    return (
      <Stack spacing={1} sx={{ mt: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>Permissões (Scopes):</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          {testResult.scopes.map((scope: any) => (
            <Chip
              key={typeof scope === "string" ? scope : scope.handle}
              size="small"
              variant="outlined"
              color="success"
              title={typeof scope === "object" ? scope.description : undefined}
              label={typeof scope === "string" ? scope : scope.handle}
            />
          ))}
          {testResult.missingScopes?.map((scope: string) => (
            <Chip key={scope} size="small" color="error" label={`Faltando: ${scope}`} />
          ))}
        </Stack>
      </Stack>
    );
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
        <Stack direction="row" sx={{ mb: 4, alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <IconButton onClick={() => navigate({ to: "/" })}>
              <ChevronLeft size={20} />
            </IconButton>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>Qual banco de dados está sendo usado no projeto?</Typography>
              <Typography variant="body2" color="text.secondary">Exibir qual banco de dados está sendo usado nas configurações do sistema para eu conferir facilmente.</Typography>
            </Box>
          </Stack>
          <Chip
            color={settings?.syncStatus === "connected" ? "primary" : "default"}
            label={settings?.syncStatus === "connected" ? "Conectado" : "Não configurado"}
          />
        </Stack>

        <Stack spacing={4}>
          <Card component="form" onSubmit={handleSave} variant="outlined">
            <CardHeader
              title={
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Store size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Credenciais Shopify Admin API</Typography>
                </Stack>
              }
              subheader="Use o fluxo oficial client_credentials. Crie um App Customizado no Admin da Shopify para obter estas chaves."
            />
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  label="Domínio da Loja (.myshopify.com)"
                  placeholder="minha-loja.myshopify.com"
                  value={formData.domain}
                  onChange={(e) => setFormData((prev) => ({ ...prev, domain: e.target.value }))}
                  required
                  fullWidth
                />
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  <TextField
                    label="API Key (Client ID)"
                    type="password"
                    placeholder={settings?.hasClientId ? "•••••••• (salvo)" : ""}
                    value={formData.clientId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, clientId: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="API Secret Key (Client Secret)"
                    type="password"
                    placeholder={settings?.hasClientSecret ? "•••••••• (salvo)" : ""}
                    value={formData.clientSecret}
                    onChange={(e) => setFormData((prev) => ({ ...prev, clientSecret: e.target.value }))}
                    fullWidth
                  />
                </Box>
                <Alert severity="info" icon={<ShieldCheck size={18} />}>
                  <AlertTitle>Segurança</AlertTitle>
                  <Typography variant="caption">
                    Suas credenciais são armazenadas com segurança e nunca expostas ao navegador. A autenticação é realizada exclusivamente no servidor.
                  </Typography>
                </Alert>
                {renderScopesStatus()}
                <Box sx={{ mt: 1, borderRadius: 3, border: "1px solid", borderColor: "warning.light", bgcolor: "warning.50", p: 2 }}>
                  <Stack direction="row" spacing={1.5}>
                    <AlertCircle size={20} color="var(--mui-palette-warning-main, #FF9F43)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <Stack spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: "warning.dark" }}>
                        Permissões Necessárias na Shopify
                      </Typography>
                      <Typography variant="caption" sx={{ color: "warning.dark" }}>
                        Para o sistema funcionar perfeitamente, você precisa liberar as seguintes permissões (Scopes) no seu App Customizado da Shopify:
                      </Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2.5, color: "warning.dark" }}>
                        <Typography component="li" variant="caption"><strong>read_orders</strong>: Para importar e analisar seus pedidos e vendas.</Typography>
                        <Typography component="li" variant="caption"><strong>read_customers</strong>: Para gerenciar o CRM e criar segmentações.</Typography>
                        <Typography component="li" variant="caption"><strong>read_products</strong>: Para identificar quais produtos seus clientes estão comprando.</Typography>
                        <Typography component="li" variant="caption"><strong>read_fulfillments</strong>: Para calcular o tempo médio de envio e rastreio.</Typography>
                        <Typography component="li" variant="caption"><strong>read_all_orders</strong>: Recomendado para acessar histórico completo.</Typography>
                        <Typography component="li" variant="caption"><strong>read_checkouts</strong>: Necessário para importar checkouts abandonados e recuperar clientes.</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ fontStyle: "italic", fontSize: 10, color: "warning.dark" }}>
                        Configurações &gt; Apps e canais de vendas &gt; Desenvolver apps &gt; [Seu App] &gt; Configuração da API Admin.
                      </Typography>
                    </Stack>
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
            <Divider />
            <CardActions sx={{ justifyContent: "space-between", px: 3, py: 2 }}>
              <Button
                type="button"
                variant="outlined"
                startIcon={<RefreshCw size={16} className={isTesting ? "animate-spin" : undefined} />}
                onClick={async (e) => {
                  e.preventDefault();
                  await testConnectionMutation.mutateAsync();
                }}
                disabled={isTesting || (!settings?.hasClientSecret && !formData.clientSecret)}
              >
                Testar Conexão
              </Button>
              <Button type="submit" variant="contained" startIcon={isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />} disabled={isSaving}>
                Salvar Configurações
              </Button>
            </CardActions>
          </Card>

          <Card variant="outlined">
            <CardHeader
              title={
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Sparkles size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Análise por IA (ChatGPT)</Typography>
                </Stack>
              }
              subheader='Usada pelo botão "Refazer análise" no dashboard para gerar o resumo executivo e as ações sugeridas a partir dos dados reais da Shopify.'
            />
            <CardContent>
              <Stack spacing={1.5}>
                <TextField
                  label="API Key da OpenAI"
                  type="password"
                  placeholder={aiStatus?.hasApiKey ? "•••••••• (salva)" : "sk-..."}
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  fullWidth
                />
                {aiStatus?.generatedAt && (
                  <Typography variant="caption" color="text.secondary">
                    Última análise gerada em {new Date(aiStatus.generatedAt).toLocaleString("pt-BR")}.
                  </Typography>
                )}
              </Stack>
            </CardContent>
            <Divider />
            <CardActions sx={{ justifyContent: "space-between", px: 3, py: 2 }}>
              <Stack
                component="a"
                direction="row"
                spacing={0.5}
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                sx={{ alignItems: "center", color: "text.secondary", textDecoration: "none", fontSize: 14, "&:hover": { textDecoration: "underline" } }}
              >
                <span>Gerar uma API key</span> <ExternalLink size={12} />
              </Stack>
              <Button
                type="button"
                variant="contained"
                startIcon={saveOpenAiMutation.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                onClick={() => saveOpenAiMutation.mutate()}
                disabled={saveOpenAiMutation.isPending || openAiKey.trim().length < 20}
              >
                Salvar API Key
              </Button>
            </CardActions>
          </Card>

          <Card variant="outlined">
            <CardHeader
              title={
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Link2 size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Live Launchpad (Fluxo de Envio)</Typography>
                </Stack>
              }
              subheader={
                <>
                  Conexão com o banco do live-launchpad-79 (OrderZaps) — é de lá que o Fluxo de Envio lê e escreve
                  grupos e campanhas de verdade, escopado ao tenant Mania de Mulher. Chave service_role do projeto
                  Supabase <Box component="code" sx={{ borderRadius: 1, bgcolor: "action.hover", px: 0.5 }}>hxtbsieodbtzgcvvkeqx</Box>.
                </>
              }
            />
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  label="URL do projeto Supabase"
                  value={liveLaunchpadForm.url}
                  onChange={(e) => setLiveLaunchpadForm((prev) => ({ ...prev, url: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="Service Role Key"
                  type="password"
                  placeholder={liveLaunchpadStatus?.hasKey ? "•••••••• (salva)" : "eyJ..."}
                  value={liveLaunchpadForm.key}
                  onChange={(e) => setLiveLaunchpadForm((prev) => ({ ...prev, key: e.target.value }))}
                  fullWidth
                />
              </Stack>
            </CardContent>
            <Divider />
            <CardActions sx={{ justifyContent: "space-between", px: 3, py: 2 }}>
              <Stack
                component="a"
                direction="row"
                spacing={0.5}
                href="https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/settings/api"
                target="_blank"
                rel="noreferrer"
                sx={{ alignItems: "center", color: "text.secondary", textDecoration: "none", fontSize: 14, "&:hover": { textDecoration: "underline" } }}
              >
                <span>Pegar a chave no Supabase</span> <ExternalLink size={12} />
              </Stack>
              <Button
                type="button"
                variant="contained"
                startIcon={saveLiveLaunchpadMutation.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                onClick={() => saveLiveLaunchpadMutation.mutate()}
                disabled={saveLiveLaunchpadMutation.isPending || !liveLaunchpadForm.url.trim() || !liveLaunchpadForm.key.trim()}
              >
                Salvar
              </Button>
            </CardActions>
          </Card>

          <Card variant="outlined">
            <CardHeader
              title={
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <MessageCircle size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>WhatsApp — API Oficial da Meta</Typography>
                </Stack>
              }
              subheader={
                <>
                  Usada pelo botão "Aplicar ação" no dashboard pra disparar campanhas de WhatsApp pros clientes reais de
                  cada segmento. Requer um app no Meta for Developers com o produto WhatsApp, um número verificado e
                  pelo menos 1 template de mensagem (categoria Marketing) já aprovado pela Meta — o corpo do template
                  deve ter no máximo 1 variável (ex: {"{{1}}"} = oferta).
                </>
              }
            />
            <CardContent>
              <Stack spacing={3}>
                <Stack spacing={2} sx={{ border: "1px solid", borderColor: "divider", bgcolor: "action.hover", borderRadius: 3, p: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Conexão automática (recomendado)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Configure seu app da Meta uma vez (App ID, App Secret e Config ID do Cadastro Incorporado) e depois
                      conecte com um clique — sem copiar token, WABA ID ou Phone Number ID manualmente.
                    </Typography>
                  </Box>
                  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
                    <TextField
                      label="App ID"
                      placeholder={waStatus?.appId ? waStatus.appId : "ex: 2358751441288240"}
                      value={waForm.appId}
                      onChange={(e) => setWaForm((prev) => ({ ...prev, appId: e.target.value }))}
                      fullWidth
                    />
                    <TextField
                      label="App Secret"
                      type="password"
                      placeholder={waStatus?.hasAppSecret ? "•••••••• (salvo)" : "Configurações do app → Básico"}
                      value={waForm.appSecret}
                      onChange={(e) => setWaForm((prev) => ({ ...prev, appSecret: e.target.value }))}
                      fullWidth
                    />
                    <TextField
                      label="Config ID (Cadastro Incorporado)"
                      placeholder={waStatus?.configId ? waStatus.configId : "ex: 2595083274228237"}
                      value={waForm.configId}
                      onChange={(e) => setWaForm((prev) => ({ ...prev, configId: e.target.value }))}
                      fullWidth
                    />
                  </Box>
                  <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={() => saveWaMutation.mutate()}
                      disabled={saveWaMutation.isPending}
                    >
                      Salvar App ID / Secret / Config ID
                    </Button>
                    {waStatus?.appId && waStatus?.configId && (
                      <EmbeddedSignupButton appId={waStatus.appId} configId={waStatus.configId} onConnected={() => refetchWaStatus()} />
                    )}
                  </Stack>
                </Stack>

                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Ou configure manualmente</Typography>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  <TextField
                    label="Token de Acesso Permanente"
                    type="password"
                    placeholder={waStatus?.hasAccessToken ? "•••••••• (salvo)" : "EAAG..."}
                    value={waForm.accessToken}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, accessToken: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="Phone Number ID"
                    type="password"
                    placeholder={waStatus?.hasPhoneNumberId ? "•••••••• (salvo)" : "1234567890"}
                    value={waForm.phoneNumberId}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, phoneNumberId: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="Nome do Template Aprovado"
                    placeholder="ex: oferta_recompra"
                    value={waForm.templateName}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, templateName: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="Idioma do Template"
                    placeholder="pt_BR"
                    value={waForm.templateLanguage}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, templateLanguage: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="WABA ID"
                    placeholder={waStatus?.hasWabaId ? "•••••••• (salvo)" : "ID da WhatsApp Business Account"}
                    value={waForm.wabaId}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, wabaId: e.target.value }))}
                    helperText="Usado pra listar os templates aprovados na aba Templates."
                    fullWidth
                  />
                  <TextField
                    label="Verify Token do Webhook"
                    type="password"
                    placeholder={waStatus?.hasVerifyToken ? "•••••••• (salvo)" : "escolha uma string qualquer"}
                    value={waForm.verifyToken}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, verifyToken: e.target.value }))}
                    helperText={
                      <>
                        Configure o mesmo valor no painel da Meta, junto com a URL{" "}
                        <Box component="code" sx={{ borderRadius: 0.5, bgcolor: "action.hover", px: 0.5 }}>/api/whatsapp-webhook</Box> — é assim que Entregues/Lidas
                        são atualizados em tempo real.
                      </>
                    }
                    fullWidth
                  />
                  <TextField
                    label="Custo por mensagem — Marketing (R$)"
                    type="number"
                    slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                    placeholder="0.00"
                    value={waForm.costMarketing}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, costMarketing: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="Custo por mensagem — Utilidade (R$)"
                    type="number"
                    slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                    placeholder="0.00"
                    value={waForm.costUtility}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, costUtility: e.target.value }))}
                    fullWidth
                  />
                </Box>
              </Stack>
            </CardContent>
            <Divider />
            <CardActions sx={{ justifyContent: "space-between", px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
              <Stack
                component="a"
                direction="row"
                spacing={0.5}
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noreferrer"
                sx={{ alignItems: "center", color: "text.secondary", textDecoration: "none", fontSize: 14, "&:hover": { textDecoration: "underline" } }}
              >
                <span>Guia de configuração da Meta</span> <ExternalLink size={12} />
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button
                  type="button"
                  variant="outlined"
                  startIcon={activateTemplateWebhookMutation.isPending ? <RefreshCw size={16} className="animate-spin" /> : undefined}
                  onClick={() => activateTemplateWebhookMutation.mutate()}
                  disabled={activateTemplateWebhookMutation.isPending}
                  title="Liga o aviso automático de aprovação/rejeição de template (rodar 1x, depois de salvar Verify Token e App Secret)"
                >
                  Ativar notificações de aprovação
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  startIcon={saveWaMutation.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                  onClick={() => saveWaMutation.mutate()}
                  disabled={saveWaMutation.isPending}
                >
                  Salvar
                </Button>
              </Stack>
            </CardActions>
          </Card>

          {(settings?.syncStatus === "connected" || settings?.syncStatus === "error") && (
            <Card variant="outlined">
              <CardHeader
                title={
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <RefreshCw size={20} color="var(--mui-palette-primary-main, #7367F0)" />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Sincronização de Dados</Typography>
                  </Stack>
                }
                subheader="Importe pedidos, clientes e informações de rastreio da sua loja."
              />
              <CardContent>
                <Stack spacing={3}>
                  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">Status</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5, textTransform: "capitalize" }}>{settings.syncStatus}</Typography>
                    </Box>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">Última Sinc.</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString("pt-BR") : "Nunca"}
                      </Typography>
                    </Box>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">Loja</Typography>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 700, mt: 0.5 }}>{testResult?.shopName || settings.domain}</Typography>
                    </Box>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">Timezone</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>America/Sao_Paulo</Typography>
                    </Box>
                  </Box>

                  {testResult?.scopes && (
                    <Stack spacing={1}>
                      <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Permissões (Scopes)</Typography>
                      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
                        {testResult.scopes.map((s: string) => (
                          <Chip key={s} size="small" variant="outlined" label={s} sx={{ fontSize: 10 }} />
                        ))}
                      </Stack>
                    </Stack>
                  )}

                  {settings.lastSyncError && (
                    <Alert severity="error" icon={<AlertCircle size={18} />}>
                      <AlertTitle>Erro na última sincronização</AlertTitle>
                      {settings.lastSyncError}
                    </Alert>
                  )}
                </Stack>
              </CardContent>
              <Divider />
              <CardActions sx={{ px: 3, py: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<RefreshCw size={16} className={isSyncing ? "animate-spin" : undefined} />}
                  onClick={handleSync}
                  disabled={isSyncing}
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  Sincronizar Agora
                </Button>
              </CardActions>
            </Card>
          )}

          <Stack direction="row" spacing={2} sx={{ justifyContent: "center", color: "text.secondary", fontSize: 14 }}>
            <Stack component="a" direction="row" spacing={0.5} href="https://help.shopify.com/en/manual/apps/custom-apps" target="_blank" rel="noreferrer" sx={{ alignItems: "center", color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
              <span>Como criar um app</span> <ExternalLink size={12} />
            </Stack>
            <span>•</span>
            <Box component="a" href="#" sx={{ color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>Suporte</Box>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
