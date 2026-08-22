import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Copy, Trash2 } from "lucide-react";
import {
  listEnvioCampaigns,
  createEnvioCampaign,
  updateEnvioCampaign,
  deleteEnvioCampaign,
} from "@/lib/envio-campaigns.functions";
import { CampaignDetailDialog } from "./CampaignDetailDialog";

export function CampaignsManager() {
  const qc = useQueryClient();
  const list = useServerFn(listEnvioCampaigns);
  const create = useServerFn(createEnvioCampaign);
  const update = useServerFn(updateEnvioCampaign);
  const del = useServerFn(deleteEnvioCampaign);

  const { data: campaigns, isLoading } = useQuery({ queryKey: ["envio-campaigns"], queryFn: () => list() });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["envio-campaigns"] });

  const createMut = useMutation({
    mutationFn: () => create({ data: { name, description: description || undefined } }),
    onSuccess: () => {
      toast.success("Campanha criada.");
      setCreateOpen(false);
      setName("");
      setDescription("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; is_entry_open?: boolean; is_active?: boolean }) => update({ data: input }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-4 py-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" /> Nova campanha
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(campaigns ?? []).map((c) => {
          const url = `https://clever-ship-analyzer.lovable.app/fluxo/${c.slug}`;
          return (
            <div key={c.id} className="surface-card cursor-pointer p-4" onClick={() => setDetailId(c.id)}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{c.name}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Apagar a campanha "${c.name}"?`)) deleteMut.mutate(c.id);
                  }}
                >
                  <Trash2 className="size-4 text-critical" />
                </Button>
              </div>
              {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
              <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Input readOnly value={url} className="h-8 text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    toast.success("Link copiado.");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                <label className="flex items-center gap-1.5">
                  Aberta
                  <Switch checked={c.is_entry_open} onCheckedChange={(v) => toggleMut.mutate({ id: c.id, is_entry_open: v })} />
                </label>
                <label className="flex items-center gap-1.5">
                  Ativa
                  <Switch checked={c.is_active} onCheckedChange={(v) => toggleMut.mutate({ id: c.id, is_active: v })} />
                </label>
              </div>
            </div>
          );
        })}
        {(campaigns ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !name}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailId && <CampaignDetailDialog campaignId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
