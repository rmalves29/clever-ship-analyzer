import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown-blocks";

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((it, i) =>
        it.code ? (
          <Box key={i} component="code" sx={{ fontFamily: "monospace", fontSize: "0.9em", bgcolor: "action.hover", borderRadius: 0.5, px: 0.5 }}>
            {it.text}
          </Box>
        ) : (
          <Box key={i} component="span" sx={{ fontWeight: it.bold ? 700 : undefined, fontStyle: it.italic ? "italic" : undefined }}>
            {it.text}
          </Box>
        ),
      )}
    </>
  );
}

const HEADING_VARIANT = { 1: "h4", 2: "h5", 3: "h6", 4: "subtitle1" } as const;

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return (
        <Typography variant={HEADING_VARIANT[block.level]} component={`h${Math.min(block.level + 1, 6)}` as "h2"} sx={{ fontWeight: 700, mt: block.level <= 2 ? 3 : 2, mb: 0.5 }}>
          <Inlines items={block.inline} />
        </Typography>
      );
    case "paragraph":
      return (
        <Typography variant="body2" sx={{ lineHeight: 1.65 }}>
          <Inlines items={block.inline} />
        </Typography>
      );
    case "list":
      return (
        <Box component={block.ordered ? "ol" : "ul"} sx={{ m: 0, pl: 3, display: "flex", flexDirection: "column", gap: 0.5 }}>
          {block.items.map((item, i) => (
            <Typography key={i} component="li" variant="body2" sx={{ lineHeight: 1.6 }}>
              <Inlines items={item} />
            </Typography>
          ))}
        </Box>
      );
    case "table":
      return (
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, maxWidth: "100%" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {block.header.map((h, i) => (
                  <TableCell key={i} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                    <Inlines items={h} />
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {block.rows.map((row, r) => (
                <TableRow key={r}>
                  {block.header.map((_, c) => (
                    <TableCell key={c} sx={{ verticalAlign: "top", minWidth: 80 }}>
                      <Inlines items={row[c] ?? []} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    case "quote":
      return (
        <Box sx={{ borderLeft: "3px solid", borderColor: "divider", pl: 2, color: "text.secondary" }}>
          <Typography variant="body2">
            <Inlines items={block.inline} />
          </Typography>
        </Box>
      );
    case "rule":
      return <Box component="hr" sx={{ border: 0, borderTop: "1px solid", borderColor: "divider", width: "100%" }} />;
  }
}

/** Desenha um texto em markdown (títulos, listas, tabelas) sem interpretar HTML. */
export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </Box>
  );
}
