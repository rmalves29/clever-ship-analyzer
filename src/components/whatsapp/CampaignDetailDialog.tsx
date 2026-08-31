import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCampaignDetail } from "@/lib/whatsapp-meta.functions";
import { brl } from "@/lib/crm-mock";
import { deleteOtherManualWhatsappCampaignAttempts } from "@/lib/whatsapp-campaign-cleanup.functions";

const STATUS_LABEL: Record<string, string> = { sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou" };
const STATUS_CLASS: Record<string, string> = {
  sent: "bg-muted text-muted-foreground",
  delivered: "bg-brand-soft text-brand",
  read: "bg-success-soft text-success",
  failed: "bg-critical-soft text-critical",
};

function maskPhone(phone: string) {
  return phone.length > 6 ? `${phone.slice(0, -4).replace(/\d/g, "•")}${phone.slice(-4)}` : phone;
}

export function CampaignDetailDialog({ campaignId, onOpenChange }: { campaignId: string | null; onOpenChange: (v: boolean) => void }) {
  const runDetail = useServerFn(getCampaignDetail);
  const runCleanup = useServerFn(deleteOtherManualWhatsappCampaignAttempts);
  const queryClient = useQueryClient();
  const [cleaning, setCleaning] = useState(false);

  const { data } = useQuery({
    queryKey: ["whatsapp-campaign-detail", campaignId],
    queryFn: () => runDetail({ data: { campaignId: campaignId! } }),
    enabled: Boolean(campaignId),
  });

  const handleCleanup = async () => {
    if (!campaignId) return;
    const confirmed = window.confirm(
      "Manter esta campanha e excluir todas as outras campanhas manuais anteriores? Filas e destinatários vinculados às tentativas antigas também serão removidos. Campanhas de automação não serão apagadas.",
    );
    if (!confirmed) return;

    setCleaning(true);
    try {
      const result = await runCleanup({ data: { keepCampaignId: campaignId } });
      if (!result.success) {
        toast.error(result.error || "Não foi possível limpar as tentativas anteriores.");
        return;
      }
      toast.success(
        result.deleted > 0
          ? `${result.deleted} tentativa(s) anterior(es) removida(s). Esta campanha foi mantida.`
          : "Não existem outras tentativas manuais para remover.",
      );
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
    } catch (error: any) {
      toast.error("Erro ao limpar tentativas: " + (error?.message ?? "falha desconhecida"));
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Dialog open={Boolean(campaignId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pr-8">
          <div>
            <h2 className="text-lg font-semibold">Detalhes da campanha</h2>
            <p className="text-sm text-muted-foreground">Acompanhe os destinatários e o resultado do processamento desta campanha.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1 text-critical"
            onClick={handleCleanup}
            disabled={!campaignId || cleaning}
          >
            <Trash2 className="size-3.5" />
            {cleaning ? "Limpando..." : "Excluir outras tentativas"}
          </Button>
        </div>

        {!data && <p className="mt-2 text-sm text-muted-foreground">Carregando...</p>}

        {data && data.couponCodes.length > 0 && (
          <section className="mt-2 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">Compras confirmadas por cupom</h3>
                <p className="text-xs text-muted-foreground">Pedidos válidos em que a Shopify registrou um dos códigos acompanhados.</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {data.couponCodes.map((code) => <Badge key={code} variant="outline">{code}</Badge>)}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-background p-2">
                <p className="text-lg font-bold">{data.couponSummary.orders}</p>
                <p className="text-[11px] text-muted-foreground">Pedidos</p>
              </div>
              <div className="rounded-lg bg-background p-2">
                <p className="text-lg font-bold">{data.couponSummary.customers}</p>
                <p className="text-[11px] text-muted-foreground">Clientes</p>
              </div>
              <div className="rounded-lg bg-background p-2">
                <p className="text-lg font-bold">{brl(data.couponSummary.revenue)}</p>
                <p className="text-[11px] text-muted-foreground">Receita</p>
              </div>
            </div>

            {!data.couponBackfillComplete && (
              <p className="mt-3 text-xs text-muted-foreground">O histórico ainda será completado na próxima sincronização da Shopify.</p>
            )}
            {data.couponBackfillComplete && data.couponConversions.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum uso comprovado desses cupons foi encontrado.</p>
            )}
            {data.couponConversions.length > 0 && (
              <div className="mt-3 space-y-2">
                {data.couponConversions.map((conversion) => (
                  <div key={conversion.orderId} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{conversion.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {conversion.orderNumber} · {conversion.couponCode}
                        {conversion.processedAt ? ` · ${new Date(conversion.processedAt).toLocaleDateString("pt-BR")}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold">{brl(conversion.totalPrice)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="mt-2 space-y-1.5">
          {data && <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destinatários</p>}
          {data?.recipients.length === 0 && <p className="text-sm text-muted-foreground">Nenhum destinatário registrado.</p>}
          {data?.recipients.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{maskPhone(r.phone)}</p>
                {r.error && <p className="text-xs text-critical">{r.error}</p>}
              </div>
              <Badge className={STATUS_CLASS[r.status] ?? ""} variant="outline">
                {STATUS_LABEL[r.status] ?? r.status}
              </Badge>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
