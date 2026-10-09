import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Paperclip, Printer, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { runMatrizAgenteStage } from "@/lib/matriz-agente.functions";
import { buildReportHtml, reportFileName } from "@/lib/matriz-agente-report";
import {
  PHASES,
  PHASE_LABEL,
  healthAverage,
  healthVerdict,
  selectProduction,
  type AgentInput,
  type AgentModel,
  type BuyingMotive,
  type CreativeBriefing,
  type MatrixCell,
  type MatrixProject,
  type Phase,
  type ProductBrief,
  type SourcePage,
  type TestPlan,
} from "@/lib/matriz-agente-shared";

type StepKey = "fontes" | "motivos" | "matriz" | "briefings" | "plano";
type StepState = "pending" | "running" | "done" | "error";

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "fontes", label: "Lendo a loja e montando o Product Brief" },
  { key: "motivos", label: "Mapeando os motivos de compra" },
  { key: "matriz", label: "Gerando a matriz (motivos × 5 pilares × 3 sementes)" },
  { key: "briefings", label: "Priorizando e escrevendo os briefings" },
  { key: "plano", label: "Montando o plano de teste e o Health Score" },
];

type AgentData = {
  paginas?: SourcePage[];
  imagemProduto?: string | null;
  brief?: ProductBrief;
  motivos?: BuyingMotive[];
  celulas?: MatrixCell[];
  avisosMatriz?: string[];
  selecionadas?: MatrixProject["selecionadas"];
  briefings?: CreativeBriefing[];
  plano?: TestPlan;
};

const MAX_ATTACH_CHARS = 18000;
const BRIEFING_BATCH = 4;

