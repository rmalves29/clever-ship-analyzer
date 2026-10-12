import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { importSurveyTrees, type ImportTreeResult } from "@/lib/surveys.functions";

/** Importa árvores de pesquisa de um arquivo JSON: mostra a prévia (o que será criado/trocado e o que falta decidir) e só aplica ao confirmar. */
export function ImportTreesButton() {
  const queryClient = useQueryClient();
  const runImport = useServerFn(importSurveyTrees);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<ImportTreeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);

  const reset = () => {
    setOpen(false);
    setJson("");
    setFileName("");
    setResults(null);
    setApplied(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const res = await runImport({ data: { json: text, apply: false } });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setJson(text);
      setFileName(file.name);
      setResults(res.results);
      setApplied(false);
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const res = await runImport({ data: { json, apply: true } });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setResults(res.results);
      setApplied(true);
      await queryClient.invalidateQueries({ queryKey: ["surveys"] });
      toast.success("Árvores importadas.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="outlined" startIcon={<FileUp size={16} />} onClick={() => fileRef.current?.click()} disabled={busy}>
        Importar árvores
      </Button>
      <Dialog open={open} onClose={busy ? undefined : reset} maxWidth="md" fullWidth>
        <DialogTitle>{applied ? "Importação concluída" : "Importar árvores de pesquisa"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Arquivo: {fileName}. {applied ? "Resultado:" : "Confira o que vai acontecer antes de confirmar."} Pesquisas que já têm respostas nunca são sobrescritas.
          </Typography>
          <Stack spacing={1.5}>
            {results?.map((r) => (
              <Box key={r.slug} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{r.title}</Typography>
                  <Chip size="small" variant="outlined" label={`${r.questions} etapas`} />
                  <Chip size="small" color={r.action === "ignorada" ? "warning" : r.action === "prévia" ? "default" : "success"} label={r.action} />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>/pesquisa/{r.slug}</Typography>
                {r.reason && <Typography variant="body2" sx={{ mt: 0.5 }}>{r.reason}</Typography>}
                {r.warnings.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    <Stack component="ul" sx={{ m: 0, pl: 2.25, gap: 0.25 }}>
                      {r.warnings.map((w, i) => (
                        <li key={i}>
                          {w.node ? `${w.node}: ` : ""}
                          {w.detail}
                        </li>
                      ))}
                    </Stack>
                  </Alert>
                )}
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={reset} disabled={busy}>{applied ? "Fechar" : "Cancelar"}</Button>
          {!applied && (
            <Button variant="contained" onClick={apply} disabled={busy}>
              {busy ? "Importando…" : "Importar"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
