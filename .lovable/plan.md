# Plano: Melhorias no ManyChat (Identidade Visual e Experiência do Usuário)

Este plano descreve os ajustes para melhorar a captura de identificação dos usuários no ManyChat (Instagram) e a formatação das mensagens enviadas.

## Problemas Identificados
1.  **Identificação do Usuário**: Alguns contatos estão aparecendo com IDs numéricos em vez do `@username` correto no dashboard do ManyChat.
2.  **Experiência de Compra**: Links de compra nas mensagens do Direct estão vindo como texto simples. O objetivo é transformá-los em botões clicáveis reais ou, ao menos, em links integrados na interface do Instagram.

## Alterações Propostas

### 1. Captura Aprimorada de Usernames
*   **Motor de Webhook**: Atualizar o `flow-engine.server.ts` para tentar buscar o `username` via Instagram Graph API caso ele não venha nativamente no payload do webhook (comum em DMs e Story Replies).
*   **Sincronização de Contatos**: Garantir que, ao registrar um contato, o sistema priorize o `username` e o atualize sempre que possível.

### 2. Mensagens com Botões no Instagram
*   **Estrutura da API**: Refatorar a função `sendFlowMessage` para usar o objeto `template` da API de Mensagens da Meta em vez de apenas concatenar texto. Isso permitirá que o campo "Botão" configurado no editor apareça como um botão real na interface do usuário final (modelo `button` ou link direto).
*   **Fallback Seguro**: Manter a concatenação de texto apenas como fallback para tipos de mensagem que não suportam templates.

## Detalhes Técnicos
*   **Arquivo `src/lib/flow-engine.server.ts`**:
    *   Implementar `fetchInstagramUsername(igUserId, token)` para enriquecer dados faltantes.
    *   Alterar `sendFlowMessage` para estruturar o payload com `attachment.payload.buttons` quando `buttonUrl` estiver presente.
*   **Arquivo `src/routes/flow/index.tsx`**: Pequeno ajuste visual na tabela de contatos para exibir o username com link direto para o perfil do Instagram.

---
*Você gostaria que eu seguisse com estas implementações agora?*
