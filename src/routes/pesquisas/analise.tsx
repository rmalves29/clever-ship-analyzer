import { createFileRoute, createLink } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Copy, Download, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { MarkdownView } from "@/components/pesquisas/MarkdownView";
import {
  getSurveyAnalysis,
  getSurveyAnalysisOverview,
  runSurveyAnalysisStage,
  startSurveyAnalysis,
} from "@/lib/survey-analysis.functions";

export const Route = createFileRoute("/pesquisas/analise")({
  head: () => ({
    meta: [
      { title: "Análise das pesquisas | CRM Insights" },
      { name: "description", content: "A IA analisa todas as pesquisas (as novas entram sozinhas), guarda o que aprendeu e alimenta a análise geral do sistema." },
    ],
  }),
  component: AnalisePage,
});

const LinkIconButton = createLink(IconButton);

type Mode = "A" | "B" | "AB";
type StageState = { key: string; label: string; state: "pending" | "running" | "done" | "error"; error?: string };

const MODE_HELP: Record<Mode, string> = {
  A: "Uma análise para cada pesquisa: respostas, cruzamentos, textos abertos e decisões.",
  B: "Todas as pesquisas juntas como a jornada da cliente: onde trava, perfis, plano priorizado e Black Friday.",
  AB: "As duas: a jornada completa e uma análise para cada pesquisa.",
};

const toNumber = (v: string): number | undefined => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

