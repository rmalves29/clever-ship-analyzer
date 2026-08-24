# Plano de Segurança — CRM Insights (fase 1, antes de novas funcionalidades)

Auditoria somente de leitura já realizada. Nada foi alterado.

## Estado atual verificado

- Não existe autenticação de usuário: não há rota `/auth` nem pasta `src/routes/_authenticated/`. Todas as telas são públicas.
- 60+ server functions em `src/lib/*.functions.ts`; apenas **uma** (`runWhatsappQueueTick`) usa `requireSupabaseAuth`. Todas as demais são endpoints RPC públicos no site publicado e usam `supabaseAdmin` (service_role, ignora RLS).
- Banco: 42 tabelas, RLS ligada em 38, **0 policies**. 4 tabelas sem RLS: `envio_message_feedback`, `ai_coupons`, `ai_content_queue`, `ai_send_routines`.
- `src/server.ts`: webhook do Instagram valida HMAC do corpo cru; **o webhook do WhatsApp (`/api/whatsapp-webhook`, POST) não valida assinatura nenhuma** — processa qualquer POST anônimo (status de mensagem, mensagens recebidas que disparam fluxo, status de template).
- Ticks (`/api/automations/tick`, `/api/whatsapp/queue-tick`, `/api/envio/*`, `/api/ai-routines/*`) exigem header `X-Automation-Secret`, comparado com `===` (sem comparação de tempo constante).
- `queue-tick` aceita `?provider=mock` e `?dryRun=1` vindos da query string em produção.
- Secrets (Meta access token, App Secret, verify token, Shopify client secret, chave de IA) ficam em texto plano em `store_settings`. As funções de leitura hoje devolvem só flags `has*` — está correto e deve continuar assim.
- Tenancy: `store_settings` tem 1 linha e o código assume "primeira linha". Não há `store_id` nas tabelas — não há isolamento multi-loja, apenas ausência de modelo multi-tenant.
- Preview e Production compartilham o mesmo Supabase, então qualquer endpoint público de preview escreve/lê dados reais de produção.

## CRÍTICO (fazer primeiro, nesta ordem)

1. **Login e gate de rotas** — criar `/auth` (email+senha, sem signup aberto) e mover todas as telas para `src/routes/_authenticated/`, usando o layout gerenciado (`ssr: false`). Tabela `user_roles` + função `has_role` (nunca role no perfil). Sem convite/whitelist, o app publicado continua aberto mesmo com login.
   Arquivos: `src/routes/*` (todas), novo `src/routes/auth.tsx`, novo `src/routes/_authenticated/route.tsx`, migration de `user_roles`.
2. **Proteger as server functions** — adicionar `.middleware([requireSupabaseAuth])` em todas as funções que leem/escrevem dados ou disparam ações externas, e exigir role admin nas destrutivas/credenciais (`store-settings.functions.ts`, `whatsapp-meta.functions.ts` salvar, `admin-maintenance.functions.ts`, `maintenance-scripts.functions.ts`, `crm-sync`, `envio-*`, `flow*`, `meta-ads*`, `ai-*`).
   Risco atual: qualquer pessoa com a URL pode ler todo o CRM, alterar credenciais, disparar campanhas e rodar scripts de manutenção.
3. **HMAC no webhook do WhatsApp** — validar `X-Hub-Signature-256` sobre o corpo cru com o App Secret e comparação de tempo constante, igual ao webhook do Instagram; rejeitar 401 antes de processar. Arquivo: `src/server.ts`.
   Risco atual: terceiros podem forjar status de entrega, mensagens recebidas e disparar fluxos conversacionais (que enviam mensagens reais).
4. **Bloquear os parâmetros de teste em produção** — `?provider=mock` e `?dryRun=1` do `queue-tick` só quando um flag de ambiente/dev estiver ligado. Arquivo: `src/server.ts`, `src/lib/whatsapp-queue.server.ts`.

## ESSENCIAL (logo em seguida)

5. **RLS + GRANTs coerentes** — ligar RLS nas 4 tabelas que estão sem, e definir política explícita: nenhuma tabela com dados de cliente exposta a `anon`; leitura via `authenticated` só onde o app realmente precisar (ou manter tudo pelo servidor e revogar grants de `anon`/`authenticated`). Hoje "0 policies" protege por acidente — precisa virar decisão documentada.
6. **Separar segredo de automação por ambiente** e comparar com `timingSafeEqual`; rotacionar o segredo atual e o token da Meta (já circularam em logs/testes). Arquivo: `src/server.ts` (`checkAutomationSecret`).
7. **Isolar Preview de Production** — no mínimo, marcar origem dos jobs/envios e desabilitar envio real quando a requisição vier do host de preview, evitando que testes disparem WhatsApp aos clientes reais.
8. **Tirar secrets de `store_settings`** — mover Meta access token, App Secret, verify token, Shopify client secret e chave de IA para Secrets do projeto (`process.env`), mantendo em `store_settings` apenas identificadores não sensíveis. Arquivos: `whatsapp-meta.server.ts`, `shopify.server.ts`, `store-settings.functions.ts`, `configuracoes.tsx`.
9. **Rate limit + validação nos endpoints públicos** — limite por IP nos webhooks e nos redirecionadores `/r/:slug` e link rastreado, que hoje aceitam qualquer entrada.

## MELHORIA

10. **Modelo de tenant** — coluna `store_id` nas tabelas de dados e resolução explícita de loja em vez de "primeira linha de `store_settings`", preparando multi-loja sem acesso cruzado.
11. **Auditoria** — tabela `audit_log` para ações sensíveis (salvar credenciais, aprovar campanha, disparar fila, scripts de manutenção) com usuário e horário.
12. **Higiene de logs** — revisar `console.error` que imprime payloads de webhook/provider; logar apenas identificadores.
13. **CSP e headers de segurança** na resposta do documento raiz; revisar CORS dos endpoints públicos.
14. **Retenção de dados** — política de expurgo para eventos de envio, checkouts abandonados e logs de fluxo.

## Ordem segura de execução

Fase A (1 → 2 → 3 → 4): fecha a superfície de ataque sem mexer em dados.
Fase B (5 → 6 → 7): endurece banco, segredos e separação de ambientes; exige rotacionar credenciais e reconfigurar o webhook na Meta.
Fase C (8 → 9): migração de secrets e proteção dos endpoints públicos restantes.
Fase D (10 → 14): melhorias estruturais e de governança.

Cada fase termina com build/typecheck e um teste funcional das telas afetadas. Nenhuma alteração de código foi feita neste plano.