export function MatrizAgentePanel({ learnings }: { learnings: string | null }) {
  const runStage = useServerFn(runMatrizAgenteStage);

  const [url, setUrl] = useState("https://maniadmulher.com");
  const [objetivo, setObjetivo] = useState("Vendas na Black Friday");
  const [fase, setFase] = useState<Phase>("aquecimento");
  const [oferta, setOferta] = useState("");
  const [publico, setPublico] = useState("");
  const [materiais, setMateriais] = useState("");
  const [cpaMax, setCpaMax] = useState("");
  const [roas, setRoas] = useState("");
  const [modelo, setModelo] = useState<AgentModel>("gpt-4o");
  const [useLearnings, setUseLearnings] = useState(true);

  const [steps, setSteps] = useState<Record<StepKey, StepState>>({ fontes: "pending", motivos: "pending", matriz: "pending", briefings: "pending", plano: "pending" });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AgentData>({});
  const [project, setProject] = useState<MatrixProject | null>(null);
  const inputRef = useRef<AgentInput | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const html = useMemo(() => (project ? buildReportHtml(project) : null), [project]);

  const buildInput = (): AgentInput | string => {
    const cpa = cpaMax.trim() === "" ? null : Number(cpaMax.replace(",", "."));
    const roasNum = roas.trim() === "" ? null : Number(roas.replace(",", "."));
    if (cpa !== null && (!Number.isFinite(cpa) || cpa < 0)) return "CPA máximo inválido.";
    if (roasNum !== null && (!Number.isFinite(roasNum) || roasNum < 0)) return "ROAS de equilíbrio inválido.";
    const parts = [materiais.trim(), useLearnings && learnings ? learnings : ""].filter(Boolean);
    return {
      url: url.trim(),
      objetivo: objetivo.trim(),
      fase,
      oferta: oferta.trim(),
      publico: publico.trim(),
      materiais: parts.join("\n\n").slice(0, 24000),
      cpaMax: cpa,
      roasEquilibrio: roasNum,
      modelo,
    };
  };

  const attach = async (files: FileList | null) => {
    if (!files) return;
    let added = "";
    for (const file of Array.from(files)) {
      if (file.size > 400_000) {
        toast.error(`${file.name}: arquivo grande demais (máximo 400 KB de texto).`);
        continue;
      }
      try {
        added += `\n\n--- Arquivo: ${file.name} ---\n${(await file.text()).slice(0, MAX_ATTACH_CHARS)}`;
      } catch {
        toast.error(`Não consegui ler ${file.name}.`);
      }
    }
    if (added) setMateriais((prev) => `${prev}${added}`.slice(0, 20000).trim());
  };

  const setStep = (key: StepKey, state: StepState) => setSteps((prev) => ({ ...prev, [key]: state }));

  /** Chama uma etapa no servidor, com uma nova tentativa em caso de falha de rede ou de tempo. */
  const call = async (payload: NonNullable<Parameters<typeof runStage>[0]>["data"]) => {
    let last = "Falha ao executar o agente.";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await runStage({ data: payload });
        if (res.success) return res;
        last = res.error;
        if (/API key|OpenAI respondeu 4/i.test(res.error)) break;
      } catch (e) {
        last = e instanceof Error ? e.message : last;
      }
    }
    throw new Error(last);
  };

  const run = async (fromStep: StepKey | "start") => {
    const built = inputRef.current && fromStep !== "start" ? inputRef.current : buildInput();
    if (typeof built === "string") {
      setError(built);
      return;
    }
    if (built.url.length < 3) {
      setError("Informe o link da loja ou da página do produto.");
      return;
    }
    inputRef.current = built;
    setError(null);
    setRunning(true);
    let acc: AgentData = fromStep === "start" ? {} : { ...data };
    if (fromStep === "start") {
      setData({});
      setProject(null);
      setSteps({ fontes: "pending", motivos: "pending", matriz: "pending", briefings: "pending", plano: "pending" });
    }
    const order: StepKey[] = ["fontes", "motivos", "matriz", "briefings", "plano"];
    const startIndex = fromStep === "start" ? 0 : order.indexOf(fromStep);
    let current: StepKey = order[startIndex]!;
    try {
      for (let i = startIndex; i < order.length; i++) {
        current = order[i]!;
        setStep(current, "running");
        if (current === "fontes") {
          const res = await call({ stage: "fontes", input: built });
          if (res.stage !== "fontes") throw new Error("Resposta inesperada.");
          acc = { ...acc, paginas: res.data.paginas, imagemProduto: res.data.imagemProduto, brief: res.data.brief };
        } else if (current === "motivos") {
          const res = await call({ stage: "motivos", input: built, brief: acc.brief! });
          if (res.stage !== "motivos") throw new Error("Resposta inesperada.");
          acc = { ...acc, motivos: res.data.motivos };
        } else if (current === "matriz") {
          const res = await call({ stage: "matriz", input: built, brief: acc.brief!, motivos: acc.motivos! });
          if (res.stage !== "matriz") throw new Error("Resposta inesperada.");
          const selected = selectProduction(res.data.celulas, 8);
          acc = { ...acc, celulas: res.data.celulas, avisosMatriz: res.data.avisos, selecionadas: selected.map((s) => ({ cellId: s.cell.id, papel: s.papel })) };
        } else if (current === "briefings") {
          const cells = new Map(acc.celulas!.map((c) => [c.id, c]));
          const items = acc.selecionadas!.map((s, index) => ({ cell: cells.get(s.cellId)!, papel: s.papel, index }));
          const batches: Array<typeof items> = [];
          for (let k = 0; k < items.length; k += BRIEFING_BATCH) batches.push(items.slice(k, k + BRIEFING_BATCH));
          const results = await Promise.all(
            batches.map((batch) => call({ stage: "briefings", input: built, brief: acc.brief!, motivos: acc.motivos!, itens: batch, imagemDisponivel: Boolean(acc.imagemProduto) })),
          );
          let briefings = results.flatMap((r) => (r.stage === "briefings" ? r.data.briefings : []));
          if (briefings.length === 0) throw new Error("Nenhum briefing foi gerado.");
          briefings = briefings.sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
          // Revisão: headlines que repetem a tese de outra peça são reescritas.
          try {
            const review = await call({ stage: "revisao", input: built, brief: acc.brief!, briefings });
            if (review.stage === "revisao") briefings = review.data.briefings;
          } catch {
            // a revisão é um refinamento: segue com os briefings originais
          }
          acc = { ...acc, briefings };
        } else {
          const cellsList = acc.celulas!;
          const res = await call({
            stage: "plano",
            input: built,
            brief: acc.brief!,
            motivos: acc.motivos!,
            briefings: acc.briefings!,
            totalCelulas: cellsList.length,
            pendentesOuBloqueadas: cellsList.filter((c) => c.statusSugerido === "pendente" || c.statusSugerido === "bloqueado").length,
          });
          if (res.stage !== "plano") throw new Error("Resposta inesperada.");
          acc = { ...acc, plano: res.data.plano };
        }
        setData(acc);
        setStep(current, "done");
      }
      setProject({
        input: built,
        generatedAt: new Date().toISOString(),
        paginas: acc.paginas ?? [],
        imagemProduto: acc.imagemProduto ?? null,
        brief: acc.brief!,
        motivos: acc.motivos!,
        celulas: acc.celulas!,
        selecionadas: acc.selecionadas!,
        briefings: acc.briefings!,
        plano: acc.plano ?? null,
      });
      toast.success("Matriz Criativa pronta.");
    } catch (e) {
      setStep(current, "error");
      setError(e instanceof Error ? e.message : "Falha ao executar o agente.");
    } finally {
      setRunning(false);
    }
  };

  const failedStep = STEPS.find((s) => steps[s.key] === "error")?.key ?? null;

  const downloadHtml = () => {
    if (!project || !html) return;
    // Baixa o DOM atual do preview: assim os ajustes feitos nos mockups (texto editável) vão junto.
    const live = iframeRef.current?.contentDocument?.documentElement?.outerHTML;
    const content = live && live.length > 500 ? `<!doctype html>
${live}` : html;
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = reportFileName(project);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  };

  const printPdf = () => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  const avg = project?.plano ? healthAverage(project.plano.healthScore) : null;
  const verdict = avg !== null ? healthVerdict(avg) : null;

  return (
    <Box sx={{ mt: 2 }}>
      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 700 }}>Agente Arquiteto da Matriz Criativa — Black Friday</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 820 }}>
          Informe o link da loja ou do produto. O agente lê a Home, uma categoria e a página do produto, mapeia os motivos de compra, cruza com os 5 pilares criativos, prioriza por pontuação e entrega briefings, copies, mockups 4:5, plano de teste e Health Score num arquivo visual (HTML e PDF). Ele nunca inventa desconto, avaliação ou garantia: o que falta vira pendência marcada.
        </Typography>

        <Box sx={{ display: "grid", gap: 2, mt: 2, gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" } }}>
          <TextField size="small" label="Link da loja ou do produto" value={url} onChange={(e) => setUrl(e.target.value)} disabled={running} />
          <TextField size="small" select label="Fase da Black Friday" value={fase} onChange={(e) => setFase(e.target.value as Phase)} disabled={running}>
            {PHASES.map((p) => (
              <MenuItem key={p} value={p}>{PHASE_LABEL[p]}</MenuItem>
            ))}
          </TextField>
          <TextField size="small" select label="Qualidade da IA" value={modelo} onChange={(e) => setModelo(e.target.value as AgentModel)} disabled={running}>
            <MenuItem value="gpt-4o">Melhor (gpt-4o)</MenuItem>
            <MenuItem value="gpt-4o-mini">Rápido e barato (gpt-4o-mini)</MenuItem>
          </TextField>
          <TextField size="small" label="Objetivo da campanha" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} disabled={running} />
          <TextField size="small" label="CPA máximo (R$)" value={cpaMax} onChange={(e) => setCpaMax(e.target.value)} disabled={running} placeholder="opcional" />
          <TextField size="small" label="ROAS de equilíbrio" value={roas} onChange={(e) => setRoas(e.target.value)} disabled={running} placeholder="opcional" />
        </Box>
        <Stack spacing={2} sx={{ mt: 2 }}>
          <TextField size="small" multiline minRows={2} label="Oferta aprovada (preço, parcelamento, cashback, frete, bônus, garantia)" value={oferta} onChange={(e) => setOferta(e.target.value)} disabled={running} helperText="Sem isso, o agente só usa o que estiver publicado na loja e marca o resto como [VALIDAR CONDIÇÃO COMERCIAL]." />
          <TextField size="small" multiline minRows={2} label="Público, pesquisas, atendimento, avaliações reais" value={publico} onChange={(e) => setPublico(e.target.value)} disabled={running} />
          <TextField size="small" multiline minRows={2} label="Outros materiais (calendário comercial, criativos anteriores, identidade visual)" value={materiais} onChange={(e) => setMateriais(e.target.value)} disabled={running} />
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            <Button component="label" size="small" variant="outlined" startIcon={<Paperclip size={14} />} disabled={running}>
              Anexar arquivo de texto
              <input hidden type="file" accept=".txt,.md,.csv,.json" multiple onChange={(e) => { void attach(e.target.files); e.target.value = ""; }} />
            </Button>
            <Typography variant="caption" color="text.secondary">.txt, .md, .csv ou .json (até 400 KB cada)</Typography>
            <FormControlLabel
              control={<Checkbox size="small" checked={useLearnings && Boolean(learnings)} disabled={!learnings || running} onChange={(e) => setUseLearnings(e.target.checked)} />}
              label={<Typography variant="body2">{learnings ? "Usar os aprendizados da análise de posts e anúncios" : "Aprendizados de posts e anúncios: rode a análise primeiro (opcional)"}</Typography>}
            />
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <Button variant="contained" startIcon={running ? <CircularProgress size={16} color="inherit" /> : <Sparkles size={16} />} onClick={() => void run("start")} disabled={running}>
            {running ? "Gerando a matriz…" : project ? "Gerar novamente" : "Gerar Matriz Criativa de Black Friday"}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Leva de 1 a 3 minutos. Usa a sua chave da OpenAI (cerca de 16 chamadas). Nada é salvo no banco: baixe o arquivo ao final.
          </Typography>
        </Stack>

        {(running || failedStep || project || Object.values(steps).some((s) => s !== "pending")) && (
          <Stack spacing={0.75} sx={{ mt: 2 }}>
            {STEPS.map((s) => (
              <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {steps[s.key] === "running" ? <CircularProgress size={14} /> : (
                  <Chip size="small" sx={{ minWidth: 28 }} color={steps[s.key] === "done" ? "success" : steps[s.key] === "error" ? "error" : "default"} label={steps[s.key] === "done" ? "✓" : steps[s.key] === "error" ? "!" : "·"} />
                )}
                <Typography variant="body2" color={steps[s.key] === "pending" ? "text.disabled" : "text.primary"}>{s.label}</Typography>
              </Stack>
            ))}
          </Stack>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} action={failedStep && !running ? <Button color="inherit" size="small" startIcon={<RotateCcw size={14} />} onClick={() => void run(failedStep)}>Continuar daqui</Button> : undefined}>
            {error}
          </Alert>
        )}
      </Card>

      {project && html && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          {project.brief.perguntas.length > 0 && (
            <Alert severity="info">
              <b>O agente tem {project.brief.perguntas.length === 1 ? "uma pergunta" : `${project.brief.perguntas.length} perguntas`}</b> que mudariam decisões relevantes. Responda nos campos acima e clique em “Gerar novamente”:
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {project.brief.perguntas.map((q, i) => (<li key={i}>{q}</li>))}
              </Box>
            </Alert>
          )}
          {project.brief.divergencias.length > 0 && (
            <Alert severity="warning">
              <b>Divergências entre as fontes:</b>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {project.brief.divergencias.map((d, i) => (<li key={i}>{d}</li>))}
              </Box>
            </Alert>
          )}
          {(data.avisosMatriz ?? []).length > 0 && <Alert severity="info">{(data.avisosMatriz ?? []).join(" ")}</Alert>}

          <Card variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <Chip size="small" label={`${project.motivos.length} motivos de compra`} />
                <Chip size="small" label={`${project.celulas.length} territórios`} />
                <Chip size="small" label={`${project.briefings.length} criativos na fila`} />
                {avg !== null && verdict && (
                  <Chip size="small" color={verdict.tone === "critico" ? "error" : verdict.tone === "atencao" ? "warning" : "success"} label={`Health Score ${avg.toFixed(1).replace(".", ",")}/10 · ${verdict.label}`} />
                )}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <Button variant="contained" size="small" startIcon={<Download size={14} />} onClick={downloadHtml}>Baixar HTML</Button>
                <Button variant="outlined" size="small" startIcon={<Printer size={14} />} onClick={printPdf}>Salvar como PDF</Button>
              </Stack>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              Em “Salvar como PDF”, escolha “Salvar como PDF” como impressora na janela que abrir. Os mockups são editáveis: clique no texto da headline ou do CTA para ajustar antes de baixar o HTML.
            </Typography>
          </Card>

          <Box component="iframe" ref={iframeRef} title="Matriz Criativa de Black Friday" srcDoc={html} sandbox="allow-same-origin allow-modals" sx={{ width: "100%", height: "78vh", border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "#fff" }} />
        </Stack>
      )}
    </Box>
  );
}
