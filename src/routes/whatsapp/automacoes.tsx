import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, Copy, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
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
import {
  AutomationDialog,
  SEGMENT_LABEL,
  type AutomationSeed,
} from "@/components/crm/AutomationDialog";
import { ConversationalFlowsTab } from "@/components/whatsapp/ConversationalFlowsTab";
import { AUTOMATION_EVENT_BY_ID, parseEventTrigger } from "@/lib/automation-events";
import { AutomationPerformancePanel, type PainelAcoes } from "@/components/whatsapp/AutomationPerformancePanel";
import {
  deleteAutomation,
  installLifecycleAutomations,
  listAutomations,
  runAutomationNow,
  setAutomationInativa,
  toggleAutomation,
} from "@/lib/whatsapp-meta.functions";

type Situacao = "ativa" | "pausada" | "inativa";
type FiltroSituacao = "todas" | Situacao;

const SITUACAO_LABEL: Record<Situacao, string> = { ativa: "Ativa", pausada: "Pausada", inativa: "Inativa" };
const SITUACAO_COR: Record<Situacao, "success" | "warning" | "default"> = { ativa: "success", pausada: "warning", inativa: "default" };

/** Ativa = roda; Pausada = desligada mas deve voltar; Inativa = fora de uso (candidata a apagar). */
function situacaoDe(a: { ativo?: boolean; inativa?: boolean }): Situacao {
  if (a.ativo) return "ativa";
  return a.inativa ? "inativa" : "pausada";
}

export const Route = createFileRoute("/whatsapp/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações de WhatsApp | CRM Insights" },
      {
        name: "description",
        content: "Réguas automáticas e fluxos conversacionais do WhatsApp oficial da loja.",
      },
      { property: "og:title", content: "Automações de WhatsApp | CRM Insights" },
      {
        property: "og:description",
        content: "Configure réguas e respostas automáticas no WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomacoesPage,
});

