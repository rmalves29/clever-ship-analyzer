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
  ChevronLeft
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
