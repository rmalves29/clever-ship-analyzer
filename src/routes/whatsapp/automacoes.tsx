import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { AUTOMATION_RECIPES } from "@/components/whatsapp/flowRecipes";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
// AutomationDialog e ConversationalFlowsTab (com o ConversationalFlowDialog interno) ainda são
// shadcn de propósito: são editores grandes (1370+ linhas, com step builder e integração
// @xyflow/react) compartilhados entre CRM e WhatsApp — tratados como sua própria migração
// dedicada depois desta tela, e não migrados às pressas aqui dentro.
import { AutomationDialog, SEGMENT_LABEL, type AutomationSeed } from "@/components/crm/AutomationDialog";
import { ConversationalFlowsTab } from "@/components/whatsapp/ConversationalFlowsTab";
import { deleteAutomation, listAutomations, runAutomationNow, toggleAutomation } from "@/lib/whatsapp-meta.functions";

export const Route = createFileRoute("/whatsapp/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações de WhatsApp | CRM Insights" },
      { name: "description", content: "Réguas automáticas e fluxos conversacionais do WhatsApp oficial da loja." },
      { property: "og:title", content: "Automações de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Configure réguas e respostas automáticas no WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomacoesPage,
});

function AutomacoesPage() {
  const runToggle = useServerFn(toggleAutomation);
  const runDelete = useServerFn(deleteAutomation);
  const runNow = useServerFn(runAutomationNow);
  const [seed, setSeed] = useState<AutomationSeed | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: automations, refetch } = useQuery({ queryKey: ["whatsapp-automations"], queryFn: () => listAutomations() });

  const wrap = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Não deu certo.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack spacing={5}>
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Réguas automáticas</Typography>
            <Typography variant="caption" color="text.secondary">Disparos por comportamento do cliente, sem ninguém apertar botão.</Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={() => {
              setSeed({ nome: "Nova régua", segmentType: "sem_recompra", oferta: "" } as AutomationSeed);
              setOpen(true);
            }}
          >
            Nova régua
          </Button>
        </Stack>

        <Box sx={{ border: "1px solid", borderColor: "divider", bgcolor: "action.hover", borderRadius: 3, p: 2 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Sparkles size={14} color="var(--mui-palette-primary-main, #7367F0)" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Começar de um modelo pronto</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            A régua abre com público e etapas já montados — escolha os modelos de mensagem e salve.
          </Typography>
          <Box sx={{ mt: 1.5, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", xl: "repeat(4, 1fr)" } }}>
            {AUTOMATION_RECIPES.map((recipe) => (
              <Box
                key={recipe.key}
                component="button"
                type="button"
                onClick={() => {
                  setSeed(recipe.build());
                  setOpen(true);
                }}
                sx={{
                  textAlign: "left",
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  borderRadius: 2,
                  p: 1.5,
                  cursor: "pointer",
                  "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{recipe.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>{recipe.description}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Stack spacing={1}>
          {(automations ?? []).map((a: any) => (
            <Stack key={a.id} direction="row" spacing={2} sx={{ flexWrap: "wrap", alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
              <Box sx={{ minWidth: 200, flex: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{a.nome}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {SEGMENT_LABEL[a.segmentType as keyof typeof SEGMENT_LABEL] ?? a.segmentType} · {a.steps?.length ?? 0} etapa(s)
                </Typography>
              </Box>
              <Chip size="small" variant="outlined" label={a.ativo ? "Ativa" : "Pausada"} />
              <Switch
                checked={Boolean(a.ativo)}
                disabled={busyId === a.id}
                onChange={(e) => wrap(a.id, () => runToggle({ data: { id: a.id, ativo: e.target.checked } }))}
              />
              <Button size="small" variant="outlined" startIcon={<Play size={14} />} disabled={busyId === a.id} onClick={() => wrap(a.id, () => runNow({ data: { id: a.id } }))}>
                Rodar agora
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Pencil size={14} />}
                onClick={() => {
                  setSeed({
                    id: a.id,
                    nome: a.nome,
                    descricao: a.descricao ?? undefined,
                    segmentType: a.segmentType ?? undefined,
                    segmentId: a.segmentId ?? undefined,
                    steps: a.steps ?? undefined,
                    requerAprovacao: a.requerAprovacao ?? true,
                    ativo: Boolean(a.ativo),
                  });
                  setOpen(true);
                }}
              >
                Editar
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Copy size={14} />}
                onClick={() => {
                  setSeed({
                    nome: `${a.nome} (cópia)`,
                    descricao: a.descricao ?? undefined,
                    segmentType: a.segmentType ?? undefined,
                    segmentId: a.segmentId ?? undefined,
                    steps: a.steps ?? undefined,
                    requerAprovacao: a.requerAprovacao ?? true,
                    ativo: false,
                  });
                  setOpen(true);
                }}
              >
                Duplicar
              </Button>
              <IconButton
                disabled={busyId === a.id}
                onClick={() => {
                  if (confirm(`Apagar a régua "${a.nome}"?`)) wrap(a.id, () => runDelete({ data: { id: a.id } }));
                }}
              >
                <Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" />
              </IconButton>
            </Stack>
          ))}
          {(automations ?? []).length === 0 && <Typography variant="body2" color="text.secondary">Nenhuma régua criada ainda.</Typography>}
        </Stack>
      </Stack>

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Fluxos conversacionais</Typography>
          <Typography variant="caption" color="text.secondary">Respostas automáticas quando o cliente escreve para a loja.</Typography>
        </Box>
        <ConversationalFlowsTab />
      </Stack>

      <AutomationDialog seed={seed} open={open} onOpenChange={setOpen} onSaved={() => refetch()} />
    </Stack>
  );
}
