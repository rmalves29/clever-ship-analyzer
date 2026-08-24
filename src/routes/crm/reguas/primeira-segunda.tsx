import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, Sparkles, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRepurchaseCustomers, getRepurchaseDashboard } from "@/lib/crm-repurchase.functions";

export const Route = createFileRoute("/crm/reguas/primeira-segunda")({ component: RepurchasePage });
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Card({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <div className="surface-card p-5"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>;
}

function RepurchasePage() {
  const fetchDashboard = useServerFn(getRepurchaseDashboard);
  const fetchCustomers = useServerFn(getRepurchaseCustomers);
  const [stage, setStage] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["repurchase-dashboard"], queryFn: () => fetchDashboard() });
  const { data: customers = [] } = useQuery({ queryKey: ["repurchase-customers", stage, search], queryFn: () => fetchCustomers({ data: { stage, search } }) });
  if (isLoading || !data) return <div className="p-8 text-muted-foreground">Carregando régua de recompra…</div>;
  const s = data.summary;
  return <div className="space-y-6 p-6 lg:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">CRM → Réguas</p><h1 className="text-2xl font-bold">1ª compra → 2ª compra</h1><p className="text-sm text-muted-foreground">Transforme compradores de primeira viagem em clientes recorrentes.</p></div><div className="flex gap-2"><Button variant="outline" disabled><Sparkles className="mr-2 size-4"/>Sugerir campanha com IA</Button><Button disabled><Target className="mr-2 size-4"/>Criar campanha</Button></div></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Card label="Aguardando 2ª compra" value={s.pending} hint="1 pedido válido"/><Card label="Converteram" value={s.converted} hint="Já fizeram a 2ª compra"/><Card label="Taxa de recompra" value={pct(s.conversionRate)} hint="1ª → 2ª compra"/><Card label="Receita de 2ª compra" value={brl(s.secondRevenue)} hint={`Ticket ${brl(s.secondAverageTicket)}`}/><Card label="Tempo médio" value={`${s.averageDaysToSecondOrder.toFixed(1)} dias`} hint="Até a 2ª compra"/></div>
    <section className="surface-card p-5"><div className="mb-4 flex items-center gap-2"><Users className="size-4"/><h2 className="font-semibold">Jornada de recompra</h2></div><div className="grid gap-2 lg:grid-cols-7">{Object.entries(s.windows).map(([name,count]) => <button key={name} onClick={() => setStage(name)} className="rounded-xl border p-4 text-left hover:bg-muted/40"><p className="text-xs text-muted-foreground">{name}</p><p className="mt-1 text-2xl font-bold">{count as number}</p></button>)}<button onClick={() => setStage("Convertido")} className="rounded-xl border p-4 text-left hover:bg-muted/40"><p className="text-xs text-muted-foreground">2ª compra</p><p className="mt-1 text-2xl font-bold">{s.converted}</p><p className="text-xs text-muted-foreground">Convertido</p></button></div></section>
    <section className="surface-card p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Clientes {stage ? `— ${stage}` : "— toda a jornada"}</h2><p className="text-xs text-muted-foreground">Clique em uma etapa do funil para filtrar.</p></div><div className="flex gap-2"><Input className="w-64" placeholder="Buscar cliente…" value={search} onChange={(e)=>setSearch(e.target.value)}/>{stage && <Button variant="outline" onClick={()=>setStage(undefined)}>Limpar filtro</Button>}</div></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>1ª compra</TableHead><TableHead>Dias</TableHead><TableHead>Valor</TableHead><TableHead>Local</TableHead><TableHead>Estágio</TableHead><TableHead>2ª compra</TableHead></TableRow></TableHeader><TableBody>{customers.slice(0,100).map((c:any)=><TableRow key={c.customerId}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{new Date(c.firstOrderAt).toLocaleDateString("pt-BR")}</TableCell><TableCell>{c.daysSinceFirstOrder}</TableCell><TableCell>{brl(c.firstOrderRevenue)}</TableCell><TableCell>{[c.city,c.province].filter(Boolean).join("/") || "—"}</TableCell><TableCell>{c.stage}</TableCell><TableCell>{c.secondOrderAt ? <span className="inline-flex items-center gap-1">{new Date(c.secondOrderAt).toLocaleDateString("pt-BR")}<ArrowRight className="size-3"/>{brl(c.secondOrderRevenue)}</span> : "—"}</TableCell></TableRow>)}</TableBody></Table></div></section>
    <section className="surface-card p-5"><h2 className="mb-4 font-semibold">Coortes de primeira compra</h2><Table><TableHeader><TableRow><TableHead>Mês</TableHead><TableHead>Clientes</TableHead><TableHead>2ª compra</TableHead><TableHead>Taxa</TableHead><TableHead>Tempo médio</TableHead><TableHead>Receita</TableHead></TableRow></TableHeader><TableBody>{data.cohorts.map((c:any)=><TableRow key={c.month}><TableCell>{c.month}</TableCell><TableCell>{c.customers}</TableCell><TableCell>{c.converted}</TableCell><TableCell>{pct(c.conversionRate)}</TableCell><TableCell>{c.averageDaysToSecondOrder.toFixed(1)} dias</TableCell><TableCell>{brl(c.secondOrderRevenue)}</TableCell></TableRow>)}</TableBody></Table></section>
  </div>;
}
