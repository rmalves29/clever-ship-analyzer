import { useState } from "react";
import { Plus, Target, Workflow, Zap } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/lib/crm-mock";
import { brl } from "@/lib/crm-mock";
import { createAndSendCampaign } from "@/lib/whatsapp-meta.functions";

export function SuggestedActions({ reguas, acoes }: { reguas: DashboardData["reguas"]; acoes: DashboardData["acoes"] }) {
  const runCreateCampaign = useServerFn(createAndSendCampaign);
  const [sendingCluster, setSendingCluster] = useState<string | null>(null);

  const handleApply = async (a: DashboardData["acoes"][number]) => {
    const confirmed = window.confirm(
      `Enviar a mensagem "${a.oferta}" via WhatsApp (API oficial da Meta) pra todos os clientes reais do segmento "${a.cluster}" agora?`,
    );
    if (!confirmed) return;

    const couponCode = window.prompt(
      "Código do cupom da Shopify pra essa campanha (opcional, usado pra medir vendas com mais precisão). Deixe em branco se não tiver.",
      "",
    );

    setSendingCluster(a.cluster);
    try {
      const res = await runCreateCampaign({
        data: {
          nome: a.cluster,
          segmentType: a.segmentType,
          messageType: "marketing",
          couponCode: couponCode?.trim() || undefined,
          bodyParams: [a.oferta],
        },
      });
      if (!res.success) {
        toast.error(res.error || "Falha ao enviar a campanha.");
        return;
      }
      if (res.total === 0) {
        toast.info("Nenhum cliente com telefone cadastrado nesse segmento.");
      } else {
        toast.success(`Campanha enviada: ${res.sent}/${res.total} mensagens (${res.failed} falharam).`);
      }
    } catch (err: any) {
      toast.error("Erro ao enviar campanha: " + (err?.message ?? "falha desconhecida"));
    } finally {
      setSendingCluster(null);
    }
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
              <Button
                variant="secondary"
                className="mt-4 w-full"
                onClick={() =>
                  toast.info('Réguas recorrentes automáticas ainda não estão disponíveis — use "Aplicar ação" abaixo para envios pontuais.')
                }
              >
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
          <table className="w-full min-w-[840px] text-sm">
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
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={sendingCluster === a.cluster}
                      onClick={() => handleApply(a)}
                    >
                      <Plus className="size-3.5" /> {sendingCluster === a.cluster ? "Enviando..." : "Aplicar ação"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
