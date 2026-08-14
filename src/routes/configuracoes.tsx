import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Store,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Save,
  ChevronLeft,
  Sparkles,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { testShopifyConnection } from "@/lib/shopify-operations.functions";
import { syncShopifyData } from "@/lib/crm-sync.functions";
import { getStoreSettings, saveStoreSettings } from "@/lib/store-settings.functions";
import { getLatestAiAnalysis, saveOpenAiApiKey } from "@/lib/ai-analysis.functions";
import { getWhatsappMetaStatus, saveWhatsappMetaSettings } from "@/lib/whatsapp-meta.functions";

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
    mutationFn: () => testShopifyConnection(),
    onSuccess: (res: any) => {
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

  const [waForm, setWaForm] = useState({
    accessToken: "",
    phoneNumberId: "",
    templateName: "",
    templateLanguage: "",
    wabaId: "",
    verifyToken: "",
    costMarketing: "",
    costUtility: "",
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
        },
      }),
    onSuccess: (res: any) => {
      if (res.success) {
        toast.success("Configurações do WhatsApp (Meta) salvas.");
        setWaForm((prev) => ({ ...prev, accessToken: "", phoneNumberId: "", wabaId: "", verifyToken: "" }));
        refetchWaStatus();
      } else {
        toast.error(res.error || "Erro ao salvar.");
      }
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <RefreshCw className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const isTesting = testConnectionMutation.isPending;
  const testResult = testConnectionMutation.data as any;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/" })}>
              <ChevronLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
              <p className="text-muted-foreground">Gerencie a conexão com sua loja Shopify</p>
            </div>
          </div>
          <Badge variant={settings?.syncStatus === "connected" ? "default" : "secondary"} className="h-6">
            {settings?.syncStatus === "connected" ? "Conectado" : "Não configurado"}
          </Badge>
        </div>

        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Store className="size-5 text-primary" />
                <CardTitle>Credenciais Shopify Admin API</CardTitle>
              </div>
              <CardDescription>
                Use o fluxo oficial client_credentials. Crie um App Customizado no Admin da Shopify para obter estas chaves.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSave}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domínio da Loja (.myshopify.com)</Label>
                  <Input 
                    id="domain" 
                    placeholder="minha-loja.myshopify.com"
                    value={formData.domain}
                    onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clientId">API Key (Client ID)</Label>
                    <Input 
                      id="clientId" 
                      type="password"
                      placeholder={settings?.hasClientId ? "•••••••• (salvo)" : ""}
                      value={formData.clientId}
                      onChange={(e) => setFormData(prev => ({ ...prev, clientId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientSecret">API Secret Key (Client Secret)</Label>
                    <Input 
                      id="clientSecret" 
                      type="password"
                      placeholder={settings?.hasClientSecret ? "•••••••• (salvo)" : ""}
                      value={formData.clientSecret}
                      onChange={(e) => setFormData(prev => ({ ...prev, clientSecret: e.target.value }))}
                    />
                  </div>
                </div>
                <Alert variant="default" className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                  <ShieldCheck className="size-4 text-blue-600 dark:text-blue-400" />
                  <AlertTitle>Segurança</AlertTitle>
                  <AlertDescription className="text-xs">
                    Suas credenciais são armazenadas com segurança e nunca expostas ao navegador. A autenticação é realizada exclusivamente no servidor.
                  </AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter className="flex justify-between border-t px-6 py-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => testConnectionMutation.mutate()} 
                  disabled={isTesting || !settings?.hasClientSecret}
                >
                  {isTesting ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                  Testar Conexão
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                  Salvar Configurações
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <CardTitle>Análise por IA (ChatGPT)</CardTitle>
              </div>
              <CardDescription>
                Usada pelo botão "Refazer análise" no dashboard para gerar o resumo executivo e as ações
                sugeridas a partir dos dados reais da Shopify.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openaiKey">API Key da OpenAI</Label>
                <Input
                  id="openaiKey"
                  type="password"
                  placeholder={aiStatus?.hasApiKey ? "•••••••• (salva)" : "sk-..."}
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                />
              </div>
              {aiStatus?.generatedAt && (
                <p className="text-xs text-muted-foreground">
                  Última análise gerada em {new Date(aiStatus.generatedAt).toLocaleString("pt-BR")}.
                </p>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t px-6 py-4">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
              >
                Gerar uma API key <ExternalLink className="size-3" />
              </a>
              <Button
                type="button"
                onClick={() => saveOpenAiMutation.mutate()}
                disabled={saveOpenAiMutation.isPending || openAiKey.trim().length < 20}
              >
                {saveOpenAiMutation.isPending ? (
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Salvar API Key
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="size-5 text-primary" />
                <CardTitle>WhatsApp — API Oficial da Meta</CardTitle>
              </div>
              <CardDescription>
                Usada pelo botão "Aplicar ação" no dashboard pra disparar campanhas de WhatsApp pros clientes reais de
                cada segmento. Requer um app no Meta for Developers com o produto WhatsApp, um número verificado e
                pelo menos 1 template de mensagem (categoria Marketing) já aprovado pela Meta — o corpo do template
                deve ter no máximo 1 variável (ex: {"{{1}}"} = oferta).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="waToken">Token de Acesso Permanente</Label>
                  <Input
                    id="waToken"
                    type="password"
                    placeholder={waStatus?.hasAccessToken ? "•••••••• (salvo)" : "EAAG..."}
                    value={waForm.accessToken}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, accessToken: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waPhoneId">Phone Number ID</Label>
                  <Input
                    id="waPhoneId"
                    type="password"
                    placeholder={waStatus?.hasPhoneNumberId ? "•••••••• (salvo)" : "1234567890"}
                    value={waForm.phoneNumberId}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, phoneNumberId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waTemplate">Nome do Template Aprovado</Label>
                  <Input
                    id="waTemplate"
                    placeholder="ex: oferta_recompra"
                    value={waForm.templateName}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, templateName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waLang">Idioma do Template</Label>
                  <Input
                    id="waLang"
                    placeholder="pt_BR"
                    value={waForm.templateLanguage}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, templateLanguage: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waWaba">WABA ID</Label>
                  <Input
                    id="waWaba"
                    placeholder={waStatus?.hasWabaId ? "•••••••• (salvo)" : "ID da WhatsApp Business Account"}
                    value={waForm.wabaId}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, wabaId: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Usado pra listar os templates aprovados na aba Templates.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waVerify">Verify Token do Webhook</Label>
                  <Input
                    id="waVerify"
                    type="password"
                    placeholder={waStatus?.hasVerifyToken ? "•••••••• (salvo)" : "escolha uma string qualquer"}
                    value={waForm.verifyToken}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, verifyToken: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Configure o mesmo valor no painel da Meta, junto com a URL{" "}
                    <code className="rounded bg-muted px-1">/api/whatsapp-webhook</code> — é assim que Entregues/Lidas
                    são atualizados em tempo real.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waCostMkt">Custo por mensagem — Marketing (R$)</Label>
                  <Input
                    id="waCostMkt"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={waForm.costMarketing}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, costMarketing: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waCostUtil">Custo por mensagem — Utilidade (R$)</Label>
                  <Input
                    id="waCostUtil"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={waForm.costUtility}
                    onChange={(e) => setWaForm((prev) => ({ ...prev, costUtility: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t px-6 py-4">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
              >
                Guia de configuração da Meta <ExternalLink className="size-3" />
              </a>
              <Button type="button" onClick={() => saveWaMutation.mutate()} disabled={saveWaMutation.isPending}>
                {saveWaMutation.isPending ? (
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Salvar
              </Button>
            </CardFooter>
          </Card>

          {settings?.syncStatus === "connected" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <RefreshCw className="size-5 text-primary" />
                  <CardTitle>Sincronização de Dados</CardTitle>
                </div>
                <CardDescription>
                  Importe pedidos, clientes e informações de rastreio da sua loja.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="mt-1 text-sm font-semibold capitalize">{settings.syncStatus}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Última Sinc.</p>
                    <p className="mt-1 text-sm font-semibold">
                      {settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString("pt-BR") : "Nunca"}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Loja</p>
                    <p className="mt-1 text-sm font-semibold truncate">{testResult?.shopName || settings.domain}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Timezone</p>
                    <p className="mt-1 text-sm font-semibold">America/Sao_Paulo</p>
                  </div>
                </div>

                {testResult?.scopes && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Permissões (Scopes)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {testResult.scopes.map((s: string) => (
                        <Badge key={s} variant="outline" className="text-[10px] font-normal">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {settings.lastSyncError && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertTitle>Erro na última sincronização</AlertTitle>
                    <AlertDescription>{settings.lastSyncError}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button 
                  className="w-full sm:w-auto" 
                  onClick={handleSync} 
                  disabled={isSyncing}
                >
                  {isSyncing ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                  Sincronizar Agora
                </Button>
              </CardFooter>
            </Card>
          )}

          <div className="flex justify-center gap-4 text-sm text-muted-foreground">
            <a href="https://help.shopify.com/en/manual/apps/custom-apps" target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
              Como criar um app <ExternalLink className="size-3" />
            </a>
            <span>•</span>
            <a href="#" className="hover:underline">Suporte</a>
          </div>
        </div>
      </div>
    </div>
  );
}
