import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, MapPin, Save, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getSocialProofSettings, saveSocialProofSettings } from "@/lib/popup.functions";
import { DEFAULT_SOCIAL_PROOF_SETTINGS, type SocialProofSettings } from "@/lib/popup-social-proof";

const POSITION_LABELS: Record<SocialProofSettings["position"], string> = {
  "top-left": "Superior esquerdo",
  "top-right": "Superior direito",
  "bottom-left": "Inferior esquerdo",
  "bottom-right": "Inferior direito",
};

export function SocialProofSettingsPanel() {
  const qc = useQueryClient();
  const getSettings = useServerFn(getSocialProofSettings);
  const saveSettings = useServerFn(saveSocialProofSettings);
  const [form, setForm] = useState<SocialProofSettings>(DEFAULT_SOCIAL_PROOF_SETTINGS);
  const { data, isPending, isError } = useQuery({
    queryKey: ["popup-social-proof-settings"],
    queryFn: () => getSettings(),
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({ data: form }),
    onSuccess: (saved) => {
      setForm(saved);
      qc.setQueryData(["popup-social-proof-settings"], saved);
      toast.success(saved.enabled ? "Pop-up de compras recentes ativado." : "Pop-up de compras recentes pausado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patchNumber = (key: "delayAfterCaptureSeconds" | "intervalSeconds" | "visibleSeconds", value: string) => {
    setForm((current) => ({ ...current, [key]: Number(value) }));
  };

  if (isPending) return <div className="py-12 text-center text-sm text-muted-foreground">Carregando configurações…</div>;
  if (isError) return <div className="my-4 rounded-xl border border-critical/30 bg-critical/5 p-4 text-sm text-critical">Não foi possível carregar as configurações.</div>;

  return (
    <div className="grid gap-5 py-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="overflow-hidden rounded-2xl border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-5 text-primary" />
              <h2 className="font-semibold">Compras recentes</h2>
              <Badge variant={form.enabled ? "default" : "outline"}>{form.enabled ? "Ativo" : "Pausado"}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Mostra vendas pagas do dia anterior, em ordem aleatória.</p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="social-proof-enabled" className="text-sm">Publicar no site</Label>
            <Switch id="social-proof-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))} />
          </div>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border p-4">
            <div className="flex items-center gap-2"><Clock3 className="size-4 text-primary" /><Label htmlFor="social-proof-delay">Depois de fechar o pop-up principal</Label></div>
            <div className="flex items-center gap-2"><Input id="social-proof-delay" type="number" min={1} max={300} value={form.delayAfterCaptureSeconds} onChange={(event) => patchNumber("delayAfterCaptureSeconds", event.target.value)} /><span className="text-sm text-muted-foreground">segundos</span></div>
            <p className="text-xs text-muted-foreground">Primeira exibição. Padrão: 10 segundos.</p>
          </div>

          <div className="space-y-2 rounded-xl border p-4">
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><Label htmlFor="social-proof-interval">Intervalo entre compras</Label></div>
            <div className="flex items-center gap-2"><Input id="social-proof-interval" type="number" min={10} max={3600} value={form.intervalSeconds} onChange={(event) => patchNumber("intervalSeconds", event.target.value)} /><span className="text-sm text-muted-foreground">segundos</span></div>
            <p className="text-xs text-muted-foreground">Repete com outra compra. Padrão: 50 segundos.</p>
          </div>

          <div className="space-y-2 rounded-xl border p-4">
            <Label htmlFor="social-proof-visible">Tempo visível</Label>
            <div className="flex items-center gap-2"><Input id="social-proof-visible" type="number" min={2} max={30} value={form.visibleSeconds} onChange={(event) => patchNumber("visibleSeconds", event.target.value)} /><span className="text-sm text-muted-foreground">segundos</span></div>
          </div>

          <div className="space-y-2 rounded-xl border p-4">
            <Label>Posição no site</Label>
            <Select value={form.position} onValueChange={(position: SocialProofSettings["position"]) => setForm((current) => ({ ...current, position }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(POSITION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mx-5 mb-5 flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">Privacidade protegida</p>
            <p className="text-xs leading-relaxed text-muted-foreground">O site recebe somente primeiro nome + inicial do sobrenome, cidade/UF, produto e imagem. E-mail, telefone e número do pedido não são enviados.</p>
          </div>
        </div>

        <div className="flex justify-end border-t px-5 py-4">
          <Button className="gap-2" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || form.visibleSeconds >= form.intervalSeconds}>
            <Save className="size-4" /> {saveMutation.isPending ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </section>

      <aside className="rounded-2xl border bg-[#f5f6f7] p-5">
        <div className="mb-4 flex items-center justify-between"><p className="font-semibold">Prévia no site</p><Badge variant="outline">Pedidos de ontem</Badge></div>
        <div className="flex min-h-[420px] items-start rounded-xl border bg-white p-4 shadow-inner">
          <div className="relative flex w-full max-w-[350px] gap-3 rounded-lg border bg-white p-2.5 pr-8 shadow-xl">
            <button type="button" className="absolute right-2 top-1 text-xl text-muted-foreground" aria-label="Fechar prévia">×</button>
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded bg-[#f6f1ef]"><ShoppingBag className="size-8 text-[#9b6f63]" /></div>
            <div className="min-w-0 pt-1 text-xs leading-tight">
              <p className="truncate font-semibold">Maria S. de Diamantina/MG</p>
              <p className="mt-1 text-[#dc2626]">comprou</p>
              <p className="mt-0.5 line-clamp-2 font-medium">Kit Ayla Azul Turquesa</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2 text-xs text-muted-foreground"><MapPin className="size-4 shrink-0" /><span>A posição escolhida será aplicada no desktop; no celular o aviso se adapta à largura da tela.</span></div>
      </aside>
    </div>
  );
}
