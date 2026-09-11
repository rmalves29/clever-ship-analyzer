/** Tema MUI recriado a partir da identidade visual do template Materio (ThemeSelection) —
 *  paleta e proporções por conhecimento de domínio público do design do template, nenhum
 *  código foi copiado do repositório original.
 *
 *  `cssVariables: true` gera `--mui-palette-*`/`--mui-shape-*` como custom properties, o que
 *  facilita comparar lado a lado com os tokens `oklch()` do Tailwind durante a migração
 *  incremental, e deixa dark mode (via `colorSchemes`) pronto pra ligar no futuro sem
 *  reestruturar o tema — não implementado nesta leva por pedido explícito.
 *
 *  As variantes customizadas do MuiButton (outline/ghost/destructive/link/secondary) existem
 *  pra reaproveitar os ~60 call-sites de <Button variant="..."> que hoje usam os nomes de
 *  variante do shadcn, sem precisar reescrever cada um durante a migração tela por tela. */
import { createTheme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    outline: true;
    ghost: true;
    destructive: true;
    link: true;
  }
}

const FONT_FAMILY = '"Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif';

export const materioTheme = createTheme({
  cssVariables: true,
  palette: {
    primary: {
      main: "#7367F0",
      light: "#9C93F3",
      dark: "#5C54D0",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#8A8D93",
      light: "#A5A8AC",
      dark: "#7A7D82",
      contrastText: "#FFFFFF",
    },
    success: { main: "#28C76F" },
    warning: { main: "#FF9F43" },
    error: { main: "#EA5455" },
    info: { main: "#00CFE8" },
    background: {
      default: "#F8F7FA",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#2A2E42",
      secondary: "#6E6B7B",
    },
    divider: alpha("#2A2E42", 0.12),
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: FONT_FAMILY,
    button: {
      textTransform: "none",
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8 },
      },
      variants: [
        {
          // shadcn "outline" -> already close to MUI's own "outlined", kept as an alias so
          // call-sites written against the shadcn vocabulary don't need a rename pass.
          props: { variant: "outline" },
          style: ({ theme }) => ({
            border: `1px solid ${theme.palette.divider}`,
            color: theme.palette.text.primary,
            backgroundColor: "transparent",
            "&:hover": {
              backgroundColor: alpha(theme.palette.text.primary, 0.04),
              borderColor: theme.palette.text.primary,
            },
          }),
        },
        {
          // shadcn "ghost"
          props: { variant: "ghost" },
          style: ({ theme }) => ({
            backgroundColor: "transparent",
            color: theme.palette.text.primary,
            "&:hover": { backgroundColor: alpha(theme.palette.text.primary, 0.04) },
          }),
        },
        {
          // shadcn "destructive"
          props: { variant: "destructive" },
          style: ({ theme }) => ({
            backgroundColor: theme.palette.error.main,
            color: theme.palette.error.contrastText,
            "&:hover": { backgroundColor: theme.palette.error.dark },
          }),
        },
        {
          // shadcn "link"
          props: { variant: "link" },
          style: ({ theme }) => ({
            backgroundColor: "transparent",
            color: theme.palette.primary.main,
            textDecoration: "underline",
            padding: 0,
            minWidth: "auto",
            "&:hover": { backgroundColor: "transparent", textDecoration: "underline" },
          }),
        },
      ],
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { border: "none" },
      },
    },
  },
});
