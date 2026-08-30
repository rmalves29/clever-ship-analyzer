import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gauge,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getGa4HistoricalReport,
  getGa4RealtimeReport,
  getGa4Status,
  removeGa4Connection,
  saveGa4Connection,
  testGa4Connection,
} from "@/lib/google-analytics.functions";
import {
  todayInSaoPaulo,
  type Ga4DateRange,
} from "@/lib/google-analytics.shared";

export const Route = createFileRoute("/ga4")({
  component: GoogleAnalyticsPage,
  head: () => ({
    meta: [
      { title: "Google Analytics 4 | CRM Analytics" },
      {
        name: "description",
        content:
          "Relatórios GA4 em tempo real e históricos para analisar tráfego, conteúdo e vendas.",
      },
    ],
  }),
});

type MetricRow = Record<string, string | number>;

const chartConfig = {
  sessions: { label: "Sessões", color: "hsl(var(--primary))" },
  screenPageViews: { label: "Visualizações", color: "hsl(var(--chart-2))" },
  activeUsers: { label: "Usuários ativos", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

function isoDaysAgo(days: number, endDate = todayInSaoPaulo()) {
  const date = new Date(`${endDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function number(value: unknown) {
  return Number(value ?? 0);
}

function integer(value: unknown) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    number(value),
  );
}

function decimal(value: unknown, digits = 1) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number(value));
}

function percent(value: unknown) {
  return `${decimal(number(value) * 100, 1)}%`;
}

function currency(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(number(value));
}

function duration(value: unknown) {
  const seconds = Math.max(0, Math.round(number(value)));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}min ${seconds % 60}s` : `${seconds}s`;
}

function ChangeBadge({ value }: { value: number | null | undefined }) {
  if (value == null)
    return (
      <span className="text-xs text-muted-foreground">sem base anterior</span>
    );
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}
    >
      {positive ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {positive ? "+" : ""}
      {decimal(value * 100, 1)}%
    </span>
  );
}

function StatCard({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: number | null | undefined;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className="text-2xl font-bold">{value}</p>
          {change !== undefined && <ChangeBadge value={change} />}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyRows() {
  return (
    <TableRow>
      <TableCell
        colSpan={10}
        className="h-24 text-center text-muted-foreground"
      >
        Nenhum dado retornado para este período.
      </TableCell>
    </TableRow>
  );
}

function ConnectionPanel({ connected }: { connected: boolean }) {
  const queryClient = useQueryClient();
  const saveConnection = useServerFn(saveGa4Connection);
  const testConnection = useServerFn(testGa4Connection);
  const disconnect = useServerFn(removeGa4Connection);
  const [propertyId, setPropertyId] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      saveConnection({ data: { propertyId, serviceAccountJson } }),
    onSuccess: () => {
      toast.success("GA4 conectado e testado com sucesso.");
      setServiceAccountJson("");
      queryClient.invalidateQueries({ queryKey: ["ga4"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error ? error.message : "Falha ao conectar o GA4.",
      ),
  });
  const testMutation = useMutation({
    mutationFn: () => testConnection(),
    onSuccess: (result) => {
      if (result.success) toast.success("Conexão com o GA4 funcionando.");
      else toast.error(result.error);
      queryClient.invalidateQueries({ queryKey: ["ga4", "status"] });
    },
  });
  const disconnectMutation = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Conexão GA4 removida.");
      queryClient.removeQueries({ queryKey: ["ga4"] });
      queryClient.invalidateQueries({ queryKey: ["ga4", "status"] });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>
            {connected ? "Alterar conexão" : "Conectar propriedade GA4"}
          </CardTitle>
          <CardDescription>
            A conta de serviço permite que os relatórios e as automações
            consultem o GA4 sem depender de login manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ga4-property-id">ID numérico da propriedade</Label>
            <Input
              id="ga4-property-id"
              inputMode="numeric"
              placeholder="123456789"
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Administração → Detalhes da propriedade → ID da propriedade.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ga4-service-account">
              JSON da conta de serviço
            </Label>
            <textarea
              id="ga4-service-account"
              className="min-h-44 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={
                '{\n  "type": "service_account",\n  "client_email": "...",\n  "private_key": "..."\n}'
              }
              value={serviceAccountJson}
              onChange={(event) => setServiceAccountJson(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A chave é processada e armazenada somente no servidor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                !propertyId.trim() ||
                !serviceAccountJson.trim() ||
                saveMutation.isPending
              }
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Salvar e testar
            </Button>
            {connected && (
              <>
                <Button
                  variant="outline"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                >
                  Testar conexão
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  Desconectar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Como liberar o acesso</CardTitle>
          <CardDescription>
            Passos necessários uma única vez no Google.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4 text-sm">
            <li>
              <strong>1.</strong> Ative a Google Analytics Data API no seu
              projeto do Google Cloud.
            </li>
            <li>
              <strong>2.</strong> Crie uma conta de serviço e gere uma chave no
              formato JSON.
            </li>
            <li>
              <strong>3.</strong> Copie o <code>client_email</code> do JSON.
            </li>
            <li>
              <strong>4.</strong> No GA4, adicione esse e-mail em Gerenciamento
              de acesso à propriedade com função de Leitor.
            </li>
            <li>
              <strong>5.</strong> Informe o ID numérico da propriedade e cole o
              JSON ao lado.
            </li>
          </ol>
          <a
            href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Abrir Google Cloud <ExternalLink className="size-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

function RealtimePanel({ enabled }: { enabled: boolean }) {
  const runRealtime = useServerFn(getGa4RealtimeReport);
  const query = useQuery({
    queryKey: ["ga4", "realtime"],
    queryFn: () => runRealtime(),
    enabled,
    refetchInterval: 60_000,
  });
  const data = query.data;

  if (query.isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-7 animate-spin" />
      </div>
    );
  if (query.error)
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Falha no tempo real</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
      </Alert>
    );
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Últimos 30 minutos · atualização automática a cada minuto
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          className="gap-2"
        >
          <RefreshCw
            className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`}
          />{" "}
          Atualizar
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Usuários ativos agora"
          value={integer(data.summary.activeUsers)}
          hint="Usuários distintos nos últimos 30 minutos"
        />
        <StatCard
          label="Visualizações online"
          value={integer(data.summary.screenPageViews)}
        />
        <StatCard
          label="Eventos online"
          value={integer(data.summary.eventCount)}
        />
        <StatCard
          label="Conversões online"
          value={integer(data.summary.keyEvents)}
          hint="Eventos marcados como principais"
        />
      </div>
      {data.warnings.map((warning) => (
        <Alert key={warning}>
          <AlertTriangle className="size-4" />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Páginas visualizadas agora</CardTitle>
            <CardDescription>
              Títulos das páginas com usuários ativos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Página</TableHead>
                  <TableHead className="text-right">Usuários</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pages.length ? (
                  data.pages.map((row, index) => (
                    <TableRow key={`${row.unifiedScreenName}-${index}`}>
                      <TableCell className="max-w-sm truncate font-medium">
                        {row.unifiedScreenName || "Sem título"}
                      </TableCell>
                      <TableCell className="text-right">
                        {integer(row.activeUsers)}
                      </TableCell>
                      <TableCell className="text-right">
                        {integer(row.screenPageViews)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyRows />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Dispositivos online</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.devices.map((row) => (
                <div
                  key={String(row.deviceCategory)}
                  className="flex justify-between border-b pb-2 last:border-0"
                >
                  <span className="capitalize">{row.deviceCategory}</span>
                  <strong>{integer(row.activeUsers)}</strong>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Países online</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.countries.slice(0, 10).map((row) => (
                <div
                  key={String(row.country)}
                  className="flex justify-between border-b pb-2 last:border-0"
                >
                  <span>{row.country}</span>
                  <strong>{integer(row.activeUsers)}</strong>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Eventos acontecendo agora</CardTitle>
          <CardDescription>
            Ajuda a conferir navegação, carrinho, checkout e compras em tempo
            real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead className="text-right">Ocorrências</TableHead>
                <TableHead className="text-right">Usuários</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.events.length ? (
                data.events.map((row) => (
                  <TableRow key={String(row.eventName)}>
                    <TableCell className="font-mono text-xs">
                      {row.eventName}
                    </TableCell>
                    <TableCell className="text-right">
                      {integer(row.eventCount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {integer(row.activeUsers)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRows />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoricalPanel({ enabled }: { enabled: boolean }) {
  const today = todayInSaoPaulo();
  const runHistorical = useServerFn(getGa4HistoricalReport);
  const [startDate, setStartDate] = useState(isoDaysAgo(29, today));
  const [endDate, setEndDate] = useState(today);
  const [appliedRange, setAppliedRange] = useState<Ga4DateRange>({
    startDate,
    endDate,
  });

  const query = useQuery({
    queryKey: ["ga4", "historical", appliedRange],
    queryFn: () => runHistorical({ data: appliedRange }),
    enabled,
  });
  const data = query.data;

  const applyPreset = (days: number | "all") => {
    const nextStart =
      days === "all" ? "2020-10-14" : isoDaysAgo(days - 1, today);
    setStartDate(nextStart);
    setEndDate(today);
    setAppliedRange({ startDate: nextStart, endDate: today });
  };

  const observations = useMemo(() => {
    if (!data) return [];
    const keys = [
      ["sessions", "Sessões"],
      ["screenPageViews", "Visualizações"],
      ["activeUsers", "Usuários ativos"],
      ["engagementRate", "Taxa de engajamento"],
      ["purchaseRevenue", "Receita de compras"],
    ] as const;
    return keys
      .map(([key, label]) => ({ key, label, value: data.changes[key] }))
      .filter((item) => item.value != null)
      .sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0))
      .slice(0, 4);
  }, [data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => applyPreset(1)}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset(7)}>
              7 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset(30)}>
              30 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset(90)}>
              90 dias
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset(365)}
            >
              12 meses
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset("all")}
            >
              Todo período
            </Button>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="ga4-start" className="text-xs">
                De
              </Label>
              <Input
                id="ga4-start"
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ga4-end" className="text-xs">
                Até
              </Label>
              <Input
                id="ga4-end"
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <Button
              onClick={() => setAppliedRange({ startDate, endDate })}
              disabled={!startDate || !endDate || startDate > endDate}
            >
              Aplicar
            </Button>
          </div>
        </CardContent>
      </Card>

      {query.isLoading && (
        <div className="flex h-72 items-center justify-center">
          <Loader2 className="size-8 animate-spin" />
        </div>
      )}
      {query.error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Não foi possível carregar o relatório</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      )}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Usuários"
              value={integer(data.summary.totalUsers)}
              change={data.changes.totalUsers}
            />
            <StatCard
              label="Sessões"
              value={integer(data.summary.sessions)}
              change={data.changes.sessions}
            />
            <StatCard
              label="Visualizações"
              value={integer(data.summary.screenPageViews)}
              change={data.changes.screenPageViews}
            />
            <StatCard
              label="Engajamento"
              value={percent(data.summary.engagementRate)}
              change={data.changes.engagementRate}
            />
            <StatCard
              label="Receita GA4"
              value={currency(data.summary.purchaseRevenue)}
              change={data.changes.purchaseRevenue}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Novos usuários"
              value={integer(data.summary.newUsers)}
              change={data.changes.newUsers}
            />
            <StatCard
              label="Usuários ativos"
              value={integer(data.summary.activeUsers)}
              change={data.changes.activeUsers}
            />
            <StatCard
              label="Tempo médio"
              value={duration(data.summary.averageSessionDuration)}
              change={data.changes.averageSessionDuration}
            />
            <StatCard
              label="Conversões"
              value={integer(data.summary.keyEvents)}
              change={data.changes.keyEvents}
            />
            <StatCard
              label="Compras"
              value={integer(data.summary.ecommercePurchases)}
              change={data.changes.ecommercePurchases}
            />
          </div>

          {data.warnings.map((warning) => (
            <Alert key={warning}>
              <AlertTriangle className="size-4" />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          ))}

          {observations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pontos de evolução e retração</CardTitle>
                <CardDescription>
                  Comparação automática com o período anterior de mesma duração.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {observations.map((item) => {
                  const positive = (item.value || 0) >= 0;
                  return (
                    <div
                      key={item.key}
                      className={`rounded-lg border p-3 ${positive ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}
                    >
                      <p className="text-sm font-medium">{item.label}</p>
                      <p
                        className={`mt-1 text-xl font-bold ${positive ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {positive ? "+" : ""}
                        {decimal((item.value || 0) * 100, 1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        vs. período anterior
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Evolução diária</CardTitle>
              <CardDescription>
                Sessões, visualizações e usuários ativos ao longo do período.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-80 w-full">
                <LineChart data={data.trend} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tickFormatter={(value) =>
                      `${String(value).slice(6, 8)}/${String(value).slice(4, 6)}`
                    }
                  />
                  <YAxis tickLine={false} axisLine={false} width={42} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="sessions"
                    type="monotone"
                    stroke="var(--color-sessions)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="screenPageViews"
                    type="monotone"
                    stroke="var(--color-screenPageViews)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="activeUsers"
                    type="monotone"
                    stroke="var(--color-activeUsers)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Páginas mais visualizadas</CardTitle>
              <CardDescription>
                Todas as pageviews, inclusive quando a página não foi a entrada
                da sessão.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Página</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Usuários</TableHead>
                    <TableHead className="text-right">Engajamento</TableHead>
                    <TableHead className="text-right">Tempo médio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pages.length ? (
                    data.pages.map((row, index) => (
                      <TableRow key={`${row.pagePathPlusQueryString}-${index}`}>
                        <TableCell>
                          <p className="max-w-xl truncate font-medium">
                            {row.pageTitle || "Sem título"}
                          </p>
                          <p className="max-w-xl truncate text-xs text-muted-foreground">
                            {row.pagePathPlusQueryString}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {integer(row.screenPageViews)}
                        </TableCell>
                        <TableCell className="text-right">
                          {integer(row.activeUsers)}
                        </TableCell>
                        <TableCell className="text-right">
                          {percent(row.engagementRate)}
                        </TableCell>
                        <TableCell className="text-right">
                          {duration(row.averageSessionDuration)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRows />
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produtos mais visualizados</CardTitle>
              <CardDescription>
                Funil do evento view_item até a compra; estes dados alimentarão
                os criativos automáticos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Vistos</TableHead>
                    <TableHead className="text-right">Carrinho</TableHead>
                    <TableHead className="text-right">Checkout</TableHead>
                    <TableHead className="text-right">Comprados</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.products.length ? (
                    data.products.map((row, index) => (
                      <TableRow key={`${row.itemId}-${index}`}>
                        <TableCell>
                          <p className="font-medium">
                            {row.itemName || "Produto sem nome"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.itemId}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {integer(row.itemsViewed)}
                        </TableCell>
                        <TableCell className="text-right">
                          {integer(row.itemsAddedToCart)}
                        </TableCell>
                        <TableCell className="text-right">
                          {integer(row.itemsCheckedOut)}
                        </TableCell>
                        <TableCell className="text-right">
                          {integer(row.itemsPurchased)}
                        </TableCell>
                        <TableCell className="text-right">
                          {currency(row.itemRevenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRows />
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Canais de aquisição</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Sessões</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.channels.length ? (
                      data.channels.map((row) => (
                        <TableRow key={String(row.sessionDefaultChannelGroup)}>
                          <TableCell>
                            {row.sessionDefaultChannelGroup}
                          </TableCell>
                          <TableCell className="text-right">
                            {integer(row.sessions)}
                          </TableCell>
                          <TableCell className="text-right">
                            {currency(row.purchaseRevenue)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyRows />
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Origens e mídias</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem / mídia</TableHead>
                      <TableHead className="text-right">Sessões</TableHead>
                      <TableHead className="text-right">Conversões</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.sources.length ? (
                      data.sources.slice(0, 20).map((row) => (
                        <TableRow key={String(row.sessionSourceMedium)}>
                          <TableCell>{row.sessionSourceMedium}</TableCell>
                          <TableCell className="text-right">
                            {integer(row.sessions)}
                          </TableCell>
                          <TableCell className="text-right">
                            {integer(row.keyEvents)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyRows />
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Campanhas</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead className="text-right">Sessões</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.campaigns.length ? (
                      data.campaigns.slice(0, 20).map((row, index) => (
                        <TableRow key={`${row.sessionCampaignName}-${index}`}>
                          <TableCell>
                            <p>{row.sessionCampaignName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.sessionSourceMedium}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            {integer(row.sessions)}
                          </TableCell>
                          <TableCell className="text-right">
                            {currency(row.purchaseRevenue)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyRows />
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dispositivos</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dispositivo</TableHead>
                      <TableHead>Navegador / SO</TableHead>
                      <TableHead className="text-right">Sessões</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.devices.length ? (
                      data.devices.slice(0, 20).map((row, index) => (
                        <TableRow key={`${row.deviceCategory}-${index}`}>
                          <TableCell className="capitalize">
                            {row.deviceCategory}
                          </TableCell>
                          <TableCell>
                            {row.browser} / {row.operatingSystem}
                          </TableCell>
                          <TableCell className="text-right">
                            {integer(row.sessions)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyRows />
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Localização dos acessos</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>País</TableHead>
                    <TableHead>Estado / região</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead className="text-right">Usuários</TableHead>
                    <TableHead className="text-right">Sessões</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.geography.length ? (
                    data.geography.map((row, index) => (
                      <TableRow
                        key={`${row.country}-${row.region}-${row.city}-${index}`}
                      >
                        <TableCell>{row.country}</TableCell>
                        <TableCell>{row.region}</TableCell>
                        <TableCell>{row.city}</TableCell>
                        <TableCell className="text-right">
                          {integer(row.activeUsers)}
                        </TableCell>
                        <TableCell className="text-right">
                          {integer(row.sessions)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRows />
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function GoogleAnalyticsPage() {
  const getStatus = useServerFn(getGa4Status);
  const [tab, setTab] = useState("historical");
  const statusQuery = useQuery({
    queryKey: ["ga4", "status"],
    queryFn: () => getStatus(),
  });
  const status = statusQuery.data;

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <BarChart3 className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Google Analytics 4
              </h1>
              <p className="text-sm text-muted-foreground">
                Tempo real, histórico e oportunidades de melhoria do site.
              </p>
            </div>
          </div>
        </div>
        {statusQuery.isLoading ? (
          <Badge variant="secondary">Verificando...</Badge>
        ) : status?.connected ? (
          <Badge className="gap-1 bg-emerald-600">
            <CheckCircle2 className="size-3" /> Conectado · {status.propertyId}
          </Badge>
        ) : (
          <Badge variant="secondary">Não conectado</Badge>
        )}
      </div>

      {!statusQuery.isLoading && !status?.connected ? (
        <ConnectionPanel connected={false} />
      ) : status?.connected ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="historical" className="gap-2">
              <Gauge className="size-4" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="realtime" className="gap-2">
              <Activity className="size-4" /> Tempo real
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="size-4" /> Configuração
            </TabsTrigger>
          </TabsList>
          <TabsContent value="historical">
            <HistoricalPanel enabled={tab === "historical"} />
          </TabsContent>
          <TabsContent value="realtime">
            <RealtimePanel enabled={tab === "realtime"} />
          </TabsContent>
          <TabsContent value="settings">
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Propriedade" value={status.propertyId} />
              <StatCard
                label="Conta de serviço"
                value="Ativa"
                hint={status.serviceAccountEmail}
              />
              <StatCard
                label="Último teste"
                value={
                  status.lastTestedAt
                    ? new Date(status.lastTestedAt).toLocaleDateString("pt-BR")
                    : "—"
                }
                hint={status.lastError || "Sem erro registrado"}
              />
            </div>
            <ConnectionPanel connected />
          </TabsContent>
        </Tabs>
      ) : null}

      <Alert className="mt-6">
        <Clock3 className="size-4" />
        <AlertTitle>Sobre o histórico máximo</AlertTitle>
        <AlertDescription>
          O filtro aceita qualquer intervalo desde o início do GA4. O relatório
          exibirá somente dados realmente existentes e disponíveis na
          propriedade; datas anteriores à instalação da tag não podem ser
          recuperadas.
        </AlertDescription>
      </Alert>
    </div>
  );
}
