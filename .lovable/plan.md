# Plano de Implementação: Segmentação de Clientes CRM

Adicionar uma nova seção "CRM" com funcionalidades de gestão de contatos, criação de segmentos dinâmicos e listas estáticas, integradas ao disparo de WhatsApp.

## Etapas

### 1. Banco de Dados (Supabase)
- Criar tabela `crm_segments` para salvar regras de segmentação dinâmica (nome, descrição, regras em JSON).
- Criar tabela `crm_static_lists` e a relação `crm_list_members` para listas manuais.
- Adicionar permissões RLS e grants para acesso via API.

### 2. Backend (Server Functions)
- Implementar `src/lib/crm-segmentation.functions.ts` para CRUD de segmentos e listas.
- Criar motor de filtragem em `src/lib/crm-segmentation.server.ts` que transforma regras JSON em queries SQL/filtros reais sobre a base Shopify.
- Atualizar a integração de WhatsApp para permitir a escolha desses novos segmentos como destinatários.

### 3. Frontend (UI/UX)
- Criar nova rota `/crm` com sub-rotas `/crm/contatos`, `/crm/segmentos` e `/crm/listas-estaticas`.
- **Página de Contatos**: Lista de todos os clientes com KPIs de topo (total, leads, clientes, novos).
- **Biblioteca de Segmentos**: Listagem de públicos dinâmicos com contagem de contatos e opção de editar regras.
- **Editor de Segmentos**: Interface visual para adicionar critérios (E/OU) baseados em Dados Pessoais, Comportamento de Compra, RFM, etc.

### 4. Integração
- Disponibilizar os segmentos criados no diálogo de envio de WhatsApp (`WhatsappSendDialog`).
- Permitir a criação de automações baseadas em segmentos customizados.

## Detalhes Técnicos
- As regras de segmentação seguirão o padrão visual enviado nos prints, com categorias colapsáveis e operadores lógicos.
- A contagem de contatos por segmento será atualizada em tempo real ou via cache para performance.
