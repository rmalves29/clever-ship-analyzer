import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getCampaignDetail } from "@/lib/whatsapp-meta.functions";

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
  const { data } = useQuery({
    queryKey: ["whatsapp-campaign-detail", campaignId],
    queryFn: () => runDetail({ data: { campaignId: campaignId! } }),
    enabled: Boolean(campaignId),
  });

  return (
    <Dialog open={Boolean(campaignId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
        <h2 className="text-lg font-semibold">{data?.campaign?.nome ?? "Campanha"}</h2>
        <p className="text-sm text-muted-foreground">Detalhamento por destinatário.</p>

        <div className="mt-2 space-y-1.5">
          {!data && <p className="text-sm text-muted-foreground">Carregando...</p>}
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
