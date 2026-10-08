# Deploy na Vercel + Supabase próprio

O código **não precisa de alteração** para rodar na Vercel: o Nitro detecta o ambiente
(`VERCEL=1`) e gera o formato `.vercel/output` sozinho. Local: `NITRO_PRESET=vercel npx vite build`.
No Lovable continua gerando Cloudflare (preset padrão do wrapper) — as duas hospedagens convivem.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Nome | Origem |
|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | URL do projeto Supabase novo |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | chave anon/publishable do projeto novo |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role do projeto novo (nunca expor ao navegador) |
| `VITE_SUPABASE_PROJECT_ID` | ref do projeto novo |
| `NITRO_PRESET` | `vercel` (garantia, caso a detecção automática falhe) |
| `APP_AUTH_ENABLED` | igual ao valor atual |
| `LOVABLE_API_KEY`, `GOOGLE_DRIVE_API_KEY` | opcionais — só o export frio de eventos de grupo (no-op sem eles) |

Credenciais de Shopify, Meta, UazAPI, OpenAI etc. ficam em `store_settings` no banco: migram junto com os dados.

## Crons (pg_cron no Supabase novo → net.http_post)
Recriar apontando para o domínio novo: `/api/automations/tick`, `/api/whatsapp/queue-tick`,
`/api/envio/process-scheduled`, `/api/envio/return-dispatch`, `/api/envio/cleanup-events`,
`/api/crm/sync-tick`, `/api/ai-routines/tick`, `/api/ai-routines/playbook-tick`, `/api/events/daily-analysis`.

## Webhooks externos a repontar
`/api/whatsapp-webhook` (Meta), `/api/instagram-webhook` (Meta), `/api/uazapi-webhook` (UazAPI),
webhooks do Shopify e `/api/popup/*` (snippet do pop-up na loja — URL do loader muda).

## Tempo de função
Ajustar Max Duration em Vercel → Settings → Functions (sincronização Shopify, envios em lote).
