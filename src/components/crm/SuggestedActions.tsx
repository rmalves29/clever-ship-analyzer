import { useState } from "react";
import { Plus, Target, Workflow, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/lib/crm-mock";
import { brl } from "@/lib/crm-mock";
import { WhatsappSendDialog, type SendDialogSeed } from "@/components/whatsapp/WhatsappSendDialog";
import { AutomationDialog, type AutomationSeed } from "./AutomationDialog";

export function SuggestedActions({ reguas, acoes }: { reguas: DashboardData["reguas"]; acoes: DashboardData["acoes"] }) {
  const [sendSeed, setSendSeed] = useState<SendDialogSeed | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [autoSeed, setAutoSeed] = useState<AutomationSeed | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);

  const openSend = (a: DashboardData["acoes"][number]) => {
    setSendSeed({ nome: a.cluster, segmentType: a.segmentType, oferta: a.oferta });
    setSendOpen(true);
  };

  const openInstall = (r: DashboardData["reguas"][number]) => {
    setAutoSeed({
      nome: r.titulo,
      descricao: r.descricao,
      bodyParams: [r.descricao],
      requerAprovacao: true,
      ativo: true,
    });
    setAutoOpen(true);
  };

  const openInstallFromAction = (a: DashboardData["acoes"][number]) => {
    setAutoSeed({
      nome: a.cluster,
      descricao: a.criterio,
      segmentType: a.segmentType,
      bodyParams: [a.oferta],
      requerAprovacao: true,
      ativo: true,
    });
    setAutoOpen(true);
  };

  return (
    <section className="surface-card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border p-5">
        <span className="gradient-brand flex size-10 items-center justify-center rounded-xl text-primary-foreground">
          <Zap className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Ações sugeridas</h2>
          <p className="text-sm text-muted-foreground">Baseado nos dados acima — réguas e ações pontuais prontas.</p>
        </div>
      </header>

      <div className="p-5">
        <div className="flex items-center gap-2">
          <Workflow className="size-4 text-brand" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Réguas sugeridas</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{reguas.length}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Receita projetada considerando janela de <strong>30 dias após implantação</strong>.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {reguas.map((r) => (
            <article key={r.titulo} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold">{r.titulo}</h4>
                <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  {r.tag}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.descricao}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">% base</dt>
                  <dd className="font-semibold">{r.base}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">conv.</dt>
                  <dd className="font-semibold">{r.conv}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">receita 30d</dt>
                  <dd className="font-semibold text-brand">{brl(r.receita)}</dd>
                </div>
              </dl>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => openInstall(r)}>
                Instalar régua
              </Button>
            </article>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-2">
          <Target className="size-4 text-brand" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Ações pontuais sugeridas</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{acoes.length}</span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cluster / critério</th>
                <th className="px-4 py-3 font-medium">% base</th>
                <th className="px-4 py-3 font-medium">Oferta</th>
                <th className="px-4 py-3 font-medium">Janela</th>
                <th className="px-4 py-3 font-medium">Conv.</th>
                <th className="px-4 py-3 font-medium">Receita proj.</th>
                <th className="px-4 py-3 text-right font-medium">Aplicar</th>
              </tr>
            </thead>
            <tbody>
              {acoes.map((a) => (
                <tr key={a.cluster} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.cluster}</p>
                    <p className="text-xs text-muted-foreground">{a.criterio}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-brand">{a.base}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.oferta}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.janela}</td>
                  <td className="px-4 py-3">{a.conv}</td>
                  <td className="px-4 py-3 font-semibold">{brl(a.receita)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-1 border-brand/20 text-brand hover:bg-brand/5" 
                        onClick={() => openInstallFromAction(a)}
                      >
                        <Workflow className="size-3.5" /> Automatizar
                      </Button>
                      <Button 
                        size="sm" 
                        className="gap-1 bg-brand text-white hover:bg-brand/90" 
                        onClick={() => openSend(a)}
                      >
                        <Plus className="size-3.5" /> Aplicar ação
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WhatsappSendDialog seed={sendSeed} open={sendOpen} onOpenChange={setSendOpen} />
      <AutomationDialog seed={autoSeed} open={autoOpen} onOpenChange={setAutoOpen} />
    </section>
  );
}
