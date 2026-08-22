import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Settings, Sparkles, Megaphone, FileText, BarChart3, TrendingUp, Camera, CalendarClock, Workflow, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  to:
    | "/"
    | "/configuracoes"
    | "/campanhas-whatsapp"
    | "/crm"
    | "/crm/live-view"
    | "/performance/meta-ads"
    | "/instagram"
    | "/eventos"
    | "/flow"
    | "/fluxo-envio";
  search?: Record<string, string>;
  icon: typeof LayoutDashboard;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "CRM",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard },
      { label: "Live View", to: "/crm/live-view", icon: BarChart3 },
      { label: "Contatos", to: "/crm", search: { tab: "contatos" }, icon: Sparkles },
      { label: "Segmentos", to: "/crm", search: { tab: "segmentos" }, icon: Sparkles },
      { label: "Listas Estáticas", to: "/crm", search: { tab: "listas" }, icon: Sparkles },
      { label: "Análise RFM", to: "/crm", search: { tab: "rfm" }, icon: BarChart3 },
    ],
  },
  {
    label: "WhatsApp API",
    items: [
      { label: "Campanhas", to: "/campanhas-whatsapp", search: { tab: "campanhas" }, icon: Megaphone },
      { label: "Templates", to: "/campanhas-whatsapp", search: { tab: "templates" }, icon: FileText },
      { label: "Relatórios", to: "/campanhas-whatsapp", search: { tab: "relatorios" }, icon: BarChart3 },
    ],
  },
  {
    label: "Meta",
    items: [
      { label: "Facebook Ads", to: "/performance/meta-ads", icon: TrendingUp },
      { label: "Instagram", to: "/instagram", icon: Camera },
    ],
  },
  {
    label: "Eventos",
    items: [
      { label: "Linha do Tempo", to: "/eventos", icon: CalendarClock },
    ],
  },
  {
    label: "Automações",
    items: [
      { label: "ManyChat", to: "/flow", icon: Workflow },
    ],
  },
  {
    label: "Fluxo de Envio",
    items: [
      { label: "Fluxo de Envio", to: "/fluxo-envio", icon: Send },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Configurações", to: "/configuracoes", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, string | undefined>;

  return (
    <aside className="hidden min-h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="gradient-brand flex size-9 items-center justify-center rounded-xl text-primary-foreground">
          <Sparkles className="size-4" />
        </span>
        <span className="font-bold tracking-tight">CRM Analytics</span>
      </div>
      <nav className="flex-1 space-y-6 px-3 pb-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
            <div className="mt-2 space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to && (!item.search || search["tab"] === item.search["tab"]);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    {...(item.search ? { search: item.search } : {})}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      active ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
