import { createLink, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Settings,
  Sparkles,
  Megaphone,
  FileText,
  BarChart3,
  TrendingUp,
  Camera,
  CalendarClock,
  Workflow,
  Send,
  RefreshCw,
  LayoutTemplate,
  Coins,
} from "lucide-react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

export const SIDEBAR_WIDTH = 240;

// `createLink` (oficial do TanStack Router) faz o ListItemButton entender `to`/`search`
// tipados da rota, mantendo o botão como um <a> de verdade (funciona com ctrl+click,
// abrir em nova aba, etc.) em vez de embrulhar um <Link> por fora.
const NavListItemButton = createLink(ListItemButton);

type NavItem = {
  label: string;
  to:
    | "/"
    | "/configuracoes"
    | "/campanhas-whatsapp"
    | "/whatsapp"
    | "/whatsapp/nova"
    | "/whatsapp/conversas"
    | "/whatsapp/modelos"
    | "/whatsapp/automacoes"
    | "/whatsapp/relatorios"
    | "/crm"
    | "/crm/live-view"
    | "/crm/reguas/primeira-segunda"
    | "/performance/meta-ads"
    | "/instagram"
    | "/eventos"
    | "/flow"
    | "/fluxo-envio"
    | "/popups"
    | "/cashback"
    | "/ga4";
  search?: Record<string, string>;
  icon: typeof LayoutDashboard;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "CRM",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard },
      { label: "Live View", to: "/crm/live-view", icon: BarChart3 },
      {
        label: "Contatos",
        to: "/crm",
        search: { tab: "contatos" },
        icon: Sparkles,
      },
      {
        label: "Segmentos",
        to: "/crm",
        search: { tab: "segmentos" },
        icon: Sparkles,
      },
      {
        label: "Listas Estáticas",
        to: "/crm",
        search: { tab: "listas" },
        icon: Sparkles,
      },
      {
        label: "Análise RFM",
        to: "/crm",
        search: { tab: "rfm" },
        icon: BarChart3,
      },
      {
        label: "Régua de Recompra",
        to: "/crm/reguas/primeira-segunda",
        icon: RefreshCw,
      },
    ],
  },
  {
    label: "WhatsApp API",
    items: [
      { label: "Campanhas", to: "/whatsapp", icon: Megaphone },
      { label: "Conversas", to: "/whatsapp/conversas", icon: Send },
      { label: "Modelos", to: "/whatsapp/modelos", icon: FileText },
      { label: "Automações", to: "/whatsapp/automacoes", icon: Workflow },
      { label: "Relatórios", to: "/whatsapp/relatorios", icon: BarChart3 },
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
    items: [{ label: "Linha do Tempo", to: "/eventos", icon: CalendarClock }],
  },
  {
    label: "Automações",
    items: [
      { label: "ManyChat", to: "/flow", icon: Workflow },
      { label: "Fluxo de Envio", to: "/fluxo-envio", icon: Send },
      { label: "Pop-ups", to: "/popups", icon: LayoutTemplate },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { label: "Cashback", to: "/cashback", icon: Coins },
      { label: "Google Analytics", to: "/ga4", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    items: [{ label: "Configurações", to: "/configuracoes", icon: Settings }],
  },
];

type SidebarProps = {
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as Record<
    string,
    string | undefined
  >;

  const content = (
    <>
      <Toolbar sx={{ gap: 1.5 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 2,
            background: "linear-gradient(135deg, #7367F0, #9C93F3)",
            color: "#FFFFFF",
            flexShrink: 0,
          }}
        >
          <Sparkles size={16} />
        </Box>
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
          CRM Analytics
        </Typography>
      </Toolbar>
      <Box component="nav" sx={{ flex: 1, overflowY: "auto", px: 1.5, pb: 3 }}>
        {NAV_GROUPS.map((group) => (
          <Box key={group.label} sx={{ mb: 3 }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                px: 1,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: "text.secondary",
              }}
            >
              {group.label}
            </Typography>
            <List dense disablePadding sx={{ mt: 0.5 }}>
              {group.items.map((item) => {
                const active =
                  pathname === item.to &&
                  (!item.search || search["tab"] === item.search["tab"]);
                const Icon = item.icon;
                return (
                  <NavListItemButton
                    key={item.label}
                    to={item.to}
                    {...(item.search ? { search: item.search } : {})}
                    selected={active}
                    onClick={onMobileClose}
                    sx={{
                      borderRadius: 2,
                      mb: 0.25,
                      color: active ? "primary.main" : "text.secondary",
                      "&.Mui-selected": {
                        backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                        "&:hover": {
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
                        },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>
                      <Icon size={16} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 500 } } }}
                    />
                  </NavListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
    </>
  );

  return (
    <Box component="nav" sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": { boxSizing: "border-box", width: SIDEBAR_WIDTH },
        }}
      >
        {content}
      </Drawer>
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": { boxSizing: "border-box", width: SIDEBAR_WIDTH },
        }}
      >
        {content}
      </Drawer>
    </Box>
  );
}
