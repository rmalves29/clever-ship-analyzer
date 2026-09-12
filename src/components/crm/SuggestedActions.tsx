import { useState } from "react";
import { Plus, Target, Workflow, Zap } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { DashboardData } from "@/lib/crm-mock";
import { brl } from "@/lib/crm-mock";
// WhatsappSendDialog e AutomationDialog (shadcn) mantidos de propósito: compartilhados
// com o módulo de WhatsApp/CRM, tratados como sua própria migração dedicada.
import { WhatsappSendDialog, type SendDialogSeed } from "@/components/whatsapp/WhatsappSendDialog";
import { AutomationDialog, type AutomationSeed } from "./AutomationDialog";

export function SuggestedActions({ reguas, acoes }: { reguas: DashboardData["reguas"]; acoes: DashboardData["acoes"] }) {
  const [sendSeed, setSendSeed] = useState<SendDialogSeed | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [autoSeed, setAutoSeed] = useState<AutomationSeed | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);

  const openSend = (a: DashboardData["acoes"][number]) => {
    setSendSeed({ nome: a.cluster, segmentType: a.segmentType, oferta: a.oferta });
    setSendOpen(true);
  };

  const openInstall = (r: DashboardData["reguas"][number]) => {
    setAutoSeed({
      nome: r.titulo,
      descricao: r.descricao,
      requerAprovacao: true,
      ativo: true,
    });
    setAutoOpen(true);
  };

  const openInstallFromAction = (a: DashboardData["acoes"][number]) => {
    setAutoSeed({
      nome: a.cluster,
      descricao: a.criterio ? `${a.criterio} — oferta sugerida: ${a.oferta}` : a.oferta,
      segmentType: a.segmentType,
      requerAprovacao: true,
      ativo: true,
    });
    setAutoOpen(true);
  };

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", borderBottom: "1px solid", borderColor: "divider", p: 2.5 }}>
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
          <Zap size={20} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Ações sugeridas</Typography>
          <Typography variant="body2" color="text.secondary">Baseado nos dados acima — réguas e ações pontuais prontas.</Typography>
        </Box>
      </Stack>

      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Workflow size={16} color="var(--mui-palette-primary-main, #7367F0)" />
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Réguas sugeridas</Typography>
          <Chip size="small" label={reguas.length} sx={{ height: 20 }} />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Receita projetada considerando janela de <Box component="strong">30 dias após implantação</Box>.
        </Typography>

        <Box sx={{ mt: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "repeat(3, 1fr)" } }}>
          {reguas.map((r) => (
            <Box key={r.titulo} component="article" sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <Typography sx={{ fontWeight: 700 }}>{r.titulo}</Typography>
                <Chip size="small" variant="outlined" label={r.tag} sx={{ fontSize: 10, height: 20, textTransform: "uppercase", fontWeight: 700 }} />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{r.descricao}</Typography>
              <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>% base</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.base}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>conv.</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.conv}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>receita 30d</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: "primary.main" }}>{brl(r.receita)}</Typography>
                </Box>
              </Box>
              <Button variant="outlined" fullWidth sx={{ mt: 2 }} onClick={() => openInstall(r)}>
                Instalar régua
              </Button>
            </Box>
          ))}
        </Box>

        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 4 }}>
          <Target size={16} color="var(--mui-palette-primary-main, #7367F0)" />
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Ações pontuais sugeridas</Typography>
          <Chip size="small" label={acoes.length} sx={{ height: 20 }} />
        </Stack>

        <TableContainer sx={{ mt: 2, border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
          <Table sx={{ minWidth: 900 }} size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cluster / critério</TableCell>
                <TableCell>% base</TableCell>
                <TableCell>Oferta</TableCell>
                <TableCell>Janela</TableCell>
                <TableCell>Conv.</TableCell>
                <TableCell>Receita proj.</TableCell>
                <TableCell align="right">Aplicar</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {acoes.map((a) => (
                <TableRow key={a.cluster}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.cluster}</Typography>
                    <Typography variant="caption" color="text.secondary">{a.criterio}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "primary.main" }}>{a.base}</TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{a.oferta}</TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{a.janela}</TableCell>
                  <TableCell>{a.conv}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{brl(a.receita)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                      <Button size="small" variant="outlined" startIcon={<Workflow size={14} />} onClick={() => openInstallFromAction(a)}>
                        Automatizar
                      </Button>
                      <Button size="small" variant="contained" startIcon={<Plus size={14} />} onClick={() => openSend(a)}>
                        Aplicar ação
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <WhatsappSendDialog seed={sendSeed} open={sendOpen} onOpenChange={setSendOpen} />
      <AutomationDialog seed={autoSeed} open={autoOpen} onOpenChange={setAutoOpen} />
    </Box>
  );
}
