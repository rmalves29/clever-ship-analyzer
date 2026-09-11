import { createFileRoute, redirect } from "@tanstack/react-router";

/** A área antiga (7 abas numa tela só) foi substituída pela seção /whatsapp. */
export const Route = createFileRoute("/campanhas-whatsapp")({
  validateSearch: (search: Record<string, unknown>) => ({ tab: (search["tab"] as string) ?? "" }),
  beforeLoad: ({ search }) => {
    const tab = String(search.tab ?? "");
    const to =
      tab === "conversas"
        ? "/whatsapp/conversas"
        : tab === "templates"
          ? "/whatsapp/modelos"
          : tab === "relatorios"
            ? "/whatsapp/relatorios"
            : tab === "automacoes" || tab === "fluxo-api"
              ? "/whatsapp/automacoes"
              : "/whatsapp";
    throw redirect({ to });
  },
  component: () => null,
});