function AnalisePage() {
  const queryClient = useQueryClient();
  const runStart = useServerFn(startSurveyAnalysis);
  const runStage = useServerFn(runSurveyAnalysisStage);
  const runGet = useServerFn(getSurveyAnalysis);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["survey-analysis"], queryFn: () => getSurveyAnalysisOverview() });

  const [mode, setMode] = useState<Mode>("AB");
  const [periodo, setPeriodo] = useState("");
  const [pedidos, setPedidos] = useState("");
  const [ticket, setTicket] = useState("");
  const [recompra, setRecompra] = useState("");
  const [recebidos, setRecebidos] = useState<Record<string, string>>({});
  const [naoComprouRecebidos, setNaoComprouRecebidos] = useState("");
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<StageState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);

  // Preenche o contexto com os números do sistema (o usuário pode trocar).
  useEffect(() => {
    if (!data || filled) return;
    setFilled(true);
    if (data.suggested.periodo) setPeriodo(data.suggested.periodo);
    if (data.suggested.pedidos != null) setPedidos(String(data.suggested.pedidos));
    if (data.suggested.ticketMedio != null) setTicket(String(data.suggested.ticketMedio).replace(".", ","));
    if (data.suggested.recompra != null) setRecompra(String(data.suggested.recompra).replace(".", ","));
  }, [data, filled]);

  const latest = data?.latest ?? null;
  const currentId = selectedId ?? latest?.id ?? null;

  const { data: other } = useQuery({
    queryKey: ["survey-analysis-item", selectedId],
    queryFn: () => runGet({ data: { id: selectedId! } }),
    enabled: Boolean(selectedId) && selectedId !== latest?.id,
  });
  const shown = selectedId && selectedId !== latest?.id ? other : latest;

  const withData = useMemo(() => (data?.surveys ?? []).filter((s) => s.responses > 0), [data]);

  const generate = async () => {
    if (!data?.hasApiKey) {
      toast.error("Configure a chave da OpenAI em Configurações antes de analisar.");
      return;
    }
    setRunning(true);
    setStages([]);
    try {
      const context = {
        periodo: periodo.trim() || undefined,
        pedidos: toNumber(pedidos),
        ticketMedio: toNumber(ticket),
        recompra: toNumber(recompra),
        naoComprouRecebidos: toNumber(naoComprouRecebidos),
        recebidos: Object.fromEntries(Object.entries(recebidos).map(([slug, v]) => [slug, toNumber(v)]).filter(([, v]) => v !== undefined)) as Record<string, number>,
      };
      const start = await runStart({ data: { mode, context } });
      if (!start.success) {
        toast.error(start.error);
        return;
      }
      const list: StageState[] = start.stages.map((s) => ({ ...s, state: "pending" }));
      setStages(list);
      for (let i = 0; i < list.length; i++) {
        list[i] = { ...list[i]!, state: "running" };
        setStages([...list]);
        const res = await runStage({ data: { runId: start.runId, stage: list[i]!.key } });
        if (!res.success) {
          list[i] = { ...list[i]!, state: "error", error: res.error };
          setStages([...list]);
          toast.error(res.error);
          return;
        }
        list[i] = { ...list[i]!, state: "done" };
        setStages([...list]);
      }
      toast.success("Análise pronta e inteligência guardada.");
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["survey-analysis"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar a análise.");
    } finally {
      setRunning(false);
    }
  };

  const copyReport = () => {
    if (!shown?.report) return;
    navigator.clipboard.writeText(shown.report);
    toast.success("Análise copiada.");
  };

  const downloadReport = () => {
    if (!shown?.report) return;
    const blob = new Blob([shown.report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analise-pesquisas-${shown.createdAt.slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error && !data) {
    return (
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 720 }}>
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => refetch()}>Tentar de novo</Button>}>
          Não foi possível abrir a análise das pesquisas: {error instanceof Error ? error.message : "erro desconhecido"}
        </Alert>
      </Box>
    );
  }
  if (isLoading || !data) {
    return <Typography variant="body2" color="text.secondary" sx={{ p: 4 }}>Carregando...</Typography>;
  }

  const memory = latest?.memory ?? null;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, display: "flex", flexDirection: "column", gap: 3, maxWidth: 1100 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <LinkIconButton to="/pesquisas"><ArrowLeft size={20} /></LinkIconButton>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Análise das pesquisas</Typography>
          <Typography variant="body2" color="text.secondary">
            A IA lê todas as pesquisas do sistema, guarda o que aprendeu e passa os pontos principais para a análise geral do dashboard.
          </Typography>
        </Box>
      </Stack>

      {!data.hasApiKey && (
        <Alert severity="warning">Falta a chave da OpenAI. Cadastre em Configurações para poder analisar.</Alert>
      )}

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.25, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Pesquisas que entram na análise</Typography>
        <Typography variant="body2" color="text.secondary">
          Vem direto do sistema a cada rodada: toda pesquisa nova que você criar entra sozinha na próxima análise (marcada como "nova").
        </Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          {data.surveys.map((s) => (
            <Chip
              key={s.id}
              variant={s.responses > 0 ? "filled" : "outlined"}
              color={s.isNew ? "success" : "default"}
              label={`${s.code} · ${s.responses} ${s.responses === 1 ? "resposta" : "respostas"}${s.isNew ? " · nova" : ""}${s.responses === 0 ? " · sem respostas ainda" : ""}`}
              sx={{ opacity: s.responses > 0 ? 1 : 0.6 }}
            />
          ))}
          {data.surveys.length === 0 && <Typography variant="body2" color="text.secondary">Nenhuma pesquisa criada ainda.</Typography>}
        </Stack>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.25, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Gerar análise</Typography>
        <Box>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} disabled={running}>
            <ToggleButton value="A">A · Individual</ToggleButton>
            <ToggleButton value="B">B · Jornada completa</ToggleButton>
            <ToggleButton value="AB">A e B</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>{MODE_HELP[mode]}</Typography>
        </Box>

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Dados que complementam (opcional)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.25 }}>
            Já vêm preenchidos com os números do sistema. Troque se quiser; o que ficar em branco a IA não usa.
          </Typography>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "2fr 1fr 1fr 1fr" } }}>
            <TextField size="small" label="Período das respostas" value={periodo} onChange={(e) => setPeriodo(e.target.value)} disabled={running} />
            <TextField size="small" label="Pedidos no período" value={pedidos} onChange={(e) => setPedidos(e.target.value)} disabled={running} />
            <TextField size="small" label="Ticket médio (R$)" value={ticket} onChange={(e) => setTicket(e.target.value)} disabled={running} />
            <TextField size="small" label="Taxa de recompra (%)" value={recompra} onChange={(e) => setRecompra(e.target.value)} disabled={running} />
          </Box>
          {withData.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5, mb: 1 }}>
                Quantas pessoas receberam cada pesquisa (para calcular a taxa de resposta):
              </Typography>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" } }}>
                {withData.map((s) => (
                  <TextField
                    key={s.id}
                    size="small"
                    label={s.code}
                    value={recebidos[s.slug] ?? ""}
                    onChange={(e) => setRecebidos((prev) => ({ ...prev, [s.slug]: e.target.value }))}
                    disabled={running}
                  />
                ))}
                {withData.some((s) => s.slug === "desnfc") && (
                  <TextField size="small" label="Não comprou (abandonos)" value={naoComprouRecebidos} onChange={(e) => setNaoComprouRecebidos(e.target.value)} disabled={running} />
                )}
              </Box>
            </>
          )}
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="contained" size="large" startIcon={running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} onClick={generate} disabled={running || withData.length === 0 || !data.hasApiKey}>
            {running ? "Analisando…" : "Gerar análise"}
          </Button>
          {withData.length === 0 && <Typography variant="caption" color="text.secondary">Ainda não há respostas para analisar.</Typography>}
        </Stack>

        {stages.length > 0 && (
          <Stack spacing={0.75} aria-live="polite">
            {stages.map((s) => (
              <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {s.state === "done" ? <Check size={16} color="var(--mui-palette-success-main, #28C76F)" /> : s.state === "error" ? <X size={16} color="var(--mui-palette-error-main, #d32f2f)" /> : s.state === "running" ? <Loader2 size={16} className="animate-spin" /> : <Box sx={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid", borderColor: "divider" }} />}
                <Typography variant="body2" color={s.state === "pending" ? "text.secondary" : "text.primary"}>{s.label}</Typography>
                {s.error && <Typography variant="caption" color="error">{s.error}</Typography>}
              </Stack>
            ))}
            {running && <Typography variant="caption" color="text.secondary">Cada etapa leva de 20 a 90 segundos. Pode deixar esta tela aberta.</Typography>}
          </Stack>
        )}
      </Box>

      {memory && memory.aprendizados.length + memory.alertas.length + memory.resumoDashboard.length > 0 && (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.25, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Inteligência guardada</Typography>
          <Typography variant="body2" color="text.secondary">
            O que o sistema já aprendeu das pesquisas. Cada nova análise parte daqui e marca o que se confirmou, mudou ou é novo. Estes pontos também entram na análise geral do dashboard.
          </Typography>
          {memory.alertas.length > 0 && (
            <Alert severity="warning" sx={{ alignItems: "flex-start" }}>
              <Stack component="ul" sx={{ m: 0, pl: 2.5, gap: 0.25 }}>
                {memory.alertas.map((a, i) => <li key={i}>{a}</li>)}
              </Stack>
            </Alert>
          )}
          {memory.aprendizados.length > 0 && (
            <TableContainer sx={{ maxHeight: 420, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Tema</TableCell>
                    <TableCell>Achado</TableCell>
                    <TableCell>Evidência</TableCell>
                    <TableCell>Situação</TableCell>
                    <TableCell>Desde</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {memory.aprendizados.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontWeight: 600 }}>{l.tema}</TableCell>
                      <TableCell>{l.achado}</TableCell>
                      <TableCell sx={{ color: "text.secondary" }}>{l.evidencia}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" color={l.tendencia === "novo" ? "success" : l.tendencia === "mudou" ? "warning" : l.tendencia === "enfraqueceu" ? "default" : "primary"} label={l.tendencia} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>{l.desde ? new Date(l.desde).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.25, display: "flex", flexDirection: "column", gap: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Análise</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            {data.history.length > 0 && (
              <TextField select size="small" value={currentId ?? ""} onChange={(e) => setSelectedId(e.target.value)} sx={{ minWidth: 260 }} label="Rodada">
                {data.history.filter((h) => h.status === "done").map((h) => (
                  <MenuItem key={h.id} value={h.id}>
                    {new Date(h.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {h.mode === "AB" ? "A e B" : h.mode} · {h.responses} respostas
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={copyReport} disabled={!shown?.report}>Copiar</Button>
            <Button size="small" variant="outlined" startIcon={<Download size={14} />} onClick={downloadReport} disabled={!shown?.report}>Baixar (.md)</Button>
          </Stack>
        </Stack>
        {shown?.report ? (
          <MarkdownView source={shown.report} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Nenhuma análise gerada ainda. Escolha o modo acima e clique em "Gerar análise".
          </Typography>
        )}
        {shown?.error && <Alert severity="info">{shown.error}</Alert>}
      </Box>
    </Box>
  );
}