function AutomacoesPage() {
  const runToggle = useServerFn(toggleAutomation);
  const runInativa = useServerFn(setAutomationInativa);
  const [filtro, setFiltro] = useState<FiltroSituacao>("ativa");
  const runDelete = useServerFn(deleteAutomation);
  const runNow = useServerFn(runAutomationNow);
  const runLifecycleInstall = useServerFn(installLifecycleAutomations);
  const [seed, setSeed] = useState<AutomationSeed | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: automations, refetch } = useQuery({
    queryKey: ["whatsapp-automations"],
    queryFn: () => listAutomations(),
  });

  const lista = (automations ?? []) as any[];
  const contagem: Record<FiltroSituacao, number> = {
    todas: lista.length,
    ativa: lista.filter((a) => situacaoDe(a) === "ativa").length,
    pausada: lista.filter((a) => situacaoDe(a) === "pausada").length,
    inativa: lista.filter((a) => situacaoDe(a) === "inativa").length,
  };
  const visiveis = filtro === "todas" ? lista : lista.filter((a) => situacaoDe(a) === filtro);
  const situacaoPorId: Record<string, Situacao> = Object.fromEntries(lista.map((a) => [a.id as string, situacaoDe(a)]));

  const wrap = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      const result = (await fn()) as { success?: boolean; error?: string } | undefined;
      if (result?.success === false)
        throw new Error(result.error ?? "A operação não pôde ser concluída.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Não deu certo.");
    } finally {
      setBusyId(null);
    }
  };

  const abrirEdicao = (a: any) => {
    setSeed({
      id: a.id,
      nome: a.nome,
      descricao: a.descricao ?? undefined,
      segmentType: a.segmentType ?? undefined,
      segmentId: a.segmentId ?? undefined,
      steps: a.steps ?? undefined,
      requerAprovacao: a.requerAprovacao ?? true,
      ativo: Boolean(a.ativo),
      automationKind: a.automationKind,
      apenasContatosNovos: Boolean(a.apenasContatosNovos),
      eventTrigger: parseEventTrigger(a.triggerConfig),
      revalidateSegmentBeforeSend: Boolean(a.triggerConfig?.revalidateSegmentBeforeSend),
      recoveryLandingPageId:
        typeof a.triggerConfig?.landingPageId === "string" ? a.triggerConfig.landingPageId : undefined,
    });
    setOpen(true);
  };

  const acoesDoPainel: PainelAcoes = {
    ocupadoId: busyId,
    onEditar: (id) => {
      const a = lista.find((item) => item.id === id);
      if (a) abrirEdicao(a);
    },
    onPausarOuAtivar: (id, ativar) => {
      const a = lista.find((item) => item.id === id);
      const nome = a?.nome ?? "esta régua";
      if (!ativar && !confirm(`Pausar a régua "${nome}"? Ela deixa de enviar até você ativar de novo.`)) return;
      if (ativar && !confirm(`Ativar a régua "${nome}"? Ela volta a enviar mensagens.`)) return;
      wrap(id, () => runToggle({ data: { id, ativo: ativar } }));
    },
    onInativarOuReativar: (id, inativar) => {
      const a = lista.find((item) => item.id === id);
      const nome = a?.nome ?? "esta régua";
      if (inativar && !confirm(`Inativar a régua "${nome}"? Ela deixa de rodar e vai para a lista de inativas (nada é apagado).`)) return;
      wrap(id, () => runInativa({ data: { id, inativa: inativar } }));
    },
    onApagar: (id) => {
      const a = lista.find((item) => item.id === id);
      if (confirm(`Apagar a régua "${a?.nome ?? "esta régua"}"? Isso não pode ser desfeito.`))
        wrap(id, () => runDelete({ data: { id } }));
    },
  };

  const installLifecycle = async () => {
    setBusyId("lifecycle-install");
    try {
      const result = await runLifecycleInstall();
      await refetch();
      if (result.meta.failures.length > 0) {
        toast.warning(
          `As réguas foram instaladas e continuam pausadas. ${result.meta.failures.length} modelo(s) não puderam ser enviado(s) à Meta: ${result.meta.failures[0]?.error ?? "verifique a conexão"}`,
        );
      } else {
        toast.success(
          `${result.automationsCreated + result.automationsUpdated} réguas configuradas e ${result.meta.submitted} modelo(s) enviado(s) à Meta. Aguarde a aprovação antes de ativar.`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível instalar as automações.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack spacing={5}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
            Mostrar réguas:
          </Typography>
          {(
            [
              ["ativa", "Ativas"],
              ["pausada", "Pausadas"],
              ["inativa", "Inativas"],
              ["todas", "Todas"],
            ] as const
          ).map(([key, label]) => (
            <Chip
              key={key}
              label={`${label} (${contagem[key]})`}
              color={filtro === key ? "primary" : "default"}
              variant={filtro === key ? "filled" : "outlined"}
              onClick={() => setFiltro(key)}
            />
          ))}
        </Stack>
        <AutomationPerformancePanel filtro={filtro} situacaoPorId={situacaoPorId} acoes={acoesDoPainel} />
      </Stack>

      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Réguas automáticas
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Disparos por comportamento do cliente, sem ninguém apertar botão.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={() => {
              setSeed({
                nome: "Nova régua",
                segmentType: "sem_recompra",
                oferta: "",
              } as AutomationSeed);
              setOpen(true);
            }}
          >
            Nova régua
          </Button>
        </Stack>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "action.hover",
            borderRadius: 3,
            p: 2,
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{
              mb: 2,
              p: 2,
              alignItems: { md: "center" },
              borderRadius: 2,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "primary.main",
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Matriz RFM completa + cashback
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Instala 10 réguas RFM, 1 régua de cashback e envia 13 modelos de marketing para
                aprovação na Meta. Tudo começa pausado.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<Sparkles size={16} />}
              disabled={busyId === "lifecycle-install"}
              onClick={installLifecycle}
            >
              {busyId === "lifecycle-install" ? "Instalando..." : "Instalar automações"}
            </Button>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Sparkles size={14} color="var(--mui-palette-primary-main, #7367F0)" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Começar de um modelo pronto
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            A régua abre com público e etapas já montados — escolha os modelos de mensagem e salve.
          </Typography>
          <Box
            sx={{
              mt: 1.5,
              display: "grid",
              gap: 1,
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", xl: "repeat(4, 1fr)" },
            }}
          >
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
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {recipe.title}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.25 }}
                >
                  {recipe.description}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Stack spacing={1}>
          {visiveis.map((a: any) => (
            <Stack
              key={a.id}
              direction="row"
              spacing={2}
              sx={{
                flexWrap: "wrap",
                alignItems: "center",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                p: 2,
              }}
            >
              <Box sx={{ minWidth: 200, flex: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{a.nome}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {a.automationKind === "rfm"
                    ? `Matriz RFM · ${String(a.triggerConfig?.rfmSegment ?? "")}`
                    : a.automationKind === "cashback"
                      ? "Cashback por pedido"
                      : parseEventTrigger(a.triggerConfig)
                        ? `Evento · ${AUTOMATION_EVENT_BY_ID.get(parseEventTrigger(a.triggerConfig)!.event)?.label ?? ""}`
                        : (SEGMENT_LABEL[a.segmentType as keyof typeof SEGMENT_LABEL] ??
                          a.segmentType)}{" "}
                  · {a.steps?.length ?? 0} etapa(s)
                </Typography>
              </Box>
              {a.automationKind !== "segment" && (
                <Chip
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={a.automationKind === "rfm" ? "RFM" : "Cashback"}
                />
              )}
              <Chip size="small" color={SITUACAO_COR[situacaoDe(a)]} variant="outlined" label={SITUACAO_LABEL[situacaoDe(a)]} />
              <Switch
                checked={Boolean(a.ativo)}
                disabled={busyId === a.id || situacaoDe(a) === "inativa"}
                onChange={(e) =>
                  wrap(a.id, () => runToggle({ data: { id: a.id, ativo: e.target.checked } }))
                }
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={<Play size={14} />}
                disabled={busyId === a.id || situacaoDe(a) === "inativa" || (a.automationKind !== "segment" && !a.ativo)}
                onClick={() => wrap(a.id, () => runNow({ data: { id: a.id } }))}
              >
                Rodar agora
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Pencil size={14} />}
                onClick={() => abrirEdicao(a)}
              >
                Editar
              </Button>
              {a.automationKind === "segment" && (
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
                      apenasContatosNovos: Boolean(a.apenasContatosNovos),
                      eventTrigger: parseEventTrigger(a.triggerConfig),
                      revalidateSegmentBeforeSend: Boolean(a.triggerConfig?.revalidateSegmentBeforeSend),
                      recoveryLandingPageId:
                        typeof a.triggerConfig?.landingPageId === "string"
                          ? a.triggerConfig.landingPageId
                          : undefined,
                    });
                    setOpen(true);
                  }}
                >
                  Duplicar
                </Button>
              )}
              {situacaoDe(a) === "inativa" ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ArchiveRestore size={14} />}
                  disabled={busyId === a.id}
                  onClick={() => wrap(a.id, () => runInativa({ data: { id: a.id, inativa: false } }))}
                >
                  Reativar
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Archive size={14} />}
                  disabled={busyId === a.id}
                  onClick={() => {
                    if (confirm(`Inativar a régua "${a.nome}"? Ela deixa de rodar e vai para a lista de inativas (nada é apagado).`))
                      wrap(a.id, () => runInativa({ data: { id: a.id, inativa: true } }));
                  }}
                >
                  Inativar
                </Button>
              )}
              <IconButton
                disabled={busyId === a.id}
                onClick={() => {
                  if (confirm(`Apagar a régua "${a.nome}"?`))
                    wrap(a.id, () => runDelete({ data: { id: a.id } }));
                }}
              >
                <Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" />
              </IconButton>
            </Stack>
          ))}
          {lista.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Nenhuma régua criada ainda.
            </Typography>
          )}
          {lista.length > 0 && visiveis.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Nenhuma régua nesta situação.
            </Typography>
          )}
        </Stack>
      </Stack>

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Fluxos conversacionais
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Respostas automáticas quando o cliente escreve para a loja.
          </Typography>
        </Box>
        <ConversationalFlowsTab />
      </Stack>

      <AutomationDialog seed={seed} open={open} onOpenChange={setOpen} onSaved={() => refetch()} />
    </Stack>
  );
}
