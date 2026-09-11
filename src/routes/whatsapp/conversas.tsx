import { createFileRoute } from "@tanstack/react-router";
import { InboxTab } from "@/components/whatsapp/InboxTab";

export const Route = createFileRoute("/whatsapp/conversas")({
  head: () => ({
    meta: [
      { title: "Conversas de WhatsApp | CRM Insights" },
      { name: "description", content: "Veja e responda as mensagens que chegam no número oficial da loja." },
      { property: "og:title", content: "Conversas de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Caixa de entrada do WhatsApp oficial integrada ao CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <InboxTab />,
});
