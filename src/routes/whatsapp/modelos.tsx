import { createFileRoute } from "@tanstack/react-router";
import { TemplatesTab } from "@/components/whatsapp/TemplatesTab";

export const Route = createFileRoute("/whatsapp/modelos")({
  head: () => ({
    meta: [
      { title: "Modelos de mensagem | CRM Insights" },
      { name: "description", content: "Crie, edite e acompanhe a aprovação dos modelos de mensagem do WhatsApp oficial." },
      { property: "og:title", content: "Modelos de mensagem | CRM Insights" },
      { property: "og:description", content: "Gestão dos modelos aprovados pela Meta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <TemplatesTab />,
});
