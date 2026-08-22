import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Trash2, RefreshCw, Plus, ExternalLink } from "lucide-react";
import {
  listEnvioGroups,
  syncEnvioGroupsFromWhatsapp,
  addEnvioGroupManual,
  updateEnvioGroup,
  deleteEnvioGroup,
} from "@/lib/envio-groups.functions";

export function GroupsManager() {
  const qc = useQueryClient();
  const list = useServerFn(listEnvioGroups);
  const sync = useServerFn(syncEnvioGroupsFromWhatsapp);
  const add = useServerFn(addEnvioGroupManual);
  const update = useServerFn(updateEnvioGroup);
  const del = useServerFn(deleteEnvioGroup);

  const { data: groups, isLoading } = useQuery({ queryKey: ["envio-groups"], queryFn: () => list() });

  const [search, setSearch] = useState("");
  const [adminOnly, setAdminOnly] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newJid, setNewJid] = useState("");
  const [newName, setNewName] = useState("");
  const [newInvite, setNewInvite] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["envio-groups"] });

  const syncMut = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.synced} grupo(s), ${r.admin_count} como admin.`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: () => add({ data: { groupJid: newJid, groupName: newName, inviteLink: newInvite || undefined } }),
    onSuccess: () => {
      toast.success("Grupo adicionado.");
      setAddOpen(false);
      setNewJid("");
      setNewName("");
      setNewInvite("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; is_entry_open?: boolean; is_active?: boolean }) => update({ data: input }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (groups ?? []).filter((g) => {
    if (adminOnly && !g.is_admin) return false;
    if (!showInactive && !g.is_active) return false;
    if (search && !g.group_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Buscar grupo…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={adminOnly} onCheckedChange={setAdminOnly} /> Só onde sou admin
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Mostrar inativos
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="size-4" /> Adicionar manual
          </Button>
          <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending} className="gap-2">
            <RefreshCw className={`size-4 ${syncMut.isPending ? "animate-spin" : ""}`} /> Buscar do WhatsApp
          </Button>
        </div>
      </div>

      <div className="surface-card divide-y divide-border">
        {filtered.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhum grupo encontrado.</p>}
        {filtered.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{g.group_name}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">
                  {g.participant_count}/{g.max_participants || 1024}
                </Badge>
                {g.is_admin && <Badge className="bg-brand-soft text-brand">Admin</Badge>}
                {g.invite_link ? (
                  <a href={g.invite_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand hover:underline">
                    <ExternalLink className="size-3" /> Link
                  </a>
                ) : (
                  <span className="text-critical">Falta link de convite</span>
                )}
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              Aberto
              <Switch
                checked={g.is_entry_open}
                onCheckedChange={(v) => updateMut.mutate({ id: g.id, is_entry_open: v })}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              Ativo
              <Switch checked={g.is_active} onCheckedChange={(v) => updateMut.mutate({ id: g.id, is_active: v })} />
            </label>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (confirm(`Apagar o grupo "${g.group_name}"?`)) deleteMut.mutate(g.id);
              }}
            >
              <Trash2 className="size-4 text-critical" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar grupo manualmente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>JID do grupo</Label>
              <Input value={newJid} onChange={(e) => setNewJid(e.target.value)} placeholder="120363xxxxxxx-group" />
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <Label>Link de convite (opcional)</Label>
              <Input value={newInvite} onChange={(e) => setNewInvite(e.target.value)} placeholder="https://chat.whatsapp.com/…" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => addMut.mutate()} disabled={addMut.isPending || !newJid || !newName}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
