import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";

type TopbarProps = {
  onMenuClick: () => void;
};

/** AppBar simples da Fase 1 (não existia antes) — hoje só carrega o botão de menu mobile
 *  que abre o Drawer temporário do Sidebar; conteúdo por tela (título, ações) fica pra
 *  quando cada tela for migrada. */
export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: "1px solid", borderColor: "divider" }}
    >
      <Toolbar sx={{ minHeight: 56, gap: 1 }}>
        <IconButton
          edge="start"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          sx={{ display: { xs: "inline-flex", md: "none" } }}
        >
          <MenuIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
