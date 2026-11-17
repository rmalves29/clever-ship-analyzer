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

export function AffiliateSettingsPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(getAffiliateSettingsFn);
  const save = useServerFn(saveAffiliateSettingsFn);
  const { data, isLoading } = useQuery({ queryKey: ["affiliate-settings"], queryFn: () => load() });

  const [hold, setHold] = useState("10");
  const [adsDays, setAdsDays] = useState("5");

  useEffect(() => {
    if (!data) return;
    setHold(String(data.holdDays));
    setAdsDays(String(data.adsAuthorizationDays));
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { holdDays: Number(hold), adsAuthorizationDays: Number(adsDays) } }),
    onSuccess: () => {
      toast.success("Configurações salvas.");
      void queryClient.invalidateQueries({ queryKey: ["affiliate-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliate-payouts"] });
      void queryClient.invalidateQueries({ queryKey: ["affiliate-program"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  if (isLoading) return <Typography sx={{ p: 3 }} color="text.secondary">Carregando…</Typography>;

  return (
    <Stack spacing={2.5} sx={{ py: 2, maxWidth: 560 }}>
      <Alert severity="info">
        A comissão, o desconto do cupom e o período de vendas ficam em cada <b>campanha</b> (aba Campanhas). Aqui estão as regras que valem para todas.
      </Alert>
      <TextField
        label="Carência (dias após o pedido)"
        size="small"
        value={hold}
        onChange={(e) => setHold(e.target.value)}
        helperText="Depois desse prazo a comissão fica aprovada e pronta para pagar. Cobre cancelamento e devolução."
      />
      <TextField
        label="Autorização de uso dos vídeos em anúncios (dias)"
        size="small"
        value={adsDays}
        onChange={(e) => setAdsDays(e.target.value)}
        helperText="Aparece nas regras e no aceite do cadastro. O aceite de cada afiliada (data e dias) fica gravado."
      />
      <div>
        <Button variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Salvar</Button>
      </div>
    </Stack>
  );
}
