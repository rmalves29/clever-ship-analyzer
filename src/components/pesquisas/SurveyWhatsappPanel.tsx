import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getSurveyWaOverview, resumeSurveyRun, saveSurveyWaConfig, sendSurveyTestInvite } from "@/lib/survey-wa.functions";

const STATUS_LABEL: Record<string, string> = {
  active: "Em andamento",
  completed: "Concluídas",
  declined: "Recusaram",
  expired: "Expiraram",
  opted_out: "Pediram para sair",
  waiting_team: "Esperando a equipe",
  error: "Com erro",
};

const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 5)}••••${p.slice(-3)}` : p);

/** Aba "WhatsApp" da pesquisa: convite (modelo aprovado), liga/desliga, teste e andamento das conversas. */
export function SurveyWhatsappPanel({ surveyId }: { surveyId: string }) {
  const queryClient = useQueryClient();
  const runSave = useServerFn(saveSurveyWaConfig);
  const runTest = useServerFn(sendSurveyTestInvite);
  const runResume = useServerFn(resumeSurveyRun);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["survey-wa", surveyId], queryFn: () => getSurveyWaOverview({ data: { surveyId } }), refetchInterval: 30_000 });

  const [template, setTemplate] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [expire, setExpire] = useState("24");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testNome, setTestNome] = useState("");
  const [testPedido, setTestPedido] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!data || loaded) return;
    setTemplate(data.config.templateName ?? "");
    setEnabled(data.config.enabled);
    setExpire(String(data.config.expireHours));
    setLoaded(true);
  }, [data, loaded]);

  if (error && !data) return <Alert severity="error">Não foi possível abrir a aba WhatsApp: {error instanceof Error ? error.message : "erro"}</Alert>;
  if (isLoading || !data) return <Typography variant="body2" color="text.secondary">Carregando...</Typography>;

  const chosen = data.templates.find((t) => t.name === template);
  const save = async (nextEnabled: boolean) => {
    setSaving(true);
    try {
      const res = await runSave({ data: { surveyId, templateName: template || null, enabled: nextEnabled, expireHours: Number(expire) || 24 } });
      if (!res.success) {
        toast.error(res.error);
        setEnabled(false);
        return;
      }
      setEnabled(nextEnabled);
      toast.success(nextEnabled ? "Pesquisa por WhatsApp ligada: quem tocar no convite responde por aqui." : "Configuração salva.");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await runTest({ data: { surveyId, phone: testPhone, ...(testNome.trim() ? { nome: testNome.trim() } : {}), ...(testPedido.trim() ? { pedido: testPedido.trim() } : {}) } });
      if (!res.success) toast.error(res.error);
      else toast.success("Convite de teste enviado. Toque no botão no WhatsApp para fazer a pesquisa.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar.");
    } finally {
      setTesting(false);
    }
  };

  const resume = async (id: string) => {
    const res = await runResume({ data: { runId: id } });
    if (!res.success) toast.error(res.error ?? "Não foi possível enviar.");
    else toast.success("Confirmação enviada à cliente.");
    await queryClient.invalidateQueries({ queryKey: ["survey-wa", surveyId] });
  };

  return (
    <Stack spacing={2.5}>
      <Typography variant="body2" color="text.secondary">
        Aqui a mesma árvore vira conversa no WhatsApp: a cliente recebe um convite (modelo aprovado pela Meta) e, ao tocar no botão, responde por botões, listas e texto. As respostas e etiquetas entram na aba Respostas.
        Nada é enviado a quem não tocou no convite.
      </Typography>

      {data.pending.length > 0 && (
        <Alert severity="warning">
          Faltam decisões da loja nos textos desta pesquisa: {[...new Set(data.pending.map((p) => `[${p.text}]`))].join(", ")}. Preencha na aba Perguntas; enquanto isso o envio por WhatsApp não pode ser ligado.
        </Alert>
      )}
      {data.templatesError && <Alert severity="error">Não consegui ler os modelos da Meta: {data.templatesError}</Alert>}

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Convite</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" } }}>
          <TextField select size="small" label="Modelo de convite (com botões)" value={template} onChange={(e) => { setTemplate(e.target.value); if (enabled) setEnabled(false); }} sx={{ minWidth: 340 }} disabled={saving}>
            <MenuItem value="">— escolher —</MenuItem>
            {data.templates.map((t) => (
              <MenuItem key={t.name} value={t.name}>
                {t.name} · {t.status === "APPROVED" ? "aprovado" : t.status.toLowerCase()}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Horas para responder" value={expire} onChange={(e) => setExpire(e.target.value.replace(/\D/g, ""))} sx={{ width: 170 }} disabled={saving} />
          <Button variant="outlined" onClick={() => save(false)} disabled={saving || !template}>Salvar</Button>
        </Stack>
        {chosen && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Chip size="small" color={chosen.status === "APPROVED" ? "success" : "warning"} label={chosen.status === "APPROVED" ? "Aprovado pela Meta" : `Status: ${chosen.status}`} />
            <Chip size="small" variant="outlined" label={chosen.category} />
            <Typography variant="caption" color="text.secondary">Botões do modelo: {chosen.quickReplies.join(" · ")}</Typography>
          </Stack>
        )}
        {data.unmatchedButtons.length > 0 && (
          <Alert severity="error">
            Os botões do modelo ({data.unmatchedButtons.join(", ")}) não batem com as opções da 1ª etapa ({data.inviteOptions.join(", ") || "sem opções"}). Ajuste um dos dois, senão o clique cai no caminho errado.
          </Alert>
        )}
        <FormControlLabel
          control={<Switch checked={enabled} disabled={saving || !template} onChange={(e) => save(e.target.checked)} />}
          label={<Typography variant="body2">{enabled ? "Ligada: quem tocar no convite responde por WhatsApp" : "Desligada"}</Typography>}
        />
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Testar com o seu número</Typography>
        <Typography variant="body2" color="text.secondary">Envia o convite para um telefone só (precisa de modelo aprovado). Toque no botão no WhatsApp e responda como a cliente. A resposta de teste aparece em Respostas com origem "whatsapp".</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <TextField size="small" label="Telefone com DDD" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} sx={{ minWidth: 200 }} />
          <TextField size="small" label="Nome (opcional)" value={testNome} onChange={(e) => setTestNome(e.target.value)} />
          <TextField size="small" label="Nº do pedido (opcional)" value={testPedido} onChange={(e) => setTestPedido(e.target.value)} />
          <Button variant="contained" startIcon={<Send size={14} />} onClick={sendTest} disabled={testing || !template || !testPhone.trim()}>
            {testing ? "Enviando…" : "Enviar convite de teste"}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Andamento</Typography>
        {Object.keys(data.counts).length === 0 ? (
          <Typography variant="body2" color="text.secondary">Ninguém respondeu por WhatsApp ainda.</Typography>
        ) : (
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            {Object.entries(data.counts).map(([status, n]) => (
              <Chip key={status} variant="outlined" label={`${STATUS_LABEL[status] ?? status}: ${n}`} />
            ))}
          </Stack>
        )}
        {data.waitingTeam.length > 0 && (
          <Stack spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Esperando a equipe resolver:</Typography>
            {data.waitingTeam.map((w) => (
              <Stack key={w.id} direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{maskPhone(w.phone)}</Typography>
                <Typography variant="caption" color="text.secondary">desde {new Date(w.since).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</Typography>
                <Button size="small" variant="outlined" onClick={() => resume(w.id)}>Resolvido: enviar "conseguimos resolver?"</Button>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
