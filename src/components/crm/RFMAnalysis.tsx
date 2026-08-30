import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Info,
  Users,
  ShoppingBag,
  TrendingUp,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getRFMStats, calculateRFMSegments } from "@/lib/crm-rfm.functions";
import { RFM_SEGMENTS_CONFIG, CLASSIC_MODE_MIN_HISTORY_DAYS, type RFMSegment } from "@/lib/crm-rfm-shared";
import { brl } from "@/lib/crm-mock";

const segColor = (name: string) => RFM_SEGMENTS_CONFIG[name as RFMSegment]?.color ?? "#94a3b8";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Falha desconhecida ao carregar os dados RFM.";
}

export function RFMAnalysis() {
  const queryClient = useQueryClient();
  const fetchStats = useServerFn(getRFMStats);
  const runCalculate = useServerFn(calculateRFMSegments);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["rfm-stats"],
    queryFn: () => fetchStats(),
    retry: 1,
  });

  const calculateMutation = useMutation({
    mutationFn: () => runCalculate(),
    onSuccess: async (result) => {
      if (result.count > 0) {
        toast.success(`RFM recalculado: ${result.count} cliente(s) atualizado(s) de ${result.evaluatedCustomers} analisados.`);
      } else if (result.evaluatedCustomers > 0) {
        toast.success(`RFM conferido: ${result.evaluatedCustomers} cliente(s) analisados e a classificação já estava atualizada.`);
      } else {
        toast.warning("O cálculo RFM foi executado, mas não encontrou clientes na base da Shopify.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rfm-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-customers"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-segments"] }),
      ]);
    },
    onError: (err: unknown) => {
      toast.error("Erro ao calcular RFM: " + errorMessage(err));
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="size-8 animate-spin text-brand" />
          <p className="text-sm text-muted-foreground">Processando análise RFM...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="surface-card mx-auto max-w-2xl border-l-4 border-l-destructive p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <h3 className="font-semibold">Não foi possível calcular a análise RFM</h3>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage(error)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              A tela não vai mais esconder falhas como se fossem valores zerados. Corrija a origem indicada acima e tente novamente.
            </p>
            <Button variant="outline" className="mt-4 gap-2" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const summary = data?.summary ?? [];
  const activeSegments = Object.keys(RFM_SEGMENTS_CONFIG) as RFMSegment[];

  const chartData = summary
    .map((s) => ({ name: s.name, clientes: s.clientes, receita: s.receita, color: segColor(s.name) }))
    .sort((a, b) => b.clientes - a.clientes);

  const freqData = (data?.frequencia ?? []).filter((f) => f.faixa !== "0x");
  const hasSourceCustomers = (data?.sourceCustomers ?? 0) > 0;
  const hasSourceOrders = (data?.sourceOrders ?? 0) > 0;
  const hasValidOrders = (data?.validOrders ?? 0) > 0;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Análise RFM</h2>
          <p className="text-sm text-muted-foreground">
            Recência, Frequência e Valor — considerando apenas pedidos pagos (reembolsados, expirados,
            anulados e não pagos ficam de fora).
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fonte lida: {new Intl.NumberFormat().format(data?.sourceCustomers ?? 0)} clientes · {new Intl.NumberFormat().format(data?.sourceOrders ?? 0)} pedidos importados · {new Intl.NumberFormat().format(data?.validOrders ?? 0)} pedidos válidos para RFM
          </p>
        </div>
        <Button
          onClick={() => calculateMutation.mutate()}
          disabled={calculateMutation.isPending}
          className="gap-2 bg-brand hover:bg-brand/90 text-white"
        >
          {calculateMutation.isPending ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {calculateMutation.isPending ? "Recalculando..." : "Recalcular Análise RFM"}
        </Button>
      </div>

      {!hasSourceCustomers && (
        <div className="surface-card flex items-start gap-3 border-l-4 border-l-destructive p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold">Nenhum cliente da Shopify disponível para o RFM</p>
            <p className="text-muted-foreground">Sincronize a Shopify antes de recalcular. Sem clientes importados não existe base para classificar.</p>
          </div>
        </div>
      )}

      {hasSourceCustomers && hasSourceOrders && !hasValidOrders && (
        <div className="surface-card flex items-start gap-3 border-l-4 border-l-amber-500 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold">Há pedidos importados, mas nenhum pedido válido para o RFM</p>
            <p className="text-muted-foreground">Confira os status financeiros sincronizados. O RFM considera PAID e PARTIALLY_PAID sem cancelamento.</p>
          </div>
        </div>
      )}

      <div className="surface-card flex items-start gap-3 border-l-4 border-l-brand p-4">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-brand" />
        <div className="text-sm">
          <p className="font-semibold">Matriz RFM completa ativa</p>
          <p className="text-muted-foreground">
            Todos os segmentos são avaliados desde já, sem bloqueio por idade da base. Há {data?.historyDays ?? 0} dias
            de histórico pago; as faixas de recência usam o ciclo real de recompra da loja.{" "}
            {!data?.ltvDisponivel && <><strong>LTV projetado continua indisponível</strong> até completar {CLASSIC_MODE_MIN_HISTORY_DAYS} dias.</>}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500"><Users className="size-5" /></div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Base Total</p>
              <h3 className="text-2xl font-bold">{new Intl.NumberFormat().format(data?.totalClientes ?? 0)}</h3>
              <p className="text-[11px] text-muted-foreground">{new Intl.NumberFormat().format(data?.compradores ?? 0)} com compra paga</p>
            </div>
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500"><ShoppingBag className="size-5" /></div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Receita Válida</p>
              <h3 className="text-2xl font-bold">{brl(data?.totalReceita ?? 0)}</h3>
              <p className="text-[11px] text-muted-foreground">{new Intl.NumberFormat().format(data?.totalPedidos ?? 0)} pedidos pagos</p>
            </div>
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand/10 p-2 text-brand"><TrendingUp className="size-5" /></div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">AOV Real</p>
              <h3 className="text-2xl font-bold">{brl(data?.aovGeral ?? 0)}</h3>
            </div>
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500"><AlertTriangle className="size-5" /></div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Excluído do RFM</p>
              <h3 className="text-2xl font-bold">{brl(data?.receitaExcluida ?? 0)}</h3>
              <p className="text-[11px] text-muted-foreground">{data?.pedidosExcluidos ?? 0} pedidos não pagos/reembolsados</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h3 className="mb-6 text-lg font-bold">Clientes por Segmento</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "currentColor", opacity: 0.7 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ backgroundColor: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "8px", color: "#333" }} itemStyle={{ color: "#333" }} />
                <Bar dataKey="clientes" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-6">
          <h3 className="mb-6 text-lg font-bold">Clientes por Frequência de Compra</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={freqData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="faixa" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "currentColor", opacity: 0.7 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "currentColor", opacity: 0.7 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ backgroundColor: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "8px", color: "#333" }} itemStyle={{ color: "#333" }} />
                <Bar dataKey="clientes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border p-6">
          <h3 className="text-lg font-bold">Resumo dos Segmentos</h3>
          <p className="text-sm text-muted-foreground">Métricas reais observadas. Sem projeção de LTV — {data?.ltvDisponivel ? "histórico suficiente" : "LTV indisponível por histórico insuficiente"}.</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[200px]">Segmento</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">% Base</TableHead>
                <TableHead className="text-right">Pedidos Pagos</TableHead>
                <TableHead className="text-right">Freq. Média</TableHead>
                <TableHead className="text-right">Receita Válida</TableHead>
                <TableHead className="text-right">% Receita</TableHead>
                <TableHead className="text-right">AOV</TableHead>
                <TableHead className="text-right">Receita / Cliente</TableHead>
                <TableHead className="text-right">Tempo de Base</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.totalClientes ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">Nenhum cliente disponível para análise RFM.</TableCell>
                </TableRow>
              ) : (
                [...summary]
                  .sort((a, b) => b.receita - a.receita || b.clientes - a.clientes)
                  .map((s) => (
                    <TableRow key={s.name} className="group transition-colors hover:bg-muted/20">
                      <TableCell className="font-medium"><div className="flex items-center gap-2"><div className="size-2 rounded-full" style={{ backgroundColor: segColor(s.name) }} />{s.name}</div></TableCell>
                      <TableCell className="text-right">{new Intl.NumberFormat().format(s.clientes)}</TableCell>
                      <TableCell className="text-right"><Badge variant="secondary" className="font-normal">{s.pctBase.toFixed(1)}%</Badge></TableCell>
                      <TableCell className="text-right">{new Intl.NumberFormat().format(s.pedidos)}</TableCell>
                      <TableCell className="text-right">{s.frequenciaMedia.toFixed(2)}x</TableCell>
                      <TableCell className="text-right font-bold text-emerald-500">{brl(s.receita)}</TableCell>
                      <TableCell className="text-right"><div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/50"><div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${s.pctReceita}%` }} /></div><span className="mt-1 block text-[10px] text-muted-foreground">{s.pctReceita.toFixed(1)}%</span></TableCell>
                      <TableCell className="text-right">{brl(s.aov)}</TableCell>
                      <TableCell className="text-right text-blue-400">{brl(s.receitaPorCliente)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{s.tenureMedioDias === null ? "—" : `${Math.round(s.tenureMedioDias)}d`}</TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {activeSegments.map((name) => (
          <div key={name} className="surface-card border-l-4 p-5" style={{ borderLeftColor: RFM_SEGMENTS_CONFIG[name].color }}>
            <h4 className="flex items-center justify-between font-bold">{name}<Info className="size-4 text-muted-foreground" /></h4>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{RFM_SEGMENTS_CONFIG[name].description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
