import { useEffect, useMemo, useState } from "react";
import { createFileRoute, createLink, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Send, Users, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { previewWhatsappAudience } from "@/lib/whatsapp-audience-preview.functions";
import { createAndSendCampaign, listMetaTemplates, getSegmentsList } from "@/lib/whatsapp-meta.functions";
import { extractTemplateBodyTokens } from "@/lib/whatsapp-template-body-tokens";
import { normalizeWhatsappAudienceSelection } from "@/lib/whatsapp-audience-selection";

export const Route = createFileRoute("/whatsapp/nova")({
  head: () => ({
    meta: [
      { title: "Nova campanha de WhatsApp | CRM Insights" },
      { name: "description", content: "Monte a campanha e veja a mensagem final enquanto digita, com o público contado ao vivo." },
      { property: "og:title", content: "Nova campanha de WhatsApp | CRM Insights" },
      { property: "og:description", content: "Criação de campanha em tela única, com prévia da mensagem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NovaCampanha,
});

const LinkIconButton = createLink(IconButton);

type TemplateOption = {
  name: string;
  language: string;
  status: string;
  category: string;
  components: { type: string; text?: string; format?: string }[];
};

const BASE_SEGMENTS = [
  { value: "sem_recompra", label: "Sem recompra" },
  { value: "compraram_hoje", label: "Compraram hoje" },
  { value: "checkout_abandonado", label: "Checkout abandonado" },
  { value: "primeira_compra", label: "Primeira compra" },
];

function bodyText(t: TemplateOption | undefined): string {
  return t?.components.find((c) => c.type === "BODY")?.text ?? "";
}

function NovaCampanha() {
  const navigate = useNavigate();
  const runCreate = useServerFn(createAndSendCampaign);
  const runPreview = useServerFn(previewWhatsappAudience);

  const [nome, setNome] = useState("");
  const [audience, setAudience] = useState("sem_recompra");
  const [templateName, setTemplateName] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [coupon, setCoupon] = useState("");
  const [tag, setTag] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: segments } = useQuery({ queryKey: ["crm-segments"], queryFn: () => getSegmentsList() });
  const { data: templatesResult } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listMetaTemplates() });

  const approved: TemplateOption[] = ((templatesResult?.success ? templatesResult.templates : []) as TemplateOption[]).filter(
    (t) => t.status === "APPROVED",
  );
  const template = approved.find((t) => t.name === templateName);
  const tokens = useMemo(() => extractTemplateBodyTokens(bodyText(template)), [template]);

  useEffect(() => {
    setParams((prev) => tokens.map((_, i) => prev[i] ?? ""));
  }, [tokens.length]);

  const selection = useMemo(() => {
    try {
      const isCustom = (segments ?? []).some((s: any) => s.id === audience);
      return normalizeWhatsappAudienceSelection(isCustom ? "custom" : audience, isCustom ? audience : undefined);
    } catch {
      return null;
    }
  }, [audience, segments]);

  const { data: preview, isFetching: loadingPreview } = useQuery({
    queryKey: ["wa-audience", selection?.segmentType, selection?.segmentId],
    queryFn: () => runPreview({ data: { segmentType: selection!.segmentType, segmentId: selection!.segmentId } }),
    enabled: Boolean(selection),
  });

  const sample = (preview?.recipientSamples ?? [])[0] as { name?: string } | undefined;
  const destinatarios = preview?.destinatarios ?? 0;
  const semTelefone = Math.max(0, (preview?.clientes ?? 0) - (preview?.comTelefone ?? 0));

  const renderedBody = useMemo(() => {
    let text = bodyText(template);
    tokens.forEach((token, i) => {
      const value = params[i]?.trim() || (i === 0 ? (sample?.name ?? "Cliente") : `«${token}»`);
      text = text.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "g"), value);
    });
    return text;
  }, [template, tokens, params, sample]);

  const blocker = !nome.trim()
    ? "Dê um nome à campanha."
    : !template
      ? "Escolha um modelo aprovado."
      : destinatarios === 0
        ? "Esse público está com 0 destinatários válidos."
        : scheduleOn && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())
          ? "Escolha uma data e hora futura."
          : null;

  const submit = async () => {
    if (blocker || !selection || !template) return;
    setBusy(true);
    try {
      const res: any = await runCreate({
        data: {
          nome: nome.trim(),
          segmentType: selection.segmentType,
          segmentId: selection.segmentId,
          messageType: String(template.category).toUpperCase() === "UTILITY" ? "utility" : "marketing",
          templateName: template.name,
          templateLanguage: template.language,
          couponCode: coupon.trim() || undefined,
          bodyParams: params.map((p) => p.trim()),
          bodyParamTokens: tokens,
          requireApproval,
          sendAt: scheduleOn ? new Date(scheduledAt).toISOString() : undefined,
          campaignTag: tag.trim() || undefined,
        },
      });
      if (res?.success === false) {
        toast.error(res.error ?? "Não foi possível criar a campanha.");
        return;
      }
      toast.success(requireApproval ? "Campanha criada e aguardando aprovação." : "Campanha criada e enfileirada.");
      if (res?.campaignId) navigate({ to: "/whatsapp/$campaignId", params: { campaignId: res.campaignId } });
      else navigate({ to: "/whatsapp" });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar a campanha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2.5} sx={{ pb: 12 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <LinkIconButton to="/whatsapp">
          <ChevronLeft size={20} />
        </LinkIconButton>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Nova campanha</Typography>
          <Typography variant="caption" color="text.secondary">Tudo em uma tela — a prévia muda enquanto você digita.</Typography>
        </Box>
      </Stack>

      <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", lg: "1.2fr 1fr" } }}>
        <Stack spacing={2}>
          <Stack spacing={2} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
            <TextField
              label="Nome da campanha"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Volta às compras 12% PIX"
              fullWidth
            />
            <Box>
              <TextField select label="Público" value={audience} onChange={(e) => setAudience(e.target.value)} fullWidth>
                {BASE_SEGMENTS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
                {(segments ?? []).map((s: any) => (
                  <MenuItem key={s.id} value={s.id}>{s.nome}</MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mt: 1 }}>
                <Users size={14} />
                <Typography variant="caption" color="text.secondary">
                  {loadingPreview ? "Contando…" : `${destinatarios.toLocaleString("pt-BR")} destinatários válidos`}
                </Typography>
                {semTelefone > 0 && (
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "warning.main" }}>
                    <AlertTriangle size={14} />
                    <Typography variant="caption" color="warning.main">{semTelefone} sem telefone válido</Typography>
                  </Stack>
                )}
              </Stack>
            </Box>
          </Stack>

          <Stack spacing={2} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
            <TextField select label="Modelo aprovado" value={templateName} onChange={(e) => setTemplateName(e.target.value)} fullWidth
              slotProps={{ select: { displayEmpty: true } }}
            >
              {approved.map((t) => (
                <MenuItem key={`${t.name}-${t.language}`} value={t.name}>{t.name} · {t.language}</MenuItem>
              ))}
            </TextField>
            {tokens.map((token, i) => (
              <TextField
                key={token + i}
                label={`Variável {{${token}}}`}
                value={params[i] ?? ""}
                onChange={(e) => setParams((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                placeholder={i === 0 ? "{{NOME_CLIENTE}}" : "Texto ou token"}
                fullWidth
              />
            ))}
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <TextField label="Cupom (opcional)" value={coupon} onChange={(e) => setCoupon(e.target.value)} fullWidth />
              <TextField label="Etiqueta (opcional)" value={tag} onChange={(e) => setTag(e.target.value)} fullWidth />
            </Box>
          </Stack>

          <Stack spacing={1.5} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
            <FormControlLabel
              sx={{ justifyContent: "space-between", ml: 0 }}
              labelPlacement="start"
              control={<Switch checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />}
              label="Pedir aprovação antes de enviar"
            />
            <FormControlLabel
              sx={{ justifyContent: "space-between", ml: 0 }}
              labelPlacement="start"
              control={<Switch checked={scheduleOn} onChange={(e) => setScheduleOn(e.target.checked)} />}
              label="Agendar envio"
            />
            {scheduleOn && (
              <TextField
                type="datetime-local"
                label={
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <Clock size={14} /> <span>Data e hora</span>
                  </Stack>
                }
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            )}
          </Stack>
        </Stack>

        <Box sx={{ position: { lg: "sticky" }, top: { lg: 96 }, alignSelf: { lg: "flex-start" } }}>
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.5 }}>
            <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>Prévia da mensagem</Typography>
            <Box sx={{ mt: 1.5, borderRadius: 4, bgcolor: "#0b141a", p: 2 }}>
              <Box sx={{ maxWidth: "85%", borderRadius: 3, borderTopLeftRadius: 4, bgcolor: "#005c4b", px: 1.5, py: 1, fontSize: 14, lineHeight: 1.6, color: "#fff", whiteSpace: "pre-wrap" }}>
                {renderedBody || "Escolha um modelo para ver a mensagem."}
              </Box>
            </Box>
            {template && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 1.5 }}>
                <Chip size="small" variant="outlined" label={template.category} />
                <Chip size="small" variant="outlined" label={template.language} />
                {sample?.name && <Chip size="small" variant="outlined" label={`Exemplo: ${sample.name}`} />}
              </Stack>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 20, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.default", backdropFilter: "blur(8px)" }}>
        <Stack direction="row" spacing={2} sx={{ maxWidth: 1400, mx: "auto", alignItems: "center", flexWrap: "wrap", px: { xs: 2, md: 4 }, py: 1.5 }}>
          <Typography variant="body2">
            <Box component="span" sx={{ fontWeight: 700 }}>{destinatarios.toLocaleString("pt-BR")}</Box> destinatários
          </Typography>
          <Typography variant="caption" sx={{ mr: "auto", color: blocker ? "warning.main" : "text.secondary" }}>
            {blocker ?? (scheduleOn ? "Pronto para agendar." : "Pronto para enviar.")}
          </Typography>
          <Button variant="contained" startIcon={<Send size={16} />} disabled={Boolean(blocker) || busy} onClick={submit}>
            {requireApproval ? "Enviar para aprovação" : scheduleOn ? "Agendar" : "Enviar agora"}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
