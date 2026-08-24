# Régua CRM 1ª compra → 2ª compra

Implementação isolada da lógica RFM existente, voltada a transformar a análise em ação sem alterar a classificação RFM nem disparar mensagens automaticamente.

## Reuso
- `src/lib/crm-rfm-shared.ts` permanece como fonte única da definição de pedido válido.
- Dados operacionais vêm de `shopify_orders`, `shopify_customers` e `shopify_order_items`.
- Server functions usam `requireAppAuth`.
- Nenhum envio, campanha ativa ou cron é criado/ativado.
- A audiência é dinâmica: exatamente 1 pedido válido = pendente; a 2ª compra válida move o cliente para convertido na próxima leitura/sync.

## Componentes
- `crm-repurchase-shared.ts`: jornada, janelas, métricas, coortes e validação pura da atribuição.
- `crm-repurchase.functions.ts`: consultas autenticadas, contexto de campanha, rascunho seguro e sugestão por IA.
- `/crm/reguas/primeira-segunda`: dashboard, funil, filtros, clientes, meta e coortes.
- `crm-repurchase-shared.test.ts`: testes unitários da regra de negócio.
- `.github/workflows/crm-repurchase-ci.yml`: testes + build + typecheck do módulo.

## Janelas
- 0–7 dias
- 8–15 dias
- 16–30 dias
- 31–60 dias
- 61–90 dias
- 90+ dias

Essas faixas são estágios de jornada e não rótulos de churn.

## Atribuição
A conversão NÃO pode ser atribuída a uma campanha apenas porque a compra ocorreu depois do envio. A arquitetura exige evidência rastreável, como cupom, link rastreado, landing específica, resposta explícita ou validação manual.

Campos preparados: `campaign_source`, `campaign_id`, `customer_id`, `stage`, `channel`, `sent_at`, `converted_at`, `order_id`, `revenue`, `conversion_window_days`, `attribution_evidence`, `attribution_reference` e `evidence_payload`.

## Banco
A audiência e as métricas da régua não exigem tabela nova; são derivadas das tabelas Shopify existentes.

Foi adicionada apenas uma migration para a persistência FUTURA de atribuição auditável: `20260824143000_add_crm_repurchase_attributions.sql`.

A tabela dedicada é necessária porque:
- `crm_events` não possui `customer_id`, `campaign_id`, `order_id`, receita ou evidência de atribuição;
- `whatsapp_campaign_recipients` registra entrega/leitura, mas não pedido convertido, receita/evidência e é específico de WhatsApp;
- a atribuição precisa funcionar também para UazAPI, e-mail, cupom e outros canais.

A migration não altera dados históricos, não cria automações e não dispara mensagens. Ela fica protegida por RLS, sem acesso direto de `anon`/`authenticated`; uso previsto apenas no backend/service role.

## Segurança de campanha
- `Criar campanha` gera somente um rascunho não persistido.
- `sendingEnabled` permanece `false`.
- A IA apenas sugere conteúdo para aprovação humana.
- Nenhuma função desta feature chama Queue, Meta WhatsApp, UazAPI ou e-mail para envio.
- Nenhum cron é incluído nesta feature.

## Meta
O painel exibe inicialmente uma meta de 15% de conversão da 1ª para a 2ª compra. Nesta fase ela é uma constante de produto e pode ser migrada para configuração persistida futuramente.
