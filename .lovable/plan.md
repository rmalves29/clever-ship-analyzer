# Projeto: CRM Insights - Meta & Shopify Integration

Este plano detalha a revisão da integração com a API Oficial da Meta para garantir que os dados da Shopify (pedidos, clientes e rastreios) fluam corretamente para o sistema de envio de mensagens do WhatsApp, permitindo campanhas manuais e automações "estilo SendFlow".

## Objetivos
- Garantir que a conta Meta conectada (Mania de Mulher) consiga visualizar destinatários reais.
- Facilitar a criação de templates para o usuário, já que a Meta exige templates aprovados.
- Corrigir a segmentação para que clientes com apenas 1 compra ou telefone BR sejam capturados corretamente.

## Ações
1. **Refinamento de Segmentos**: Ajustar a lógica de `getSegmentCustomerIds` para ser mais inclusiva com os dados atuais da loja (clientes únicos com telefone).
2. **Diagnóstico Visual**: Adicionar avisos claros na UI quando não houver templates aprovados na Meta, com link/instruções para o Gerenciador de Negócios.
3. **Fluxo de Aprovação**: Validar se as campanhas criadas via "Ações Sugeridas" estão caindo corretamente na fila de aprovação.
4. **Verificação de Telefone**: Garantir que o formato E.164 (+55...) está sendo aplicado a todos os números da Shopify antes do envio.

## Detalhes Técnicos
- **Localização**: As funções principais residem em `src/lib/whatsapp-meta.server.ts`.
- **API Meta**: Utiliza a versão `v20.0` do Graph API.
- **Shopify**: Filtra pedidos por `financial_status` para evitar métricas de pedidos cancelados.
- **Infraestrutura**: O `fb-root` já foi adicionado ao `__root.tsx` para o SDK de login.

## Próximos Passos (Pós-Aprovação)
- Testar um envio real com o cliente Rafael (único com telefone válido na base atual).
- Instruir o usuário sobre a criação do primeiro template "Marketing" na Meta.
