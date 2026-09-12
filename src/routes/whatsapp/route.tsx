import { createFileRoute, createLink, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Megaphone, Inbox, FileText, Workflow, BarChart3, Settings } from "lucide-react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

export const Route = createFileRoute("/whatsapp")({
  component: WhatsappLayout,
});

const NavButton = createLink(Button);

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
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: "1px solid", borderColor: "divider", backdropFilter: "blur(8px)", bgcolor: "background.default" }}
      >
        <Toolbar sx={{ maxWidth: 1400, width: "100%", mx: "auto", gap: 2, flexWrap: "wrap", py: 1.5, px: { xs: 2, md: 4 } }} disableGutters>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 3,
              background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              color: "primary.contrastText",
            }}
          >
            <MessageCircle size={20} />
          </Box>
          <Box sx={{ mr: "auto" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>WhatsApp</Typography>
            <Typography variant="caption" color="text.secondary">API oficial da Meta — campanhas, conversas e modelos.</Typography>
          </Box>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 0.5, bgcolor: "background.paper" }}>
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <NavButton
                  key={item.to}
                  to={item.to}
                  size="small"
                  variant={active ? "contained" : "text"}
                  color={active ? "primary" : "inherit"}
                  startIcon={<item.icon size={14} />}
                  sx={{ borderRadius: 2 }}
                >
                  {item.label}
                </NavButton>
              );
            })}
          </Stack>
          <IconButton component={Link} to="/configuracoes" sx={{ border: "1px solid", borderColor: "divider" }}>
            <Settings size={16} />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 4 }, py: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
