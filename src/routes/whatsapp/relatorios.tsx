import { createFileRoute } from "@tanstack/react-router";
import { ReportsTab } from "@/components/whatsapp/ReportsTab";
import { QueueHealthPanel } from "@/components/whatsapp/QueueHealthPanel";

export const Route = createFileRoute("/whatsapp/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios de WhatsApp | CRM Insights" },
      { name: "description", content: "Resultados de entrega, leitura, falhas e saúde da fila de envio do WhatsApp." },
      { property: "og:title", content: "Relatórios de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Métricas consolidadas das campanhas de WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <QueueHealthPanel />
      <ReportsTab />
    </div>
  ),
});
