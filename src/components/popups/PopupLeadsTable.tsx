import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPopupLeads } from "@/lib/popup.functions";

export function PopupLeadsTable() {
  const list = useServerFn(listPopupLeads);
  const { data: leads, isLoading } = useQuery({ queryKey: ["popup-leads"], queryFn: () => list() });

  return (
    <div className="py-4">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Telefone</th>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Pop-up</th>
              <th className="px-4 py-3 font-medium">Cupom</th>
              <th className="px-4 py-3 font-medium">Capturada em</th>
              <th className="px-4 py-3 font-medium">Última visita</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!isLoading && (leads ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma lead capturada ainda.
                </td>
              </tr>
            )}
            {(leads ?? []).map((lead: any) => (
              <tr key={lead.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{lead.phone}</td>
                <td className="px-4 py-3">{lead.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{lead.popup_campaigns?.name ?? "—"}</td>
                <td className="px-4 py-3">{lead.coupon_code ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(lead.first_captured_at).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {lead.last_visit_at ? new Date(lead.last_visit_at).toLocaleString("pt-BR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
