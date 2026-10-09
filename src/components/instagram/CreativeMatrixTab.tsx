import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { alpha } from "@mui/material/styles";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { ChipProps } from "@mui/material/Chip";
import { generateCreativeMatrix } from "@/lib/creative-matrix.functions";
import { CreativeIdeasPanel, type GeneratedIdeas } from "./CreativeIdeasPanel";
import { downloadCreativeReportPdf } from "@/lib/creative-report-pdf";
import type { CreativeMatrixResult } from "@/lib/creative-matrix.server";
import {
  ANGLE_LABEL,
  CATEGORY_LABEL,
  cellKey,
  type Angle,
  type Category,
  type PostCell,
} from "@/lib/creative-matrix-shared";
import type { InstagramDatePreset } from "@/lib/instagram.server";

const TONE_COLOR: Record<string, ChipProps["color"]> = {
  positivo: "success",
  atencao: "warning",
  critico: "error",
};

const percent = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const num = (v: number) => Math.round(v).toLocaleString("pt-BR");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const roasText = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}x`);
const angleLabel = (a: string) => ANGLE_LABEL[a as Angle] ?? a;
const categoryLabel = (c: string) => CATEGORY_LABEL[c as Category] ?? c;

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      {children}
    </Card>
  );
}

function CellContent({ cell }: { cell: PostCell | undefined }) {
  if (!cell || cell.n === 0) return <Typography variant="caption" color="text.disabled">—</Typography>;
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{percent(cell.engagementRate)}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
        {cell.n} {cell.n === 1 ? "post" : "posts"} · alcance {num(cell.avgReach)}
      </Typography>
    </Box>
  );
}

export function CreativeMatrixTab({ datePreset }: { datePreset: InstagramDatePreset }) {
  const runGenerate = useServerFn(generateCreativeMatrix);
  const [result, setResult] = useState<CreativeMatrixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<GeneratedIdeas | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleDownloadPdf = async () => {
    if (!result) return;
    setExporting(true);
    try {
      await downloadCreativeReportPdf(result, ideas?.items ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? `Falha ao gerar o PDF: ${error.message}` : "Falha ao gerar o PDF.");
    } finally {
      setExporting(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await runGenerate({ data: { datePreset } });
      if (!res.success) {
        toast.error(res.error || "Falha ao montar a matriz.");
        return;
      }
      setIdeas(null);
      setResult(res.result);
      toast.success("Matriz criativa pronta.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao montar a matriz.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ maxWidth: 720 }}>
            <Typography sx={{ fontWeight: 600 }}>Matriz criativa</Typography>
            <Typography variant="caption" color="text.secondary">
              {result
                ? `Gerada em ${new Date(result.generatedAt).toLocaleString("pt-BR")} · período: ${result.datePreset}`
                : "Cruza as publicações do Instagram e os anúncios do mesmo período, por formato, ângulo da mensagem e produto."}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              A IA só classifica cada peça (pela legenda; anúncios, pelo nome). Todas as taxas e o ROAS vêm das métricas reais.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
            {result && (
              <Button variant="outlined" startIcon={<Download size={16} />} onClick={handleDownloadPdf} disabled={exporting}>
                {exporting ? "Gerando PDF…" : ideas ? "Baixar PDF (com ideias)" : "Baixar PDF"}
              </Button>
            )}
            <Button variant="contained" startIcon={<Sparkles size={16} />} onClick={handleGenerate} disabled={loading}>
              {loading ? "Analisando…" : "Analisar e montar matriz"}
            </Button>
          </Stack>
        </Stack>
      </Card>

      {result && <CreativeMatrixView result={result} />}
      {result && (
        <Box sx={{ mt: 2 }}>
          <CreativeIdeasPanel key={result.generatedAt} result={result} generated={ideas} onGenerated={setIdeas} />
        </Box>
      )}
    </Box>
  );
}

export function CreativeMatrixView({ result }: { result: CreativeMatrixResult }) {
  const [showPieces, setShowPieces] = useState(false);
  const postMatrix = result.postMatrix;
  const maxRate = Math.max(0, ...Object.values(postMatrix.cells).map((c) => (c.n > 0 && c.engagementRate !== null ? c.engagementRate : 0)));

  return (
    <>
      <Stack spacing={2} sx={{ mt: 2 }}>
          {result.notices.map((notice, i) => (
            <Alert key={i} severity="info">{notice}</Alert>
          ))}

          <SectionCard>
            <Typography sx={{ fontWeight: 600 }}>Resumo</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{result.resumo}</Typography>
            {result.recomendacoes.length > 0 && (
              <Box component="ul" sx={{ mt: 1, pl: 2.5, mb: 0 }}>
                {result.recomendacoes.map((r, i) => (
                  <Typography key={i} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{r}</Typography>
                ))}
              </Box>
            )}
          </SectionCard>

          <SectionCard>
            <Typography sx={{ fontWeight: 600 }}>Orgânico: formato × ângulo</Typography>
            <Typography variant="caption" color="text.secondary">
              Em cada célula: engajamento (interações ÷ alcance), quantidade de posts e alcance médio. Quanto mais forte a cor, maior o engajamento.
            </Typography>
            <TableContainer sx={{ mt: 1.5 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Formato</TableCell>
                    {postMatrix.angles.map((a) => (
                      <TableCell key={a} sx={{ fontWeight: 600 }}>{angleLabel(a)}</TableCell>
                    ))}
                    <TableCell sx={{ fontWeight: 600 }}>Todos</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {postMatrix.formats.map((f) => (
                    <TableRow key={f}>
                      <TableCell sx={{ fontWeight: 600 }}>{f}</TableCell>
                      {postMatrix.angles.map((a) => {
                        const cell = postMatrix.cells[cellKey(f, a)];
                        const intensity = cell && cell.n > 0 && cell.engagementRate !== null && maxRate > 0 ? cell.engagementRate / maxRate : 0;
                        return (
                          <TableCell
                            key={a}
                            sx={{ bgcolor: (theme) => (intensity > 0 ? alpha(theme.palette.primary.main, 0.08 + intensity * 0.32) : undefined) }}
                          >
                            <CellContent cell={cell} />
                          </TableCell>
                        );
                      })}
                      <TableCell sx={{ bgcolor: "action.hover" }}><CellContent cell={postMatrix.byFormat[f]} /></TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, bgcolor: "action.hover" }}>Todos</TableCell>
                    {postMatrix.angles.map((a) => (
                      <TableCell key={a} sx={{ bgcolor: "action.hover" }}><CellContent cell={postMatrix.byAngle[a]} /></TableCell>
                    ))}
                    <TableCell sx={{ bgcolor: "action.hover" }}><CellContent cell={postMatrix.overall} /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>

          {result.adMatrix && (
            <SectionCard>
              <Typography sx={{ fontWeight: 600 }}>Anúncios × orgânico por ângulo</Typography>
              <Typography variant="caption" color="text.secondary">
                O ROAS só é mostrado como confiável a partir de 3 compras. Compare com o engajamento orgânico do mesmo ângulo.
              </Typography>
              <TableContainer sx={{ mt: 1.5 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Ângulo</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Anúncios</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Gasto</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Compras</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>ROAS</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>CPA</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>CTR link</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Engaj. orgânico</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.adMatrix.angles.map((a) => {
                      const cell = result.adMatrix!.byAngle[a]!;
                      const organic = postMatrix.byAngle[a];
                      return (
                        <TableRow key={a}>
                          <TableCell sx={{ fontWeight: 600 }}>{angleLabel(a)}</TableCell>
                          <TableCell align="right">{cell.n}</TableCell>
                          <TableCell align="right">{brl(cell.spend)}</TableCell>
                          <TableCell align="right">{cell.purchases}</TableCell>
                          <TableCell align="right">
                            {roasText(cell.roas)}
                            {cell.lowData && <Chip size="small" variant="outlined" label="poucos dados" sx={{ ml: 0.75 }} />}
                          </TableCell>
                          <TableCell align="right">{cell.cpa === null ? "—" : brl(cell.cpa)}</TableCell>
                          <TableCell align="right">{percent(cell.ctrLink)}</TableCell>
                          <TableCell align="right">{organic && organic.n > 0 ? `${percent(organic.engagementRate)} (${organic.n})` : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, bgcolor: "action.hover" }}>Conta</TableCell>
                      <TableCell align="right" sx={{ bgcolor: "action.hover" }}>{result.adMatrix.overall.n}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: "action.hover" }}>{brl(result.adMatrix.overall.spend)}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: "action.hover" }}>{result.adMatrix.overall.purchases}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: "action.hover" }}>{roasText(result.adMatrix.overall.roas)}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: "action.hover" }}>{result.adMatrix.overall.cpa === null ? "—" : brl(result.adMatrix.overall.cpa)}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: "action.hover" }}>{percent(result.adMatrix.overall.ctrLink)}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: "action.hover" }}>{percent(postMatrix.overall.engagementRate)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </SectionCard>
          )}

          {Object.keys(postMatrix.byCategory).length > 0 && (
            <SectionCard>
              <Typography sx={{ fontWeight: 600 }}>Por produto</Typography>
              <TableContainer sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Produto</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Posts</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Engaj. orgânico</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Anúncios</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>ROAS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(postMatrix.byCategory).map(([category, cell]) => {
                      const ad = result.adMatrix?.byCategory[category];
                      return (
                        <TableRow key={category}>
                          <TableCell sx={{ fontWeight: 600 }}>{categoryLabel(category)}</TableCell>
                          <TableCell align="right">{cell.n}</TableCell>
                          <TableCell align="right">{percent(cell.engagementRate)}</TableCell>
                          <TableCell align="right">{ad ? ad.n : "—"}</TableCell>
                          <TableCell align="right">
                            {ad ? roasText(ad.roas) : "—"}
                            {ad?.lowData && <Chip size="small" variant="outlined" label="poucos dados" sx={{ ml: 0.75 }} />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </SectionCard>
          )}

          {result.insights.length > 0 && (
            <SectionCard>
              <Typography sx={{ fontWeight: 600 }}>Achados calculados</Typography>
              <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                {result.insights.map((ins, i) => (
                  <Box key={i}>
                    <Chip size="small" color={TONE_COLOR[ins.tone] ?? "default"} label={ins.title} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{ins.text}</Typography>
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          )}

          <SectionCard>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 600 }}>
                Peças classificadas ({result.posts.length} posts{result.ads.length > 0 ? `, ${result.ads.length} anúncios` : ""})
              </Typography>
              <Button size="small" variant="outlined" onClick={() => setShowPieces((v) => !v)}>
                {showPieces ? "Esconder" : "Ver peças"}
              </Button>
            </Stack>
            {showPieces && (
              <TableContainer sx={{ mt: 1.5, maxHeight: 460 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Peça</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Formato</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Ângulo</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Produto</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Resultado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.posts.map((p) => (
                      <TableRow key={`p-${p.id}`}>
                        <TableCell sx={{ maxWidth: 360 }}>
                          {p.permalink ? (
                            <Link href={p.permalink} target="_blank" rel="noopener noreferrer" underline="hover">
                              {p.caption || "(sem legenda)"}
                            </Link>
                          ) : (
                            p.caption || "(sem legenda)"
                          )}
                        </TableCell>
                        <TableCell>{p.format}</TableCell>
                        <TableCell>{angleLabel(p.angle)}</TableCell>
                        <TableCell>{categoryLabel(p.category)}</TableCell>
                        <TableCell align="right">
                          {num(p.reach)} alcance · {p.reach > 0 ? percent(p.totalInteractions / p.reach) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {result.ads.map((a) => (
                      <TableRow key={`a-${a.id}`}>
                        <TableCell sx={{ maxWidth: 360 }}>
                          <Chip size="small" variant="outlined" label="anúncio" sx={{ mr: 0.75 }} />
                          {a.name}
                        </TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>{angleLabel(a.angle)}</TableCell>
                        <TableCell>{categoryLabel(a.category)}</TableCell>
                        <TableCell align="right">{brl(a.spend)} · {a.purchases} compras · {roasText(a.roas)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </SectionCard>
        </Stack>
    </>
  );
}
