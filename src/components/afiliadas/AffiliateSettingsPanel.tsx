import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getAffiliateSettingsFn, saveAffiliateSettingsFn } from "@/lib/affiliates.functions";
import { dayEndIso, dayStartIso, isoToDay } from "./format";

export function AffiliateSettingsPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(getAffiliateSettingsFn);
  const save = useServerFn(saveAffiliateSettingsFn);
  const { data, isLoading } = useQuery({ queryKey: ["affiliate-settings"], queryFn: () => load() });

  const [commission, setCommission] = useState("15");
  const [discount, setDiscount] = useState("5");
  const [hold, setHold] = useState("10");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!data) return;
    setCommission(String(data.commissionPct));
    setDiscount(String(data.discountPct));
    setHold(String(data.holdDays));
    setFrom(isoToDay(data.windowStart));
    setTo(isoToDay(data.windowEnd));
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          commissionPct: Number(commission.replace(",", ".")),
          discountPct: Number(discount.replace(",", ".")),
          holdDays: Number(hold),
          windowStart: dayStartIso(from),
          windowEnd: dayEndIso(to),
        },
      }),
    onSuccess: () => {
      toast.success("Configurações salvas.");
      void queryClient.invalidateQueries({ queryKey: ["affiliate-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliate-payouts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  if (isLoading) return <Typography sx={{ p: 3 }} color="text.secondary">Carregando…</Typography>;

  return (
    <Stack spacing={2.5} sx={{ py: 2, maxWidth: 560 }}>
      <Alert severity="info">
        Esses valores são o padrão para <b>novas</b> afiliadas e as regras de cálculo da comissão. A comissão de cada afiliada pode ser ajustada na aba Afiliadas.
      </Alert>
      <TextField label="Comissão padrão (%)" size="small" value={commission} onChange={(e) => setCommission(e.target.value)} helperText="Calculada sobre o valor dos produtos, já com desconto e sem frete." />
      <TextField label="Desconto para o cliente no cupom da afiliada (%)" size="small" value={discount} onChange={(e) => setDiscount(e.target.value)} helperText="Mínimo 1% (a Shopify não aceita cupom sem desconto). Vale só para cupons criados daqui para frente." />
      <TextField label="Carência (dias após o pedido)" size="small" value={hold} onChange={(e) => setHold(e.target.value)} helperText="Depois desse prazo a comissão fica aprovada e pronta para pagar. Cobre cancelamento e devolução." />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField type="date" label="Vendas a partir de" size="small" fullWidth value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="date" label="Vendas até" size="small" fullWidth value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Período em que a comissão vale (horário de Brasília). Para pagar só no dia da Black Friday, coloque a mesma data nos dois campos. Em branco = sempre. Pedidos fora do período aparecem em "Fora do período" e não geram comissão. Cupons criados depois deixam de funcionar na loja ao fim do período.
      </Typography>
      <div>
        <Button variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Salvar</Button>
      </div>
    </Stack>
  );
}
