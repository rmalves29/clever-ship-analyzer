import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSegmentsList } from "@/lib/crm-segmentation.functions";
import { previewWhatsappPresendAudit } from "@/lib/whatsapp-presend-audit.functions";

export function PresendAuditPanel() {
  const [segmentValue, setSegmentValue] = useState("sem_recompra");
  const [messageType, setMessageType] = useState<"marketing" | "utility">("marketing");
  const runAudit = useServerFn(previewWhatsappPresendAudit);

  const { data: segments } = useQuery({
    queryKey: ["crm-segments-presend-audit"],
    queryFn: () => getSegmentsList(),
  });
  const customSegments = (segments ?? []).map((segment) => ({ id: segment.id, nome: segment.nome }));
  const selectedCustom = customSegments.find((segment) => segment.id === segmentValue);

  const request = useMemo(
    () => ({
      segmentType: selectedCustom ? "custom" : segmentValue,
      ...(selectedCustom ? { segmentId: selectedCustom.id } : {}),
      messageType,
    }),
    [messageType, segmentValue, selectedCustom],
  );

  const { data: audit, isLoading, isError } = useQuery({
    queryKey: ["whatsapp-presend-audit", request.segmentType, request.segmentId ?? null, messageType],
    queryFn: () => runAudit({ data: request }),
  });

  const exclusions = audit
    ? audit.invalidPhone + audit.duplicatePhones + (messageType === "marketing" ? audit.marketingOptOuts : 0)
    : 0;

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldCheck className="size-4" /> Auditoria pré-envio
          </h3>
          <p className="text-sm text-muted-foreground">
            Simula o público final sem criar campanha, sem enfileirar e sem chamar a API da Meta.
          </p>
        </div>
        {audit && (
          <Badge className={audit.eligibleRecipients > 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}>
            {audit.eligibleRecipients > 0 ? "Público pronto" : "Sem destinatários elegíveis"}
          </Badge>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Público</p>
          <Select value={segmentValue} onValueChange={setSegmentValue}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sem_recompra">Sem recompra</SelectItem>
              <SelectItem value="recorrencia">Recorrência</SelectItem>
              <SelectItem value="recompra_30d">Recompra 30d</SelectItem>
              <SelectItem value="recompra_60d">Recompra 60d</SelectItem>
              <SelectItem value="carrinho">Carrinho abandonado</SelectItem>
              {customSegments.map((segment) => (
                <SelectItem key={segment.id} value={segment.id}>{segment.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tipo da mensagem</p>
          <Select value={messageType} onValueChange={(value) => setMessageType(value as "marketing" | "utility")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="marketing">Marketing</SelectItem>
              <SelectItem value="utility">Utilidade</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Auditando público...</p>}
      {isError && <p className="mt-4 text-sm text-critical">Não foi possível concluir a auditoria.</p>}

      {audit && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="No segmento" value={audit.clientes} />
            <Metric label="Com telefone" value={audit.comTelefone} />
            <Metric label="Telefone inválido/ausente" value={audit.invalidPhone} warning={audit.invalidPhone > 0} />
            <Metric label="Telefones duplicados" value={audit.duplicatePhones} warning={audit.duplicatePhones > 0} />
            <Metric
              label={messageType === "marketing" ? "Opt-outs marketing" : "Opt-outs não bloqueiam utility"}
              value={audit.marketingOptOuts}
              warning={messageType === "marketing" && audit.marketingOptOuts > 0}
            />
            <Metric label="Elegíveis finais" value={audit.eligibleRecipients} success />
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            {exclusions > 0 ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
            <span>
              {messageType === "marketing"
                ? `${exclusions} registro(s) serão excluídos antes/do processamento por telefone inválido, duplicidade ou opt-out de marketing.`
                : `${exclusions} registro(s) serão excluídos por telefone inválido ou duplicidade. Opt-out de marketing não bloqueia mensagens de utilidade.`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, warning, success }: { label: string; value: number; warning?: boolean; success?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        {success ? <Users className="size-4 text-success" /> : warning ? <AlertTriangle className="size-4 text-warning" /> : null}
        <p className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</p>
      </div>
    </div>
  );
}
