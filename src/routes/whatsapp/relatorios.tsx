import { createFileRoute } from "@tanstack/react-router";
import { ReportsTab } from "@/components/whatsapp/ReportsTab";

export const Route = createFileRoute("/whatsapp/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios de WhatsApp | CRM Insights" },
      {
        name: "description",
        content:
          "Resultados de entrega, leitura, vendas, receita e ROAS das campanhas manuais de WhatsApp.",
      },
      { property: "og:title", content: "Relatórios de WhatsApp | CRM Insights" },
      {
        property: "og:description",
        content: "Métricas das campanhas manuais, separadas das automações de WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsTab,
});
