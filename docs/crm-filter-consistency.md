# Consistência dos filtros de compra do CRM

Todos os filtros de comportamento de compra devem usar a mesma regra de pedido válido da matriz RFM (`isRevenueValidOrder`).

Contam como compra: `PAID` e `PARTIALLY_PAID`, desde que o pedido não esteja cancelado.

Não contam para quantidade, gasto, ticket, primeira/última compra, recorrência, compra hoje/24h ou envio hoje: `REFUNDED`, `PARTIALLY_REFUNDED`, `VOIDED`, `EXPIRED`, `CANCELLED/CANCELED`, `PENDING`, `AUTHORIZED`, `UNPAID` e qualquer pedido com `cancelled_at`.

O filtro de status de pagamento continua permitindo localizar estados históricos inválidos (ex.: REFUNDED) para auditoria, mas `PAID`/`PARTIALLY_PAID` só correspondem a pedidos válidos não cancelados.

A lógica dos segmentos é: AND entre condições de um mesmo grupo e OR entre grupos diferentes.
