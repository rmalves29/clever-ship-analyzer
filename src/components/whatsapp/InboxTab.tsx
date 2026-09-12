import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare, RefreshCw, Search, Send } from "lucide-react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: threads, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-inbox-threads", debouncedSearch],
    queryFn: () => listInboxThreads({ data: { search: debouncedSearch || undefined } }),
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
  const filtered = list;

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
    <Box sx={{ mt: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "320px 1fr" } }}>
      <Stack sx={{ height: 600, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome ou telefone"
            size="small"
            fullWidth
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> } }}
          />
          <IconButton onClick={() => refetch()} aria-label="Atualizar conversas" sx={{ border: "1px solid", borderColor: "divider" }}>
            <RefreshCw size={16} />
          </IconButton>
        </Stack>

        <Box sx={{ mt: 1.5, flex: 1, overflowY: "auto" }}>
          {isLoading && <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>Carregando conversas...</Typography>}
          {!isLoading && filtered.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
              {debouncedSearch
                ? "Nenhuma conversa encontrada com esse nome ou telefone."
                : "Nenhuma conversa ainda. Assim que um cliente enviar mensagem para o número conectado, ela aparece aqui."}
            </Typography>
          )}
          {filtered.map((t) => (
            <Box
              key={t.id}
              component="button"
              onClick={() => openThread(t.id)}
              sx={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                cursor: "pointer",
                borderRadius: 2,
                px: 1.5,
                py: 1,
                bgcolor: t.id === selectedId ? "action.selected" : "transparent",
                "&:hover": { bgcolor: t.id === selectedId ? "action.selected" : "action.hover" },
              }}
            >
              <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{t.contact_name ?? t.phone}</Typography>
                {t.unread_count > 0 && (
                  <Chip size="small" color="success" label={t.unread_count} sx={{ height: 18, "& .MuiChip-label": { px: 0.75, fontSize: 10, fontWeight: 700 } }} />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{t.last_message_preview ?? "—"}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{formatTime(t.last_message_at)}</Typography>
            </Box>
          ))}
        </Box>
      </Stack>

      <Stack sx={{ height: 600, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2 }}>
        {!selected && (
          <Stack sx={{ flex: 1, alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
            <MessageSquare size={32} />
            <Typography variant="body2" sx={{ mt: 1 }}>Selecione uma conversa para ler e responder.</Typography>
          </Stack>
        )}

        {selected && (
          <>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid", borderColor: "divider", pb: 1.5 }}>
              <Box>
                <Typography sx={{ fontWeight: 600 }}>{selected.contact_name ?? selected.phone}</Typography>
                <Typography variant="caption" color="text.secondary">{selected.phone}</Typography>
              </Box>
              <Chip size="small" color={wnd.open ? "success" : "warning"} label={wnd.label} />
            </Stack>

            <Stack spacing={1} sx={{ flex: 1, overflowY: "auto", py: 2 }}>
              {(messages ?? []).map((m) => (
                <Box key={m.id} sx={{ display: "flex", justifyContent: m.direction === "outbound" ? "flex-end" : "flex-start" }}>
                  <Box
                    sx={{
                      maxWidth: "75%",
                      borderRadius: 3,
                      px: 1.5,
                      py: 1,
                      fontSize: 14,
                      bgcolor: m.direction === "outbound" ? "primary.50" : "action.hover",
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: "block", mt: 0.5 }}>
                      {formatTime(m.sent_at)}
                      {m.status === "failed" ? ` · falhou: ${m.error ?? ""}` : ""}
                    </Typography>
                  </Box>
                </Box>
              ))}
              <div ref={bottomRef} />
            </Stack>

            <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
              <TextField
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
                multiline
                minRows={2}
                fullWidth
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
                <Button variant="contained" startIcon={<Send size={16} />} onClick={handleSend} disabled={!wnd.open || sending || !draft.trim()}>
                  Enviar
                </Button>
              </Box>
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
}
