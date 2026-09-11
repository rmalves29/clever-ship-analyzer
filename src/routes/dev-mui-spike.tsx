/** Rota de teste isolada da Fase 0 da migração MUI (ver plano em
 *  C:\Users\rmalv\.claude\plans\nifty-greeting-aho.md) — não linkada no Sidebar, sem SEO real.
 *  Cobre os componentes shadcn de maior uso (Button, TextField/Input, Select, Dialog, Tabs,
 *  Switch) mais um Drawer temporário, pra validar SSR + hidratação do Emotion antes de migrar
 *  qualquer tela real. Apagar depois que a Fase 0 for validada e o padrão documentado. */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";

export const Route = createFileRoute("/dev-mui-spike")({
  component: MuiSpikePage,
});

function MuiSpikePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [selectValue, setSelectValue] = useState("a");
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <Box sx={{ p: 4, display: { xs: "block", md: "flex" }, gap: 3 }}>
      <Stack spacing={3} sx={{ maxWidth: 480 }}>
        <Typography variant="h5">MUI spike — Fase 0</Typography>

        <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
          <Button variant="contained">Contained</Button>
          <Button variant="outline">Outline (shadcn alias)</Button>
          <Button variant="ghost">Ghost (shadcn alias)</Button>
          <Button variant="destructive">Destructive (shadcn alias)</Button>
          <Button variant="link">Link (shadcn alias)</Button>
        </Stack>

        <TextField label="Nome" placeholder="Digite algo" fullWidth />

        <FormControl fullWidth>
          <InputLabel id="spike-select-label">Categoria</InputLabel>
          <Select
            labelId="spike-select-label"
            label="Categoria"
            value={selectValue}
            onChange={(e) => setSelectValue(e.target.value)}
          >
            <MenuItem value="a">Opção A</MenuItem>
            <MenuItem value="b">Opção B</MenuItem>
            <MenuItem value="c">Opção C</MenuItem>
          </Select>
        </FormControl>

        <FormControlLabel
          control={<Switch checked={switchOn} onChange={(e) => setSwitchOn(e.target.checked)} />}
          label="Ativo"
        />

        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Aba 1" />
          <Tab label="Aba 2" />
        </Tabs>
        <Typography variant="body2" color="text.secondary">
          Conteúdo da {tab === 0 ? "Aba 1" : "Aba 2"}
        </Typography>

        <Stack direction="row" spacing={1.5}>
          <Button variant="contained" onClick={() => setDialogOpen(true)}>
            Abrir dialog
          </Button>
          <Button variant="outlined" onClick={() => setDrawerOpen(true)}>
            Abrir drawer temporário
          </Button>
        </Stack>
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Dialog de teste</DialogTitle>
        <DialogContent>
          <Typography>Se isso renderizou sem warning de hidratação, o portal está OK.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 260, p: 2 }}>
          <Typography variant="subtitle1">Drawer temporário</Typography>
          <Typography variant="body2" color="text.secondary">
            Simula o menu mobile da Fase 1.
          </Typography>
        </Box>
      </Drawer>
    </Box>
  );
}
