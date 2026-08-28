import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Prêmios da Roleta</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Cor</th>
                  <th className="px-3 py-2 font-medium">Nome na Roleta</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Código do Cupom</th>
                  <th className="px-3 py-2 font-medium">Prob. %</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {prizes.map((prize, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-3 py-2">
                      <Input
                        type="color"
                        className="h-9 w-12 p-1"
                        value={prize.color}
                        onChange={(e) => updatePrize(index, { color: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={prize.label} onChange={(e) => updatePrize(index, { label: e.target.value })} placeholder="Ex.: 20% OFF" />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={prize.type}
                        onValueChange={(value: "coupon" | "no_prize") =>
                          updatePrize(index, { type: value, couponCode: value === "no_prize" ? "" : prize.couponCode })
                        }
                      >
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="coupon">Cupom</SelectItem>
                          <SelectItem value="no_prize">Sem prêmio</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={prize.couponCode}
                        disabled={prize.type === "no_prize"}
                        onChange={(e) => updatePrize(index, { couponCode: e.target.value.toUpperCase() })}
                        placeholder={prize.type === "no_prize" ? "—" : "CÓDIGO"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="w-20"
                        value={prize.probability}
                        onChange={(e) => updatePrize(index, { probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={prizes.length <= MIN_PRIZES}
                        onClick={() => removePrize(index)}
                        title={prizes.length <= MIN_PRIZES ? `A roleta precisa de pelo menos ${MIN_PRIZES} prêmios` : "Remover"}
                      >
                        <Trash2 className="size-4 text-critical" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" className="gap-2" disabled={prizes.length >= MAX_PRIZES} onClick={addPrize}>
              <Plus className="size-4" /> Adicionar prêmio
            </Button>
            <p className={`text-sm font-medium ${isBalanced ? "text-success" : "text-critical"}`}>
              Total: {totalProbability}% {isBalanced ? "✓" : "— ajuste para somar 100%"}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
