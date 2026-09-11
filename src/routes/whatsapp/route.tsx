import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Megaphone, Inbox, FileText, Workflow, BarChart3, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/whatsapp")({
  component: WhatsappLayout,
});

const NAV: { to: any; label: string; icon: any; exact?: boolean }[] = [
  { to: "/whatsapp", label: "Campanhas", icon: Megaphone, exact: true },
  { to: "/whatsapp/conversas", label: "Conversas", icon: Inbox },
  { to: "/whatsapp/modelos", label: "Modelos", icon: FileText },
  { to: "/whatsapp/automacoes", label: "Automações", icon: Workflow },
  { to: "/whatsapp/relatorios", label: "Relatórios", icon: BarChart3 },
];

function WhatsappLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-4 py-4 md:px-8">
          <span className="gradient-brand flex size-10 items-center justify-center rounded-2xl text-primary-foreground">
            <MessageCircle className="size-5" />
          </span>
          <div className="mr-auto">
            <h1 className="text-lg font-bold leading-tight tracking-tight">WhatsApp</h1>
            <p className="text-xs text-muted-foreground">API oficial da Meta — campanhas, conversas e modelos.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "gradient-brand text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Button variant="outline" size="icon" asChild className="size-9 rounded-full">
            <Link to="/configuracoes">
              <Settings className="size-4" />
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
