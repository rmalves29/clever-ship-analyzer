import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | CRM Insights" },
      { name: "description", content: "Acesso restrito ao painel de CRM, campanhas e operações da loja." },
      { property: "og:title", content: "Entrar | CRM Insights" },
      { property: "og:description", content: "Acesso restrito ao painel de CRM, campanhas e operações da loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // O login passa pelo servidor (/api/auth/login), que limita as tentativas por IP e por conta.
    let tokens: { access_token?: string; refresh_token?: string; error?: string } = {};
    let status = 0;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      status = res.status;
      tokens = await res.json().catch(() => ({}));
    } catch {
      setLoading(false);
      setError("Não foi possível entrar agora. Verifique a conexão e tente de novo.");
      return;
    }
    if (status === 429) {
      setLoading(false);
      setError("Muitas tentativas de login. Aguarde alguns minutos e tente de novo.");
      return;
    }
    if (!tokens.access_token || !tokens.refresh_token) {
      setLoading(false);
      setError(tokens.error === "Invalid login credentials" ? "E-mail ou senha incorretos." : (tokens.error ?? "Não foi possível entrar."));
      return;
    }
    const { error: sessionError } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
    setLoading(false);
    if (sessionError) {
      setError(sessionError.message);
      return;
    }
    navigate({ to: "/", replace: true });
  }

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 384 }}>
        <CardContent sx={{ p: 3 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="Mania de Mulher"
            sx={{ width: 120, height: "auto", display: "block", mx: "auto", mb: 2.5 }}
          />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Entrar
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Acesso restrito à equipe. Não há cadastro aberto.
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                id="email"
                label="E-mail"
                type="email"
                autoComplete="email"
                required
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                id="password"
                label="Senha"
                type="password"
                autoComplete="current-password"
                required
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Button type="submit" variant="contained" fullWidth disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
