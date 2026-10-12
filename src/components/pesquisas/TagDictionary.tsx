import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { buildTagDictionary, type TreeQuestion } from "@/lib/survey-tree";

/** Onde cada etiqueta é gravada (pergunta e resposta), com busca. */
export function TagDictionary({ questions }: { questions: TreeQuestion[] }) {
  const [query, setQuery] = useState("");
  const dictionary = useMemo(() => buildTagDictionary(questions), [questions]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? dictionary.filter((r) => `${r.tag} ${r.when}`.toLowerCase().includes(q)) : dictionary;
  }, [dictionary, query]);

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, p: 2.25, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Dicionário de etiquetas</Typography>
      <Typography variant="body2" color="text.secondary">
        Cada resposta pode gravar etiquetas na resposta da pesquisa; aqui está onde cada uma nasce.
      </Typography>
      <TextField
        size="small"
        type="search"
        placeholder="Buscar etiqueta ou resposta"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        slotProps={{ htmlInput: { "aria-label": "Buscar etiqueta" } }}
      />
      <TableContainer sx={{ maxHeight: 360, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Etiqueta</TableCell>
              <TableCell>Gravada quando</TableCell>
              <TableCell>Pergunta</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ color: "text.secondary", py: 3 }}>
                  {dictionary.length === 0 ? "Esta pesquisa ainda não grava etiquetas. Defina-as na aba Perguntas, em cada resposta." : "Nenhuma etiqueta com esse termo."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={`${r.tag}-${r.questionId}-${i}`}>
                  <TableCell><Chip size="small" variant="outlined" label={r.tag} sx={{ fontFamily: "monospace" }} /></TableCell>
                  <TableCell>{r.when}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", color: "text.secondary" }}>#{r.position}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
