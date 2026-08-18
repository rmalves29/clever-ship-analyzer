import { useState } from "react";
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
  LineChart,
  Line,
  Legend
} from "recharts";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
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
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { getRFMStats, calculateRFMSegments, RFM_SEGMENTS_CONFIG } from "@/lib/crm-rfm.functions";
import { brl } from "@/lib/crm-mock";

export function RFMAnalysis() {
  const queryClient = useQueryClient();
  const fetchStats = useServerFn(getRFMStats);
  const runCalculate = useServerFn(calculateRFMSegments);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rfm-stats"],
    queryFn: () => fetchStats(),
  });

  const calculateMutation = useMutation({
    mutationFn: () => runCalculate(),
    onSuccess: () => {
      toast.success("Análise RFM recalculada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["rfm-stats"] });
      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao calcular RFM: " + err.message);
    }
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

  const summary = data?.summary || [];
  
  // Dados para o gráfico de distribuição
  const chartData = summary.map(s => ({
    name: s.name,
    clientes: s.clientes,
    receita: s.receita,
    color: RFM_SEGMENTS_CONFIG[s.name as keyof typeof RFM_SEGMENTS_CONFIG]?.color || "#ccc"
  })).sort((a, b) => b.clientes - a.clientes);

  return (
    <div className="space-y-8 pb-12">
      {/* Header com Ação */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Análise RFM</h2>
          <p className="text-sm text-muted-foreground">Recência, Frequência e Valor Monetário da sua base.</p>
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
          Recalcular Análise RFM
        </Button>
      </div>

      {/* Grid de KPIs Rápidos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Base Total</p>
              <h3 className="text-2xl font-bold">{new Intl.NumberFormat().format(data?.totalClientes || 0)}</h3>
            </div>
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <ShoppingBag className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Receita Total</p>
              <h3 className="text-2xl font-bold">{brl(data?.totalReceita || 0)}</h3>
            </div>
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand/10 p-2 text-brand">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Segmento Líder</p>
              <h3 className="text-2xl font-bold truncate">{chartData[0]?.name || "-"}</h3>
            </div>
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">AOV Geral</p>
              <h3 className="text-2xl font-bold">
                {brl((data?.totalReceita || 0) / (summary.reduce((acc, s) => acc + s.pedidos, 0) || 1))}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos de Distribuição */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h3 className="text-lg font-bold mb-6">Volume de Clientes por Segmento</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={150} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: "currentColor", opacity: 0.7 }}
                />
                <Tooltip 
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{ 
                    backgroundColor: "white", 
                    border: "1px solid rgba(0,0,0,0.1)", 
                    borderRadius: "8px",
                    color: "#333"
                  }}
                  itemStyle={{ color: "#333" }}
                />
                <Bar dataKey="clientes" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-6">
          <h3 className="text-lg font-bold mb-6">Receita por Segmento</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={150} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: "currentColor", opacity: 0.7 }}
                />
                <Tooltip 
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  formatter={(value: number) => brl(value)}
                  contentStyle={{ 
                    backgroundColor: "white", 
                    border: "1px solid rgba(0,0,0,0.1)", 
                    borderRadius: "8px",
                    color: "#333"
                  }}
                  itemStyle={{ color: "#333" }}
                />
                <Bar dataKey="receita" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabela Resumo dos Segmentos */}
      <div className="surface-card overflow-hidden">
        <div className="border-b border-border p-6">
          <h3 className="text-lg font-bold">Resumo dos Segmentos</h3>
          <p className="text-sm text-muted-foreground">Detalhamento completo das métricas por categoria RFM.</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[200px]">Segmento</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">% Base</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Freq. Média</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">% Receita</TableHead>
                <TableHead className="text-right">Ticket Médio (AOV)</TableHead>
                <TableHead className="text-right">LTV Est. (365d)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    Nenhum dado RFM processado. Clique em "Recalcular Análise RFM" para começar.
                  </TableCell>
                </TableRow>
              ) : (
                summary.sort((a, b) => b.receita - a.receita).map((s) => (
                  <TableRow key={s.name} className="hover:bg-muted/20 transition-colors group">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div 
                          className="size-2 rounded-full" 
                          style={{ backgroundColor: RFM_SEGMENTS_CONFIG[s.name as keyof typeof RFM_SEGMENTS_CONFIG]?.color }} 
                        />
                        {s.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{new Intl.NumberFormat().format(s.clientes)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="font-normal">{s.pctBase.toFixed(1)}%</Badge>
                    </TableCell>
                    <TableCell className="text-right">{new Intl.NumberFormat().format(s.pedidos)}</TableCell>
                    <TableCell className="text-right">{s.frequenciaMedia.toFixed(2)}x</TableCell>
                    <TableCell className="text-right font-bold text-emerald-500">{brl(s.receita)}</TableCell>
                    <TableCell className="text-right">
                      <div className="w-full bg-muted/50 rounded-full h-1.5 mt-1 overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-500" 
                          style={{ width: `${s.pctReceita}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1 block">{s.pctReceita.toFixed(1)}%</span>
                    </TableCell>
                    <TableCell className="text-right">{brl(s.aov)}</TableCell>
                    <TableCell className="text-right text-blue-400">{brl(s.ltv365)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Explicação RFM */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(RFM_SEGMENTS_CONFIG).map(([name, config]) => (
          <div key={name} className="surface-card p-5 border-l-4" style={{ borderLeftColor: config.color }}>
            <h4 className="font-bold flex items-center justify-between">
              {name}
              <Info className="size-4 text-muted-foreground" />
            </h4>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {config.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
