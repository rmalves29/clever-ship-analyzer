# Régua CRM 1ª compra → 2ª compra

Implementação isolada da lógica RFM existente.

## Reuso
- `src/lib/crm-rfm-shared.ts` permanece como fonte única da definição de pedido válido.
- Dados vêm de `shopify_orders` e `shopify_customers`.
- Server functions usam `requireAppAuth`.
- Nenhum envio, campanha ou cron é ativado.

## Componentes
- `crm-repurchase-shared.ts`: jornada, janelas, métricas e coortes.
- `crm-repurchase.functions.ts`: consultas autenticadas.
- `/crm/reguas/primeira-segunda`: dashboard, funil, lista e coortes.

## Atribuição
A próxima fase deve persistir atribuição somente quando houver evidência auditável. Campos previstos: campaign_id, customer_id, stage, sent_at, converted_at, order_id, revenue, conversion_window e attribution_method. Não atribuir por simples precedência temporal.

## Banco
Esta fase não exige migration: a audiência é dinâmica e derivada dos pedidos válidos. Uma migration só deve ser criada quando a atribuição de campanhas for ativada e após conferir se `crm_events`/estruturas de campanha existentes cobrem os campos necessários.
