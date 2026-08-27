import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare, RefreshCw, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listInboxThreads,
  listInboxMessages,
  markInboxThreadRead,
  replyInboxThread,
} from "@/lib/whatsapp-inbox.functions";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function windowLeft(lastInbound: string | null): { open: boolean; label: string } {
  if (!lastInbound) return { open: false, label: "Sem mensagem recebida" };
  const ms = 24 * 60 * 60 * 1000 - (Date.now() - new Date(lastInbound).getTime());
  if (ms <= 0) return { open: false, label: "Janela de 24h encerrada" };
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return { open: true, label: `Janela aberta · ${hours}h${String(minutes).padStart(2, "0")} restantes` };
}

export function InboxTab() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: threads, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-inbox-threads"],
    queryFn: () => listInboxThreads(),
    refetchInterval: 15_000,
  });

  const { data: messages } = useQuery({
    queryKey: ["whatsapp-inbox-messages", selectedId],
    queryFn: () => listInboxMessages({ data: { threadId: selectedId as string } }),
    enabled: !!selectedId,
    refetchInterval: 10_000,
  });

  const runReply = useServerFn(replyInboxThread);
  const runMarkRead = useServerFn(markInboxThreadRead);

  const list = threads ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => (t.contact_name ?? "").toLowerCase().includes(q) || t.phone.includes(q));
  }, [list, search]);

  const selected = list.find((t) => t.id === selectedId) ?? null;
  const wnd = windowLeft(selected?.last_inbound_at ?? null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const openThread = async (id: string) => {
    setSelectedId(id);
    setDraft("");
    await runMarkRead({ data: { threadId: id } });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox-threads"] });
  };

  const handleSend = async () => {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      const res = await runReply({ data: { threadId: selectedId, text: draft.trim() } });
      if (!res.success) {
        toast.error(res.error ?? "Falha ao enviar.");
        return;
      }
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox-messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox-threads"] });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="surface-card flex h-[600px] flex-col p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou telefone" className="pl-7" />
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Atualizar conversas">
            <RefreshCw className="size-4" />
          </Button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-center text-sm text-muted-foreground">Carregando conversas...</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma conversa ainda. Assim que um cliente enviar mensagem para o número conectado, ela aparece aqui.
            </p>
          )}
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => openThread(t.id)}
              className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${t.id === selectedId ? "bg-muted" : "hover:bg-muted/60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{t.contact_name ?? t.phone}</span>
                {t.unread_count > 0 && (
                  <span className="rounded-full bg-success px-1.5 py-0.5 text-[10px] font-semibold text-background">{t.unread_count}</span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">{t.last_message_preview ?? "—"}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatTime(t.last_message_at)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card flex h-[600px] flex-col p-4">
        {!selected && (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="size-8" />
            <p className="mt-2 text-sm">Selecione uma conversa para ler e responder.</p>
          </div>
        )}

        {selected && (
          <>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="font-semibold">{selected.contact_name ?? selected.phone}</p>
                <p className="text-xs text-muted-foreground">{selected.phone}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${wnd.open ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
                {wnd.label}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto py-4">
              {(messages ?? []).map((m) => (
                <div key={m.id} className={m.direction === "outbound" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                      m.direction === "outbound" ? "bg-brand-soft text-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatTime(m.sent_at)}
                      {m.status === "failed" ? ` · falhou: ${m.error ?? ""}` : ""}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-border pt-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={wnd.open ? "Escreva sua resposta... (Enter envia)" : "Janela de 24h encerrada — use um template na aba Campanhas."}
                disabled={!wnd.open || sending}
                rows={2}
              />
              <div className="mt-2 flex justify-end">
                <Button onClick={handleSend} disabled={!wnd.open || sending || !draft.trim()} className="gap-2">
                  <Send className="size-4" /> Enviar
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
