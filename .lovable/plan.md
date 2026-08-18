# Plano de Implementação: Análise RFM no CRM

Este plano descreve a implementação da análise RFM (Recência, Frequência e Valor Monetário) dentro do menu CRM, utilizando dados reais da Shopify e seguindo os padrões visuais solicitados.

## 1. Banco de Dados e Backend

*   **RFM Logic**: Criar `src/lib/crm-rfm.functions.ts` para calcular os scores RFM para cada cliente com base no histórico de pedidos:
    *   **Recência**: Dias desde a última compra.
    *   **Frequência**: Número total de pedidos válidos.
    *   **Monetário (Valor)**: LTV (gasto total).
*   **Segmentação RFM**: Implementar a classificação padrão da Shopify:
    *   *Campeões*: Comprou recentemente, com frequência e gastou muito.
    *   *Leais*: Compra com frequência e gasta bem.
    *   *Potencialmente Leais*: Clientes recentes com boa frequência e valor médio.
    *   *Novos*: Compraram recentemente mas não com frequência.
    *   *Precisa de Atenção*: Recência e frequência acima da média, mas não compraram ultimamente.
    *   *Quase Hibernando*: Recência e frequência abaixo da média. Risco de perda.
    *   *Em Risco*: Não compram há muito tempo, mas compraram muito no passado.
    *   *Hibernando*: Última compra faz muito tempo e poucos pedidos.
    *   *Não pode perder*: Compraram muito e com frequência, mas não voltam há tempos.
    *   *Perdidos*: Scores baixos em todos os critérios.
*   **Persistência**: Embora o cálculo possa ser dinâmico, adicionaremos uma coluna `rfm_segment` na tabela `shopify_customers` (via migração SQL) para permitir filtragem rápida.

## 2. Interface do Usuário (Frontend)

*   **RFM Dashboard**: Criar `src/routes/crm/analise-rfm.tsx` (e linkar no menu lateral) contendo:
    *   **Resumo dos Segmentos**: Tabela comparativa (imagem 55) com: Clientes, % da Base, Pedidos, Frequência Média, Receita, % da Receita, AOV, LTV 30/60/365d.
    *   **Evolução por Segmento**: Gráficos de linha e barras empilhadas (imagem 56) mostrando a distribuição da base ao longo dos últimos 6 meses.
    *   **Migração entre Segmentos**: Gráfico Sankey (imagem 57) visualizando como os clientes estão mudando de categoria.
    *   **Matriz de Transição**: Tabela De/Para (imagem 58) mostrando a movimentação numérica entre segmentos.
*   **Navegação**: Adicionar a aba "Análise RFM" na tela principal do CRM (`src/routes/crm/index.tsx`).

## 3. Integração com Filtros

*   **Filtro RFM**: Atualizar o `src/components/crm/SegmentEditor.tsx` e `src/lib/crm-segmentation.functions.ts` para incluir "Segmento RFM" como um critério de segmentação. Isso permitirá criar campanhas de WhatsApp focadas em "Campeões" ou "Recuperação de Clientes em Risco".

## Detalhes Técnicos

*   Uso de `recharts` para os gráficos de linha e barras.
*   Uso de uma biblioteca leve para o gráfico Sankey ou implementação customizada via SVG.
*   Migração SQL para adicionar `rfm_segment` à tabela `shopify_customers`.
*   Função de manutenção para recalcular RFM de toda a base.
