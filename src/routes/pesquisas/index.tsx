import { createFileRoute, createLink, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Copy, ExternalLink, Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { listSurveys, saveSurvey, toggleSurvey, deleteSurvey } from "@/lib/surveys.functions";

export const Route = createFileRoute("/pesquisas/")({
  head: () => ({
    meta: [
      { title: "Pesquisas | CRM Insights" },
      { name: "description", content: "Crie pesquisas com landing page própria (link ou NFC) e veja as respostas tabuladas." },
    ],
  }),
  component: PesquisasPage,
});

const LinkTypography = createLink(Typography);
const LinkIconButton = createLink(IconButton);

function PesquisasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runList = useServerFn(listSurveys);
  const runSave = useServerFn(saveSurvey);
  const runToggle = useServerFn(toggleSurvey);
  const runDelete = useServerFn(deleteSurvey);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: surveys, isLoading, refetch } = useQuery({
    queryKey: ["surveys"],
    queryFn: () => runList(),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const base = "nova-pesquisa";
      const suffix = Math.random().toString(36).slice(2, 6);
      return runSave({
        data: {
          slug: `${base}-${suffix}`,
          title: "Nova pesquisa",
          description: "",
          questions: [
            { id: crypto.randomUUID(), type: "texto_curto", label: "Qual seu nome?", required: false },
          ],
          is_active: false,
          thank_you_message: "Obrigado por participar da pesquisa!",
        },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      navigate({ to: "/pesquisas/$surveyId", params: { surveyId: res.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar pesquisa."),
  });

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/pesquisa/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  };

  const handleToggle = async (id: string, next: boolean) => {
    setBusyId(id);
    try {
      await runToggle({ data: { id, is_active: next } });
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Excluir a pesquisa "${title}"? As respostas também serão apagadas.`)) return;
    setBusyId(id);
    try {
      await runDelete({ data: { id } });
      toast.success("Pesquisa excluída.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 4,
              background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              color: "primary.contrastText",
            }}
          >
            <ClipboardList size={20} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Pesquisas</Typography>
            <Typography variant="body2" color="text.secondary">Landing page própria por pesquisa — link ou etiqueta NFC — com respostas tabuladas aqui.</Typography>
          </Box>
        </Stack>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          Nova pesquisa
        </Button>
      </Stack>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">Carregando...</Typography>
      ) : !surveys || surveys.length === 0 ? (
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, p: 6, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 600 }}>Nenhuma pesquisa criada ainda.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Crie a primeira e gere o link (ou etiqueta NFC) para começar a coletar respostas.</Typography>
          <Button variant="contained" startIcon={<Plus size={16} />} sx={{ mt: 2 }} onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            Nova pesquisa
          </Button>
        </Box>
      ) : (
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Pesquisa</TableCell>
                <TableCell>Link</TableCell>
                <TableCell align="center">Perguntas</TableCell>
                <TableCell align="center">Respostas</TableCell>
                <TableCell align="center">Ativa</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {surveys.map((s: any) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <LinkTypography
                      to="/pesquisas/$surveyId"
                      params={{ surveyId: s.id }}
                      sx={{ fontWeight: 600, textDecoration: "none", color: "text.primary", "&:hover": { textDecoration: "underline" } }}
                    >
                      {s.title}
                    </LinkTypography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>/pesquisa/{s.slug}</Typography>
                      <IconButton size="small" onClick={() => copyLink(s.slug)} title="Copiar link"><Copy size={14} /></IconButton>
                      <IconButton size="small" component="a" href={`/pesquisa/${s.slug}`} target="_blank" title="Abrir pesquisa"><ExternalLink size={14} /></IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell align="center">{s.questions?.length ?? 0}</TableCell>
                  <TableCell align="center">
                    <Chip size="small" variant="outlined" label={s.responseCount} />
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={s.is_active} disabled={busyId === s.id} onChange={(e) => handleToggle(s.id, e.target.checked)} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <LinkIconButton size="small" to="/pesquisas/$surveyId" params={{ surveyId: s.id }} title="Ver respostas">
                        <Eye size={16} />
                      </LinkIconButton>
                      <IconButton size="small" color="error" disabled={busyId === s.id} onClick={() => handleDelete(s.id, s.title)} title="Excluir">
                        <Trash2 size={16} />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
