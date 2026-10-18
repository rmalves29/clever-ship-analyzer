# Fluxo de Envio no CRM — o que falta para ficar igual ao painel do Cartzy (17/10/2026)

Origem: comparação lado a lado (código) entre o painel original (`live-launchpad-79`, hoje Cartzy) e a cópia do CRM, aba por aba.
Fato verificado em 17/10: o webhook da instância UazAPI (cartzy.uazapi.com) aponta para a função `uazapi-webhook` do projeto do Cartzy (eventos messages, messages_update, connection, presence, groups). **O motor de eventos de grupo, boas-vindas e retorno é o do Cartzy.**

## Decisão de arquitetura (recomendada)
CRM = tela; Cartzy = motor. O CRM lê e grava nas tabelas `fe_*` do Cartzy (mesmo banco) e não mantém motor próprio de eventos.
- Automações do CRM passam a gravar em `fe_auto_messages` / tabelas de retorno do Cartzy (hoje gravam em `envio_*` locais, que ninguém lê).
- Relatórios leem só `fe_group_events` / `fe_link_clicks`.
- O CRM não reaponta o webhook (botão "reconectar" e salvar credenciais hoje reapontam para o CRM e tirariam os eventos do Cartzy).

## Fase A — correções pequenas (dados/regra) — esforço P
Campanhas
1. Salvar seleção de grupos apaga os pesos → enviar o peso atual de cada vínculo.
2. Salvar auto-clonagem sobrescreve `group_template` (perde descrição/imagem/seed) → UI de descrição e imagem + merge.
3. Clone pode nascer sem link de convite (lê `invite_link` só da raiz; original lê `data.group.invite_link`).
4. Filtrar por `tenant_id` nas funções de campanha; link público `/fluxo/<tenant>/<slug>` e barra final.
5. `ctx.waitUntil` extraído sem `this` (risco de 500 no redirect com pixel/auto-clonagem).
6. Peso: clamp 0–100, erro visível, soma ao vivo; pixel com trim/null.
7. Detalhe: switch de entrada por grupo, aviso "falta link", lotação, editar nome/descrição, link de convite com copiar.
8. Estatísticas por campanha (cliques, entradas, %, saíram, participantes, cheios/disponíveis).
Grupos
9. Falha transitória na sincronização rebaixa `is_admin` para falso → preservar o valor existente.
10. Botão "Atualizar links"; editar link por grupo (vazio vira null); contadores; JID sob o nome; "Mostrar inativos" ligado por padrão; ordenar por criação; polling 15–30 s; avisos/erros visíveis; aviso "número conectado não identificado".
Envios
11. "Agendar" sem data envia na hora → exigir data. 12. Gravar `campaign_id` nos envios por campanha e listar só campanhas ativas. 13. Anti-duplicidade (60 s + trava de clique duplo). 14. Registrar motivo da falha (`error_message`) + diálogo de detalhes + mensagem amigável. 15. Vídeo redondo: validar HEVC/16 MB, legenda em mensagem separada e fallback. 16. Busca/ordenação de grupos e data do último envio.
Relatórios
17. Paginar de 1000 em 1000 (subcontagem); casar eventos por `group_id` OU `group_jid`; dia em horário de Brasília e série contínua; CSV com `;`, BOM e escape; nome do grupo/campanha nos eventos recentes.
Conexão
18. Estado de erro ("instância inacessível") sem cair no formulário de credenciais; QR limpa ao expirar/conectar; código de pareamento; confirmação ao desconectar; validação de URL; status completo (servidor, última sync, aguardando QR).

## Fase B — motor e dados (depende da decisão de arquitetura) — M a G
- Boas-vindas na entrada do grupo: hoje cadastra no CRM e nunca envia (motor do Cartzy lê `fe_auto_messages`).
- Automações de retorno (saída→cupom): gravar nas tabelas do Cartzy; formulário completo (escopo grupo/campanha, tipo texto/imagem, edição, ativa/inativa, validações, variáveis `{nome}` e `{{nome}}`).
- Eventos de grupo: parar de gravar em `envio_group_events` local; cliques do redirect: gravar também em `fe_link_clicks`.
- Conexão: não reapontar webhook; mostrar credenciais salvas (sem expor token) e escrever de volta em `integration_whatsapp` do Cartzy se a fonte da verdade for lá.
- Limpeza de eventos (cleanup) apontando para `fe_group_events`.

## Fase C — funções novas grandes — G
- Sequência de várias mensagens (até 4 extras, espera entre elas, dependência) + processador de agendados em loop com `depends_on` (exige colunas novas e reescrita do processador).
- Painel de agendados com cancelamento em lote; editar mensagem pendente (tipo, enquete, mídia).
- Upload de mídia por URL assinada (hoje base64 pelo servidor, risco para vídeo) com `accept`/tamanho.
- Envio imediato em lote sem estourar o tempo da função (usar a fila agendada).
- Relatórios: gráficos (área, gauge, barras por grupo).
- @todos: no original só funciona no Z-API; com UazAPI é ignorado — decidir se implementar (confirmar na documentação da UazAPI).

## Riscos e observações
- Hoje, salvar credenciais/reconectar pela aba Conexão do CRM reaponta o webhook da instância para o CRM e tira os eventos do Cartzy. Evitar até a Fase B.
- O CRM envia mensagens para a tabela local `envio_messages`; o painel do Cartzy não enxerga esse histórico (e vice-versa). Unificar na Fase B/C.
- Itens do CRM melhores que o original (manter): normalização de JID, botão salvar auto-clonagem sempre visível, slug com acentos, feedback 👍/👎 de IA, cooldown 0 respeitado.
