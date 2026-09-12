import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { parseContactsCsv, type ContactsImportParseResult } from "@/lib/contacts-import-shared";
import { importContacts } from "@/lib/contacts-import.functions";

export function ImportContactsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [parsed, setParsed] = useState<ContactsImportParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const runImport = useServerFn(importContacts);
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  const validRows = useMemo(() => parsed?.rows.filter((r) => r.errors.length === 0) ?? [], [parsed]);
  const invalidRows = useMemo(() => parsed?.rows.filter((r) => r.errors.length > 0) ?? [], [parsed]);

  function reset() {
    setParsed(null);
    setFileName(null);
    setPasteText("");
    setPasteMode(false);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      let text = new TextDecoder("utf-8").decode(buffer);
      // Arquivos exportados de sistemas legados costumam vir em Latin-1/Windows-1252.
      if (text.includes("�")) {
        text = new TextDecoder("windows-1252").decode(buffer);
      }
      const result = parseContactsCsv(text);
      if (result.rows.length === 0) {
        toast.error("Nenhuma linha de contato encontrada no arquivo.");
        return;
      }
      setParsed(result);
      setFileName(file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  function handleParsePaste() {
    const result = parseContactsCsv(pasteText);
    if (result.rows.length === 0) {
      toast.error("Nenhuma linha de contato encontrada.");
      return;
    }
    setParsed(result);
    setFileName("dados colados");
  }

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    const batches = Array.from(
      { length: Math.ceil(validRows.length / 2000) },
      (_, index) => validRows.slice(index * 2000, (index + 1) * 2000),
    );
    setImportProgress({ current: 0, total: batches.length });
    try {
      const totalSummary = { imported: 0, updated: 0, skipped: 0 };
      for (let index = 0; index < batches.length; index++) {
        const batch = batches[index];
        if (!batch) continue;
        setImportProgress({ current: index + 1, total: batches.length });
        const summary = await runImport({
          data: {
            rows: batch.map((r) => ({
              line: r.line,
              nome: r.nome,
              email: r.email,
              phone: r.phone,
              tags: r.tags,
              lastPurchaseAt: r.lastPurchaseAt,
            })),
          },
        });
        totalSummary.imported += summary.imported;
        totalSummary.updated += summary.updated;
        totalSummary.skipped += summary.skipped;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm-customers"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-stats"] }),
      ]);
      toast.success(
        `Importação concluída: ${totalSummary.imported} novos, ${totalSummary.updated} atualizados` +
          (totalSummary.skipped > 0 ? `, ${totalSummary.skipped} ignorados` : ""),
      );
      onOpenChange(false);
      reset();
    } catch (err: unknown) {
      toast.error("Erro na importação: " + (err instanceof Error ? err.message : "falha inesperada"));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        onOpenChange(false);
        reset();
      }}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { maxHeight: "85vh" } } }}
    >
      <DialogTitle>Importar contatos</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Envie um CSV ou cole os dados com as colunas: <strong>nome, email, telefone, tag, data da última compra</strong>.
          Aceita separador por vírgula, ponto-e-vírgula ou tab; datas em dd/mm/aaaa ou ISO.
        </Typography>

        {!parsed && !pasteMode && (
          <Stack spacing={2}>
            <Box
              component="button"
              onClick={() => fileRef.current?.click()}
              sx={{
                width: "100%",
                borderRadius: 3,
                border: "2px dashed",
                borderColor: "divider",
                p: 5,
                textAlign: "center",
                cursor: "pointer",
                bgcolor: "transparent",
                transition: "all 0.15s",
                "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
              }}
            >
              <Upload size={32} style={{ margin: "0 auto 12px" }} color="var(--mui-palette-text-secondary)" />
              <Typography sx={{ fontWeight: 500 }}>Clique para escolher o arquivo CSV</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Listas grandes são processadas automaticamente em lotes seguros
              </Typography>
            </Box>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" fullWidth startIcon={<ClipboardPaste size={16} />} onClick={() => setPasteMode(true)}>
              Colar dados manualmente
            </Button>
          </Stack>
        )}

        {!parsed && pasteMode && (
          <Stack spacing={1.5}>
            <TextField
              fullWidth
              multiline
              rows={10}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"nome;email;telefone;tag;data da ultima compra\nMaria;maria@ex.com;31999998888;VIP;15/08/2026"}
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
            />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setPasteMode(false)}>Voltar</Button>
              <Button variant="contained" onClick={handleParsePaste} disabled={!pasteText.trim()}>Pré-visualizar</Button>
            </Stack>
          </Stack>
        )}

        {parsed && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <FileText size={16} color="var(--mui-palette-text-secondary)" />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{fileName}</Typography>
              <Chip size="small" label={`${parsed.rows.length} linhas`} />
              <Chip size="small" color="success" label={`${validRows.length} válidas`} />
              {invalidRows.length > 0 && <Chip size="small" color="error" label={`${invalidRows.length} com erro`} />}
            </Stack>

            <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, maxHeight: 288, overflow: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Nome</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Telefone</TableCell>
                    <TableCell>Tags</TableCell>
                    <TableCell>Última compra</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsed.rows.slice(0, 200).map((r) => (
                    <TableRow key={r.line} sx={r.errors.length > 0 ? { bgcolor: "error.50" } : undefined}>
                      <TableCell sx={{ color: "text.secondary" }}>{r.line}</TableCell>
                      <TableCell>{r.nome ?? "—"}</TableCell>
                      <TableCell>{r.email ?? "—"}</TableCell>
                      <TableCell>{r.phone ?? "—"}</TableCell>
                      <TableCell>{r.tags.length > 0 ? r.tags.join(", ") : "—"}</TableCell>
                      <TableCell>{r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell>
                        {r.errors.length === 0 ? (
                          <CheckCircle2 size={14} color="var(--mui-palette-success-main, #28C76F)" />
                        ) : (
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "error.main" }}>
                            <AlertTriangle size={14} />
                            <Typography variant="caption">{r.errors.join("; ")}</Typography>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {parsed.rows.length > 200 && (
              <Typography variant="caption" color="text.secondary">
                Mostrando 200 de {parsed.rows.length} linhas na prévia.
              </Typography>
            )}

            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Button variant="ghost" onClick={reset} disabled={importing}>
                Escolher outro arquivo
              </Button>
              <Button
                variant="contained"
                startIcon={importing ? <Loader2 size={16} className="animate-spin" /> : null}
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
              >
                {importing && importProgress
                  ? `Importando lote ${importProgress.current} de ${importProgress.total}`
                  : `Importar ${validRows.length} contatos`}
              </Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
