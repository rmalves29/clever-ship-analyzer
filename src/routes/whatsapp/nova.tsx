import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Send, Users, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
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
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/whatsapp">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Nova campanha</h2>
          <p className="text-xs text-muted-foreground">Tudo em uma tela — a prévia muda enquanto você digita.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="surface-card space-y-3 p-5">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Volta às compras 12% PIX" />
            </div>
            <div>
              <Label>Público</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASE_SEGMENTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                  {(segments ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                {loadingPreview ? "Contando…" : `${destinatarios.toLocaleString("pt-BR")} destinatários válidos`}
                {semTelefone > 0 && (
                  <span className="flex items-center gap-1 text-warning">
                    <AlertTriangle className="size-3.5" /> {semTelefone} sem telefone válido
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="surface-card space-y-3 p-5">
            <div>
              <Label>Modelo aprovado</Label>
              <Select value={templateName} onValueChange={setTemplateName}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((t) => (
                    <SelectItem key={`${t.name}-${t.language}`} value={t.name}>
                      {t.name} · {t.language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tokens.map((token, i) => (
              <div key={token + i}>
                <Label>Variável {`{{${token}}}`}</Label>
                <Input
                  value={params[i] ?? ""}
                  onChange={(e) => setParams((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                  placeholder={i === 0 ? "{{NOME_CLIENTE}}" : "Texto ou token"}
                />
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Cupom (opcional)</Label>
                <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} />
              </div>
              <div>
                <Label>Etiqueta (opcional)</Label>
                <Input value={tag} onChange={(e) => setTag(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="surface-card space-y-3 p-5">
            <label className="flex items-center justify-between text-sm">
              Pedir aprovação antes de enviar
              <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
            </label>
            <label className="flex items-center justify-between text-sm">
              Agendar envio
              <Switch checked={scheduleOn} onCheckedChange={setScheduleOn} />
            </label>
            {scheduleOn && (
              <div>
                <Label className="flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Data e hora
                </Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="surface-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Prévia da mensagem</p>
            <div className="mt-3 rounded-2xl bg-[#0b141a] p-4">
              <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-[#005c4b] px-3 py-2 text-sm leading-relaxed text-white whitespace-pre-wrap">
                {renderedBody || "Escolha um modelo para ver a mensagem."}
              </div>
            </div>
            {template && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{template.category}</Badge>
                <Badge variant="outline">{template.language}</Badge>
                {sample?.name && <Badge variant="outline">Exemplo: {sample.name}</Badge>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-4 py-3 md:px-8">
          <p className="text-sm">
            <span className="font-semibold">{destinatarios.toLocaleString("pt-BR")}</span> destinatários
          </p>
          <p className={cn("mr-auto text-xs", blocker ? "text-warning" : "text-muted-foreground")}>
            {blocker ?? (scheduleOn ? "Pronto para agendar." : "Pronto para enviar.")}
          </p>
          <Button className="gap-2" disabled={Boolean(blocker) || busy} onClick={submit}>
            <Send className="size-4" /> {requireApproval ? "Enviar para aprovação" : scheduleOn ? "Agendar" : "Enviar agora"}
          </Button>
        </div>
      </div>
    </div>
  );
}
