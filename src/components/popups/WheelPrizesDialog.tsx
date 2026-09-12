import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Plus, Trash2 } from "lucide-react";
import { WHEEL_PALETTE, type WheelPrize } from "@/lib/popup-designer";

const MIN_PRIZES = 2;
const MAX_PRIZES = 8;

export function WheelPrizesDialog({
  open,
  onOpenChange,
  prizes,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prizes: WheelPrize[];
  onChange: (prizes: WheelPrize[]) => void;
}) {
  const totalProbability = prizes.reduce((sum, prize) => sum + prize.probability, 0);
  const isBalanced = totalProbability === 100;

  const updatePrize = (index: number, patch: Partial<WheelPrize>) => {
    const next = prizes.map((prize, i) => (i === index ? { ...prize, ...patch } : prize));
    onChange(next);
  };

  const addPrize = () => {
    if (prizes.length >= MAX_PRIZES) return;
    onChange([
      ...prizes,
      { label: "Novo prêmio", color: WHEEL_PALETTE[prizes.length % WHEEL_PALETTE.length]!, type: "coupon", couponCode: "", probability: 0 },
    ]);
  };

  const removePrize = (index: number) => {
    if (prizes.length <= MIN_PRIZES) return;
    onChange(prizes.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} maxWidth="md" fullWidth>
      <DialogTitle>Configurar Prêmios da Roleta</DialogTitle>
      <DialogContent>
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
          <Table sx={{ minWidth: 640 }} size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cor</TableCell>
                <TableCell>Nome na Roleta</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Código do Cupom</TableCell>
                <TableCell>Prob. %</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {prizes.map((prize, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <input
                      type="color"
                      style={{ height: 36, width: 48, padding: 4, border: "1px solid #d1d5db", borderRadius: 6 }}
                      value={prize.color}
                      onChange={(e) => updatePrize(index, { color: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={prize.label}
                      onChange={(e) => updatePrize(index, { label: e.target.value })}
                      placeholder="Ex.: 20% OFF"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      sx={{ width: 144 }}
                      value={prize.type}
                      onChange={(e) =>
                        updatePrize(index, {
                          type: e.target.value as "coupon" | "no_prize",
                          couponCode: e.target.value === "no_prize" ? "" : prize.couponCode,
                        })
                      }
                    >
                      <MenuItem value="coupon">Cupom</MenuItem>
                      <MenuItem value="no_prize">Sem prêmio</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={prize.couponCode}
                      disabled={prize.type === "no_prize"}
                      onChange={(e) => updatePrize(index, { couponCode: e.target.value.toUpperCase() })}
                      placeholder={prize.type === "no_prize" ? "—" : "CÓDIGO"}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      sx={{ width: 80 }}
                      slotProps={{ htmlInput: { min: 0, max: 100 } }}
                      value={prize.probability}
                      onChange={(e) => updatePrize(index, { probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      disabled={prizes.length <= MIN_PRIZES}
                      onClick={() => removePrize(index)}
                      title={prizes.length <= MIN_PRIZES ? `A roleta precisa de pelo menos ${MIN_PRIZES} prêmios` : "Remover"}
                    >
                      <Trash2 size={16} color="var(--mui-palette-error-main, #EA5455)" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mt: 1.5 }}>
          <Button variant="outline" size="small" startIcon={<Plus size={16} />} disabled={prizes.length >= MAX_PRIZES} onClick={addPrize}>
            Adicionar prêmio
          </Button>
          <Typography variant="body2" sx={{ fontWeight: 500, color: isBalanced ? "success.main" : "error.main" }}>
            Total: {totalProbability}% {isBalanced ? "✓" : "— ajuste para somar 100%"}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
