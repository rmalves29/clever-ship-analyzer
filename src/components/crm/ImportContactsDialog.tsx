import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { parseContactsCsv, type ContactsImportParseResult } from "@/lib/contacts-import-shared";
import { importContacts } from "@/lib/contacts-import.functions";
import { cn } from "@/lib/utils";

export function ImportContactsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [parsed, setParsed] = useState<ContactsImportParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const runImport = useServerFn(importContacts);
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);

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
      const text = String(reader.result ?? "");
      const result = parseContactsCsv(text);
      if (result.rows.length === 0) {
        toast.error("Nenhuma linha de contato encontrada no arquivo.");
        return;
      }
      setParsed(result);
      setFileName(file.name);
    };
    reader.readAsText(file, "utf-8");
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
    try {
      const summary = await runImport({
        data: {
          rows: validRows.map((r) => ({
            line: r.line,
            nome: r.nome,
            email: r.email,
            phone: r.phone,
            tags: r.tags,
            lastPurchaseAt: r.lastPurchaseAt,
          })),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
      toast.success(
        `Importação concluída: ${summary.imported} novos, ${summary.updated} atualizados` +
          (summary.skipped > 0 ? `, ${summary.skipped} ignorados` : ""),
      );
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error("Erro na importação: " + err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar contatos</DialogTitle>
          <DialogDescription>
            Envie um CSV ou cole os dados com as colunas: <strong>nome, email, telefone, tag, data da última compra</strong>.
            Aceita separador por vírgula, ponto-e-vírgula ou tab; datas em dd/mm/aaaa ou ISO.
          </DialogDescription>
        </DialogHeader>

        {!parsed && !pasteMode && (
          <div className="space-y-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-border p-10 text-center hover:border-brand/50 hover:bg-muted/30 transition-colors"
            >
              <Upload className="size-8 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Clique para escolher o arquivo CSV</p>
              <p className="text-xs text-muted-foreground mt-1">Máximo 2.000 contatos por importação</p>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" className="w-full gap-2" onClick={() => setPasteMode(true)}>
              <ClipboardPaste className="size-4" /> Colar dados manualmente
            </Button>
          </div>
        )}

        {!parsed && pasteMode && (
          <div className="space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              placeholder={"nome;email;telefone;tag;data da ultima compra\nMaria;maria@ex.com;31999998888;VIP;15/08/2026"}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm font-mono"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setPasteMode(false)}>Voltar</Button>
              <Button onClick={handleParsePaste} disabled={!pasteText.trim()}>Pré-visualizar</Button>
            </div>
          </div>
        )}

        {parsed && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <span className="font-medium">{fileName}</span>
              <Badge variant="secondary">{parsed.rows.length} linhas</Badge>
              <Badge className="bg-success-soft text-success border-transparent">{validRows.length} válidas</Badge>
              {invalidRows.length > 0 && (
                <Badge className="bg-critical-soft text-critical border-transparent">{invalidRows.length} com erro</Badge>
              )}
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">#</th>
                      <th className="text-left px-3 py-2 font-medium">Nome</th>
                      <th className="text-left px-3 py-2 font-medium">Email</th>
                      <th className="text-left px-3 py-2 font-medium">Telefone</th>
                      <th className="text-left px-3 py-2 font-medium">Tags</th>
                      <th className="text-left px-3 py-2 font-medium">Última compra</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsed.rows.slice(0, 200).map((r) => (
                      <tr key={r.line} className={cn(r.errors.length > 0 && "bg-critical-soft/40")}>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.line}</td>
                        <td className="px-3 py-1.5">{r.nome ?? "—"}</td>
                        <td className="px-3 py-1.5">{r.email ?? "—"}</td>
                        <td className="px-3 py-1.5">{r.phone ?? "—"}</td>
                        <td className="px-3 py-1.5">{r.tags.length > 0 ? r.tags.join(", ") : "—"}</td>
                        <td className="px-3 py-1.5">
                          {r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.errors.length === 0 ? (
                            <CheckCircle2 className="size-3.5 text-success" />
                          ) : (
                            <span className="flex items-center gap-1 text-critical">
                              <AlertTriangle className="size-3.5" /> {r.errors.join("; ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 200 && (
                <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                  Mostrando 200 de {parsed.rows.length} linhas na prévia.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={reset} disabled={importing}>
                Escolher outro arquivo
              </Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0} className="gap-2">
                {importing && <Loader2 className="size-4 animate-spin" />}
                Importar {validRows.length} contatos
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
