import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getAffiliateProgramFn, submitAffiliateSignupFn } from "@/lib/affiliates.functions";

export const Route = createFileRoute("/seja-afiliada")({
  head: () => ({
    meta: [
      { title: "Seja afiliada | Mania de Mulher" },
      { name: "description", content: "Divulgue a Mania de Mulher nas suas redes e ganhe comissão por cada venda." },
    ],
  }),
  component: SejaAfiliada,
});

const dayLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function SejaAfiliada() {
  const program = useServerFn(getAffiliateProgramFn);
  const submit = useServerFn(submitAffiliateSignupFn);
  const { data } = useQuery({ queryKey: ["affiliate-program"], queryFn: () => program() });

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [acceptedAds, setAcceptedAds] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          name,
          whatsapp,
          email: email.trim() || null,
          instagram: instagram.trim() || null,
          tiktok: tiktok.trim() || null,
          pixKey: pixKey.trim() || null,
          acceptTerms: true,
          acceptAds: true,
          website,
        },
      }),
    onSuccess: (r) => {
      if (!r.success) setError(r.error);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Não foi possível enviar. Tente de novo."),
  });

  const done = mutation.data?.success === true;
  const from = data?.salesStart ? dayLabel(data.salesStart) : null;
  const until = data?.salesEnd ? dayLabel(data.salesEnd) : null;
  const windowText = from || until ? `Vale para vendas ${from ? `a partir de ${from}` : ""}${from && until ? " " : ""}${until ? `até ${until}` : ""}.` : null;
  const adsDays = data?.adsAuthorizationDays ?? 5;
  const closed = data ? !data.open : false;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: { xs: 3, md: 6 }, px: 2 }}>
      <Box sx={{ maxWidth: 520, mx: "auto" }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          Seja afiliada Mania de Mulher
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Poste nossos produtos nas suas redes e ganhe {data?.commissionPct != null ? `${data.commissionPct}%` : "comissão"} de cada venda feita com o seu cupom exclusivo.{data?.campaignName ? ` Campanha: ${data.campaignName}.` : ""}
        </Typography>

        {closed ? (
          <Alert severity="info">As inscrições de afiliadas estão fechadas no momento. Fique de olho: avisamos quando abrir uma nova campanha.</Alert>
        ) : done ? (
          <Alert severity="success">Cadastro recebido! Vamos analisar e, quando for aprovado, você recebe seu cupom e o link do seu painel pelo WhatsApp.</Alert>
        ) : (
          <Stack
            component="form"
            spacing={2}
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              mutation.mutate();
            }}
          >
            <TextField label="Seu nome completo" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <TextField label="WhatsApp com DDD" required value={whatsapp} onChange={(e) => setWhatsapp(formatPhone(e.target.value))} autoComplete="tel" placeholder="(31) 99999-9999" slotProps={{ htmlInput: { inputMode: "tel" } }} />
            <TextField label="E-mail (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <TextField label="Instagram (@)" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@seuperfil" />
            <TextField label="TikTok (@)" value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="@seuperfil" helperText="Informe pelo menos uma rede." />
            <TextField label="Chave PIX para receber (opcional agora)" value={pixKey} onChange={(e) => setPixKey(e.target.value)} helperText="CPF, e-mail, telefone ou chave aleatória. Pode informar depois." />
            {/* Campo-isca para robôs: escondido de quem usa a página. */}
            <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} style={{ position: "absolute", left: "-9999px", opacity: 0 }} aria-hidden="true" />

            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Como funciona
              </Typography>
              <Typography variant="caption" component="div" color="text.secondary">
                • Depois de aprovada, você recebe um cupom exclusivo (e o cliente ganha desconto ao usar).
                <br />• A comissão é de {data?.commissionPct != null ? `${data.commissionPct}%` : "—"}
                {data?.campaignName ? ` (campanha ${data.campaignName})` : ""} sobre o valor dos produtos (sem frete) de pedidos pagos com o seu cupom.
                <br />• A comissão fica liberada {data ? `${data.holdDays} dias` : "alguns dias"} depois do pedido, para cobrir cancelamento e devolução; pedidos cancelados ou devolvidos não geram comissão.
                <br />• O pagamento é feito por PIX. Compra feita por você com o seu próprio cupom não gera comissão.
                {windowText && (
                  <>
                    <br />• {windowText}
                  </>
                )}
                <br />• Autorizo a Mania de Mulher a usar, por {adsDays} dias, os vídeos e posts que eu publicar divulgando os produtos em anúncios pagos (Ads).
                <br />• O cadastro passa por aprovação da Mania de Mulher.
              </Typography>
            </Box>

            <FormControlLabel control={<Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />} label="Li e concordo com as regras acima" />
            <FormControlLabel
              control={<Checkbox checked={acceptedAds} onChange={(e) => setAcceptedAds(e.target.checked)} />}
              label={`Autorizo o uso dos meus vídeos e posts sobre a Mania de Mulher em anúncios (Ads) por ${adsDays} dias`}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={!accepted || !acceptedAds || mutation.isPending}>
              {mutation.isPending ? "Enviando…" : "Quero ser afiliada"}
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
