# Refazer a área de campanhas de WhatsApp (API oficial)

Reconstrução completa da parte de mensageria das campanhas: telas, fluxo de criação e estrutura de dados. Nada do histórico é perdido — tudo que existe hoje é copiado para a nova estrutura e continua visível.

## O problema hoje

- Sete abas na mesma tela (Conversas, Campanhas, Aprovações, Automações, Fluxo API, Templates, Relatórios) misturando coisas diferentes.
- Criar campanha é um assistente de vários passos numa janela pequena, sem ver o resultado antes.
- Os números da campanha ficam espalhados entre "Aprovações", "Relatórios" e a janela de detalhe.
- Por trás: campanha, destinatários e fila de envio guardam informação repetida e às vezes divergente, o que faz uma campanha aparecer "enviando" para sempre.

## A nova estrutura de telas

Uma seção "WhatsApp" com quatro páginas em vez de sete abas:

1. **Campanhas** — lista única com busca e filtro por situação. Cada linha mostra: nome, público, modelo, situação, enviadas / entregues / lidas / falhas e a data. Aprovar e rejeitar acontecem direto na linha (não existe mais aba "Aprovações").
2. **Nova campanha (tela única)** — formulário à esquerda, prévia da mensagem à direita, atualizando enquanto você digita:
   - Nome da campanha
   - Público (segmento, lista ou tag) com contagem de destinatários ao vivo e aviso de quantos não têm telefone válido
   - Modelo aprovado da Meta + preenchimento dos campos variáveis, com exemplo real de um cliente do público
   - Enviar agora ou agendar
   - Barra final fixa: destinatários, custo estimado, botão "Enviar" (bloqueado com o motivo quando algo falta)
3. **Campanha aberta** — uma página por campanha: números no topo, linha do tempo do envio, lista de destinatários com situação e motivo de falha em português, e botões de repetir falhas / cancelar restante.
4. **Conversas** e **Modelos** continuam como páginas próprias, sem mudança de comportamento.

Automações e Fluxos conversacionais saem daqui e ficam na sua própria página, já que não são campanha.

## A nova estrutura de dados

Três tabelas novas, limpas, com uma responsabilidade cada:

- `wa_campaigns` — a campanha em si: nome, público escolhido, modelo, variáveis, agendamento, situação, contadores consolidados.
- `wa_campaign_recipients` — um registro por cliente da campanha: telefone normalizado, variáveis já resolvidas, situação (fila, enviado, entregue, lido, falhou), código do erro e texto explicado.
- `wa_jobs` — apenas a fila de trabalho do robô de envio (tentativas, próxima tentativa, trava). Sem duplicar dados da campanha.

Migração de dados, em uma única operação:
- Cada campanha atual vira uma linha em `wa_campaigns`.
- Cada destinatário atual (`whatsapp_campaign_recipients`) e cada item da fila (`whatsapp_message_queue`) vira uma linha em `wa_campaign_recipients`, unificando situação e erro.
- Contadores recalculados a partir dos registros reais, então campanhas travadas em "enviando" passam a mostrar a situação verdadeira.
- As tabelas antigas **não são apagadas**: ficam intactas como cópia de segurança até você confirmar que está tudo certo.

## Detalhes técnicos

- Novas tabelas em `public` com `GRANT` para `authenticated`/`service_role`, RLS ligada e políticas para usuários autenticados; gatilho de `updated_at`.
- Backfill dentro da própria migration (INSERT ... SELECT das tabelas antigas), idempotente por `ON CONFLICT DO NOTHING`.
- Camada de servidor nova em `src/lib/wa-campaigns.server.ts` + `wa-campaigns.functions.ts`, substituindo a parte de campanhas de `whatsapp-meta.server.ts` (1.622 linhas). O que é template/Meta API continua onde está; só o CRUD e o envio de campanha migram.
- Worker (`src/server.ts` + `whatsapp-queue.server.ts`) passa a ler `wa_jobs` e escrever situação em `wa_campaign_recipients`; mantém claim atômico, retry com backoff, idempotência e o paralelismo atual.
- Webhook de status da Meta atualiza `wa_campaign_recipients` por `wa_message_id`; contadores da campanha por gatilho no banco, evitando divergência.
- Rotas novas: `/whatsapp` (lista), `/whatsapp/nova`, `/whatsapp/$campaignId`, `/whatsapp/conversas`, `/whatsapp/modelos`. A rota antiga `/campanhas-whatsapp` redireciona para `/whatsapp`.
- Componentes antigos removidos ao final: `WhatsappSendDialog.tsx` (700 linhas), `CampaignDetailDialog.tsx`, aba de aprovações. Inbox, Templates, Automações e Fluxos são reaproveitados como estão.
- Testes: mapeamento de situação/erro e resolução de variáveis com testes automatizados; o backfill é conferido comparando as contagens antes e depois.

## Ordem de execução

1. Migration das três tabelas + backfill (histórico preservado).
2. Camada de servidor e worker apontando para a nova estrutura.
3. Telas novas e rota de redirecionamento.
4. Comparação antes/depois das contagens e remoção do código morto.
