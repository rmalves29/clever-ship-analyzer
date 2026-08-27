import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil } from "lucide-react";
import { listPopupCampaigns, savePopupCampaign, togglePopupCampaign, deletePopupCampaign } from "@/lib/popup.functions";
import { listMetaTemplates } from "@/lib/whatsapp-meta.functions";
import { extractTemplateBodyTokens } from "@/lib/whatsapp-template-body-tokens";

type FormState = {
  id?: string;
  name: string;
  is_active: boolean;
  collect_name: boolean;
  headline: string;
  body_text: string;
  button_text: string;
  image_url: string;
  trigger_time_seconds: string;
  trigger_exit_intent: boolean;
  reshow_mode: "once_ever" | "after_days";
  reshow_after_days: string;
  coupon_mode: "none" | "fixed" | "unique";
  fixed_coupon_code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: string;
  discount_expires_days: string;
  template_name: string;
  template_language: string;
  template_var_mapping: Record<string, string>;
};

const EMPTY_FORM: FormState = {
  name: "",
  is_active: false,
  collect_name: true,
  headline: "Ganhe um desconto especial!",
  body_text: "Deixe seu WhatsApp e receba um cupom exclusivo.",
  button_text: "Quero meu desconto",
  image_url: "",
  trigger_time_seconds: "8",
  trigger_exit_intent: false,
  reshow_mode: "after_days",
  reshow_after_days: "7",
  coupon_mode: "none",
  fixed_coupon_code: "",
  discount_type: "percentage",
  discount_value: "10",
  discount_expires_days: "7",
  template_name: "",
  template_language: "",
  template_var_mapping: {},
};

function rowToForm(row: any): FormState {
  return {
    id: row.id,
    name: row.name,
    is_active: row.is_active,
    collect_name: row.collect_name,
    headline: row.headline,
    body_text: row.body_text,
    button_text: row.button_text,
    image_url: row.image_url ?? "",
    trigger_time_seconds: row.trigger_time_seconds != null ? String(row.trigger_time_seconds) : "",
    trigger_exit_intent: row.trigger_exit_intent,
    reshow_mode: row.reshow_mode,
    reshow_after_days: row.reshow_after_days != null ? String(row.reshow_after_days) : "",
    coupon_mode: row.coupon_mode,
    fixed_coupon_code: row.fixed_coupon_code ?? "",
    discount_type: row.discount_type ?? "percentage",
    discount_value: row.discount_value != null ? String(row.discount_value) : "",
    discount_expires_days: row.discount_expires_days != null ? String(row.discount_expires_days) : "",
    template_name: row.template_name ?? "",
    template_language: row.template_language ?? "",
    template_var_mapping: row.template_var_mapping ?? {},
  };
}

