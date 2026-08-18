# Plano para Correção de Segmentação e Exportação de Contatos

Este plano descreve as correções no motor de segmentação para garantir que os filtros (especialmente de leads/compras) funcionem corretamente e a implementação da funcionalidade de exportação de contatos.

## Problemas Identificados
- **Filtro de Leads:** A contagem de 44 contatos como leads parece incorreta se a base total é de 44 e há clientes com compras. A lógica de `not in` precisa garantir que o filtro de IDs não falhe se a lista estiver vazia ou mal formatada.
- **Outros Filtros:** Operadores de comparação numérica (como total de pedidos > X) precisam ser validados.
- **Exportação:** Não existe funcionalidade para baixar a lista de clientes segmentados.

## Ações

### 1. Servidor: Refinar Motor de Segmentação
- Atualizar `getCustomersList` e `getSegmentsList` em `src/lib/crm-segmentation.functions.ts`.
- Garantir que `customersWithOrdersList` contenha apenas IDs válidos.
- Corrigir a lógica de `total_pedidos` para suportar operadores `eq`, `neq`, `gt`, `gte`, `lt`, `lte`.
- Implementar uma nova Server Function `exportSegmentCustomers` que retorne todos os clientes de um segmento (sem paginação) formatados para CSV.

### 2. Frontend: Interface de Exportação
- Adicionar um botão "Exportar Lista" no `src/routes/crm/index.tsx`.
- O botão aparecerá quando um segmento estiver selecionado ou na aba de contatos geral.
- Implementar a lógica de download de arquivo CSV no cliente.

### 3. Melhorar Feedback Visual
- Adicionar estados de carregamento claros durante a exportação.

## Detalhes Técnicos
- **CSV:** Geração manual de string CSV (RFC 4180) para evitar dependências pesadas.
- **Query Supabase:** Uso de `.select("*")` sem range para exportação completa, respeitando os filtros do segmento.
