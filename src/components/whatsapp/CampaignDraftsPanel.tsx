import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { deleteCampaignDraft, listCampaignDrafts } from "@/lib/wa-campaign-drafts.functions";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Rascunhos de campanha salvos na tela "Nova campanha": abrir para editar/enviar ou apagar. Some quando não há nenhum. */
export function CampaignDraftsPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runDelete = useServerFn(deleteCampaignDraft);
  const { data: drafts } = useQuery({ queryKey: ["wa-campaign-drafts"], queryFn: () => listCampaignDrafts() });

  if (!drafts || drafts.length === 0) return null;

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Apagar o rascunho "${name}"?`)) return;
    const res = await runDelete({ data: { id } });
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Rascunho apagado.");
    await queryClient.invalidateQueries({ queryKey: ["wa-campaign-drafts"] });
  };

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2, py: 1.25, bgcolor: "action.hover" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Rascunhos</Typography>
        <Chip size="small" label={drafts.length} />
        <Typography variant="caption" color="text.secondary">Salvos para editar e enviar depois. Nada foi enviado.</Typography>
      </Stack>
      {drafts.map((d) => (
        <Stack key={d.id} direction="row" spacing={2} sx={{ alignItems: "center", px: 2, py: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{d.name}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {d.form.templateName ? `Modelo ${d.form.templateName}` : "Sem modelo escolhido"} · atualizado {when(d.updatedAt)}
            </Typography>
          </Box>
          <Button size="small" variant="outlined" startIcon={<Pencil size={14} />} onClick={() => navigate({ to: "/whatsapp/nova", search: { rascunho: d.id } })}>
            Editar e enviar
          </Button>
          <Tooltip title="Apagar rascunho">
            <IconButton size="small" onClick={() => remove(d.id, d.name)}>
              <Trash2 size={16} />
            </IconButton>
          </Tooltip>
        </Stack>
      ))}
    </Box>
  );
}