export function PopupCampaignsManager() {
  const qc = useQueryClient();
  const list = useServerFn(listPopupCampaigns);
  const save = useServerFn(savePopupCampaign);
  const toggle = useServerFn(togglePopupCampaign);
  const del = useServerFn(deletePopupCampaign);
  const listTemplates = useServerFn(listMetaTemplates);

  const { data: campaigns } = useQuery({ queryKey: ["popup-campaigns"], queryFn: () => list() });
  const { data: templatesResult } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listTemplates() });
  const approved = (templatesResult?.success ? templatesResult.templates : []).filter(
    (t: { status: string }) => t.status === "APPROVED",
  );

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const template = approved.find((t: any) => t.name === form.template_name && t.language === form.template_language);
  const bodyComponent = template?.components?.find((c: any) => c.type === "BODY");
  const tokens = useMemo(() => extractTemplateBodyTokens(bodyComponent?.text), [bodyComponent?.text]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["popup-campaigns"] });

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          name: form.name,
          is_active: form.is_active,
          collect_name: form.collect_name,
          headline: form.headline,
          body_text: form.body_text,
          button_text: form.button_text,
          image_url: form.image_url || null,
          trigger_time_seconds: form.trigger_time_seconds ? Number(form.trigger_time_seconds) : null,
          trigger_exit_intent: form.trigger_exit_intent,
          reshow_mode: form.reshow_mode,
          reshow_after_days: form.reshow_after_days ? Number(form.reshow_after_days) : null,
          coupon_mode: form.coupon_mode,
          fixed_coupon_code: form.coupon_mode === "fixed" ? form.fixed_coupon_code || null : null,
          discount_type: form.coupon_mode === "unique" ? form.discount_type : null,
          discount_value: form.coupon_mode === "unique" ? Number(form.discount_value) : null,
          discount_expires_days: form.coupon_mode === "unique" ? Number(form.discount_expires_days) : null,
          template_id: template?.id ?? null,
          template_name: form.template_name || null,
          template_language: form.template_language || null,
          template_var_mapping: form.template_var_mapping,
        },
      }),
    onSuccess: () => {
      toast.success("Pop-up salvo.");
      setOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) => toggle({ data: input }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: invalidate });

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Pop-ups configurados</p>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            setForm(EMPTY_FORM);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo pop-up
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {(campaigns ?? []).length === 0 && (
          <p className="rounded-xl border border-border px-4 py-8 text-center text-muted-foreground lg:col-span-2">
            Nenhum pop-up ainda. Crie o primeiro e ative na aba Instalação.
          </p>
        )}
        {(campaigns ?? []).map((c: any) => (
          <article key={c.id} className="surface-card space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.headline}</p>
              </div>
              <Switch checked={c.is_active} onCheckedChange={(v) => toggleMut.mutate({ id: c.id, is_active: v })} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">
                {c.coupon_mode === "none" ? "Sem cupom" : c.coupon_mode === "fixed" ? "Cupom fixo" : "Cupom único por lead"}
              </Badge>
              <Badge variant="outline">
                {[c.trigger_time_seconds ? `${c.trigger_time_seconds}s` : null, c.trigger_exit_intent ? "saída do mouse" : null]
                  .filter(Boolean)
                  .join(" + ") || "sem gatilho"}
              </Badge>
              {c.template_name && <Badge variant="outline">Template: {c.template_name}</Badge>}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setForm(rowToForm(c));
                  setOpen(true);
                }}
              >
                <Pencil className="size-3.5" /> Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-critical"
                onClick={() => {
                  if (confirm(`Excluir o pop-up "${c.name}"?`)) deleteMut.mutate(c.id);
                }}
              >
                <Trash2 className="size-3.5" /> Excluir
              </Button>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar pop-up" : "Novo pop-up"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome interno</Label>
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Pop-up boas-vindas" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Título</Label>
                <Input value={form.headline} onChange={(e) => patch({ headline: e.target.value })} />
              </div>
              <div>
                <Label>Texto do botão</Label>
                <Input value={form.button_text} onChange={(e) => patch({ button_text: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Texto</Label>
              <Textarea value={form.body_text} onChange={(e) => patch({ body_text: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Pedir nome também</p>
                <p className="text-xs text-muted-foreground">Sem isso, o pop-up pede só o WhatsApp.</p>
              </div>
              <Switch checked={form.collect_name} onCheckedChange={(v) => patch({ collect_name: v })} />
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">Gatilho de exibição</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Aparecer após (segundos, opcional)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.trigger_time_seconds}
                    onChange={(e) => patch({ trigger_time_seconds: e.target.value })}
                    placeholder="deixe em branco pra desativar"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-2">
                  <span className="text-xs">Também na saída do mouse (exit-intent)</span>
                  <Switch checked={form.trigger_exit_intent} onCheckedChange={(v) => patch({ trigger_exit_intent: v })} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Se fechar sem cadastrar, reaparece</Label>
                  <Select value={form.reshow_mode} onValueChange={(v: any) => patch({ reshow_mode: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="after_days">Depois de N dias</SelectItem>
                      <SelectItem value="once_ever">Nunca mais neste navegador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.reshow_mode === "after_days" && (
                  <div>
                    <Label className="text-xs">Dias até reaparecer</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.reshow_after_days}
                      onChange={(e) => patch({ reshow_after_days: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">Cupom</p>
              <Select value={form.coupon_mode} onValueChange={(v: any) => patch({ coupon_mode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  <SelectItem value="fixed">Fixo (mesmo código pra todo mundo)</SelectItem>
                  <SelectItem value="unique">Único por lead (criado na Shopify na hora)</SelectItem>
                </SelectContent>
              </Select>

              {form.coupon_mode === "fixed" && (
                <div>
                  <Label className="text-xs">Código do cupom</Label>
                  <Input value={form.fixed_coupon_code} onChange={(e) => patch({ fixed_coupon_code: e.target.value })} />
                </div>
              )}

              {form.coupon_mode === "unique" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={form.discount_type} onValueChange={(v: any) => patch({ discount_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">% de desconto</SelectItem>
                        <SelectItem value="fixed_amount">Valor fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Valor</Label>
                    <Input type="number" min={0} value={form.discount_value} onChange={(e) => patch({ discount_value: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Expira em (dias)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.discount_expires_days}
                      onChange={(e) => patch({ discount_expires_days: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">Mensagem de boas-vindas (WhatsApp)</p>
              <p className="text-xs text-muted-foreground">Só templates aprovados na Meta podem ser usados.</p>
              <Select
                value={form.template_name ? `${form.template_name}::${form.template_language}` : ""}
                onValueChange={(v) => {
                  const [name, language] = v.split("::");
                  patch({ template_name: name ?? "", template_language: language ?? "", template_var_mapping: {} });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um template" />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((t: any) => (
                    <SelectItem key={`${t.name}-${t.language}`} value={`${t.name}::${t.language}`}>
                      {t.name} ({t.language})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {tokens.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">De onde vem cada variável do template</Label>
                  {tokens.map((token) => {
                    const mapped = form.template_var_mapping[token] ?? "";
                    const source = mapped.startsWith("static:") ? "static" : mapped || "";
                    const staticValue = mapped.startsWith("static:") ? mapped.slice("static:".length) : "";
                    return (
                      <div key={token} className="grid grid-cols-[100px_1fr] items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{`{{${token}}}`}</span>
                        <div className="flex gap-2">
                          <Select
                            value={source}
                            onValueChange={(v) => {
                              const next = { ...form.template_var_mapping };
                              next[token] = v === "static" ? "static:" : v;
                              patch({ template_var_mapping: next });
                            }}
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="name">Nome capturado</SelectItem>
                              <SelectItem value="coupon_code">Código do cupom</SelectItem>
                              <SelectItem value="static">Texto fixo</SelectItem>
                            </SelectContent>
                          </Select>
                          {source === "static" && (
                            <Input
                              className="flex-1"
                              value={staticValue}
                              onChange={(e) => {
                                const next = { ...form.template_var_mapping };
                                next[token] = `static:${e.target.value}`;
                                patch({ template_var_mapping: next });
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Pop-up ativo</p>
                <p className="text-xs text-muted-foreground">Só um pop-up ativo é exibido no site por vez.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => patch({ is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name || !form.headline}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
