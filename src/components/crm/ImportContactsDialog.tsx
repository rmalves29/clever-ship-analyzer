import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importContactsCsv } from "@/lib/crm-import.functions";

type ParsedRow = { name: string | null; phone: string; email: string | null; tag: string | null };
type ParsedCsv = { rows: ParsedRow[]; errors: string[] };

/** CSV bem simples (vírgula ou ponto-e-vírgula, campos entre aspas quando precisa) — cobre o
 *  modelo baixado aqui e a exportação padrão de Excel/Google Sheets em português. Nome, e-mail e
 *  tag são todos opcionais — só telefone é obrigatório. */
function parseContactsCsv(text: string): ParsedCsv {
  const cleaned = text.replace(/^﻿/, "").trim();
  if (!cleaned) return { rows: [], errors: ["Arquivo vazio."] };
  const lines = cleaned.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  const delimiter = lines[0]!.includes(";") && !lines[0]!.includes(",") ? ";" : ",";

  function splitLine(line: string): string[] {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = false;
        } else current += char;
      } else if (char === '"') inQuotes = true;
      else if (char === delimiter) { cells.push(current); current = ""; }
      else current += char;
    }
    cells.push(current);
    return cells.map((c) => c.trim());
  }

  const firstCells = splitLine(lines[0]!);
  const header = firstCells.map((h) => h.toLowerCase());
  const phoneIdx = header.findIndex((h) => h.includes("telefone") || h.includes("whatsapp") || h.includes("phone") || h.includes("celular"));
  const nameIdx = header.findIndex((h) => h.includes("nome") || h.includes("name"));
  const emailIdx = header.findIndex((h) => h.includes("email") || h.includes("e-mail"));
  const tagIdx = header.findIndex((h) => h.includes("tag") || h.includes("etiqueta"));
  const hasHeader = phoneIdx !== -1;

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const resolvedPhoneIdx = hasHeader ? phoneIdx : firstCells.length > 1 ? 1 : 0;
  const resolvedNameIdx = hasHeader ? nameIdx : firstCells.length > 1 ? 0 : -1;

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  dataLines.forEach((line, i) => {
    const cells = splitLine(line);
    const phone = cells[resolvedPhoneIdx]?.trim();
    const name = resolvedNameIdx >= 0 ? cells[resolvedNameIdx]?.trim() || null : null;
    const email = hasHeader && emailIdx >= 0 ? cells[emailIdx]?.trim() || null : null;
    const tag = hasHeader && tagIdx >= 0 ? cells[tagIdx]?.trim() || null : null;
    if (!phone) {
      errors.push(`Linha ${i + (hasHeader ? 2 : 1)}: sem telefone.`);
      return;
    }
    rows.push({ name, phone, email, tag });
  });
  return { rows, errors };
}

function downloadTemplate() {
  const csv = "Nome,Telefone,Email,Tag\nMaria Silva,+5511999999999,maria@email.com,VIP\nJoão Souza,11988887777,,\n";
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo-importacao-contatos.csv";
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ImportContactsDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const runImport = useServerFn(importContactsCsv);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [tag, setTag] = useState(() => `Importado ${new Date().toLocaleDateString("pt-BR")}`);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFileName(null);
    setParsed(null);
    setBusy(false);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    setParsed(parseContactsCsv(text));
  };

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    if (!tag.trim()) {
      toast.error("Dê um nome pra essa importação (vira uma tag pra usar em Segmentos).");
      return;
    }
    setBusy(true);
    try {
      const res = await runImport({ data: { tag: tag.trim(), rows: parsed.rows } });
      if (!res.success) {
        toast.error("Falha ao importar.");
        return;
      }
      const errorCount = res.rows.filter((r) => r.status === "error").length;
      toast.success(`${res.created} contato(s) novo(s), ${res.updated} atualizado(s)${errorCount ? `, ${errorCount} com erro` : ""}.`);
      onImported();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error("Erro ao importar: " + (err instanceof Error ? err.message : "falha desconhecida"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Importar contatos</DialogTitle>
        <DialogDescription>
          Suba uma lista de nome e telefone — cada contato entra (ou é atualizado, se já existir) na base com uma tag,
          pra você montar um segmento e usar numa campanha de WhatsApp API depois.
        </DialogDescription>

        <div className="space-y-4">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
            <Download className="size-3.5" /> Baixar modelo (.csv)
          </Button>

          <div className="space-y-1.5">
            <Label className="text-xs">Arquivo CSV</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tag desta leva (aplicada em todos — some com a tag da coluna "Tag" do CSV, se tiver)</Label>
            <Input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={60} />
          </div>

          {parsed && (
            <div className="rounded-lg border border-border p-3 text-sm space-y-1">
              <p className="font-medium">{parsed.rows.length} contato(s) prontos pra importar</p>
              {parsed.errors.length > 0 && (
                <div className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-critical">
                  {parsed.errors.slice(0, 10).map((e, i) => <p key={i}>{e}</p>)}
                  {parsed.errors.length > 10 && <p>+ {parsed.errors.length - 10} outra(s) linha(s) com erro.</p>}
                </div>
              )}
              {parsed.rows.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                  {parsed.rows.slice(0, 5).map((r, i) => (
                    <p key={i}>
                      {r.name ? `${r.name} — ` : ""}{r.phone}
                      {r.email ? ` · ${r.email}` : ""}
                      {r.tag ? ` · tag: ${r.tag}` : ""}
                    </p>
                  ))}
                  {parsed.rows.length > 5 && <p>+ {parsed.rows.length - 5} outro(s)...</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={busy || !parsed || parsed.rows.length === 0} onClick={handleImport}>
            {busy ? "Importando..." : parsed ? `Importar ${parsed.rows.length} contato(s)` : "Importar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
