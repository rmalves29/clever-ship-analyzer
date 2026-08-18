# Plano de Implementação: Novo Fluxo de Criação de Campanha WhatsApp (Padrão Multi-step)

Implementar um assistente de criação de campanha em 5 etapas (Identificação, Público, Mensagem, Agendamento e Revisão) seguindo o padrão visual dos prints fornecidos e integrando com as funcionalidades existentes do sistema.

## Ações Propostas

### 1. Reestruturação do Componente `WhatsappSendDialog`
- Substituir o formulário único por um sistema de etapas (stepper).
- Criar estados para controlar a etapa atual e os dados coletados em cada fase.
- Estilizar o cabeçalho com o progresso visual (1 Identificação, 2 Público, etc.).

### 2. Detalhamento das Etapas
- **Etapa 1: Identificação**
  - Campos: Nome da campanha e Conta de envio (fixa com o número da loja).
- **Etapa 2: Público**
  - Seleção de Segmentos para inclusão/exclusão.
  - Filtro para "Janela de serviço aberta (últimas 24h)".
  - Contador dinâmico de contatos selecionados.
- **Etapa 3: Mensagem**
  - Seleção de tipo (Template vs Mensagem Comum).
  - Seleção de Template Meta.
  - Preenchimento de variáveis dinâmicas com pré-visualização em tempo real (estilo celular).
- **Etapa 4: Agendamento**
  - Opções: "Enviar agora" ou "Agendar envio" (com seletor de data/hora).
- **Etapa 5: Revisão**
  - Resumo de todas as escolhas antes da confirmação final.

### 3. Integração com Backend
- Atualizar a função `createAndSendCampaign` para suportar agendamento.
- Garantir que a lógica de "Excluir listas/segmentos" seja processada no servidor para gerar a lista final de destinatários.

## Detalhes Técnicos
- Utilizar componentes do Radix UI/Shadcn para acessibilidade.
- Manter o uso do `react-globe.gl` no background ou em áreas pertinentes se necessário, mas focar no formulário limpo.
- Mapear os campos dos prints para as colunas existentes na tabela `whatsapp_campaigns` (e adicionar `scheduled_at` se necessário).
