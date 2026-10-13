# Axoly × nosso CRM — varredura e de-para (12/10/2026)

> Referência de funcionalidades. Nenhum dado do Axoly entra no nosso CRM (regra já combinada); aqui só usei descrições, estruturas e fluxos para comparar.

## 1. O que foi varrido (e o que não foi)

| Parte | Cobertura |
|---|---|
| Site público | `axoly.ai/` e `/ecommerce` (todas as seções: hero com 4 painéis de produto, "como o Axoly pensa" 4 etapas, para quem é, prova social, Academy, segurança, planos, garantias, FAQ com as 4 abas abertas e a lista "recursos incluídos"), `/agencias` (página inteira), `/planos-ecommerce`, `/quiz-agencias` (só a 1ª tela, sem preencher), `/login` (só a tela), `/termos`, `/politicas-de-privacidade`, `/exclusao-dados` |
| Blog | 40 artigos listados nas 6 trilhas (as páginas de trilha só repetem a lista). Abri os 40 e li a estrutura de seções de todos, mais o artigo de CRM por completo; vários são comparativos (Reportei, Solomon, Prax) e SEO |
| Produto por dentro | **Não acessei o app logado** (exige senha — não entro com credenciais). Usei como substituto o **MCP do Axoly já conectado na sua conta** (82 ferramentas, que descrevem cada módulo e o formato dos dados) e vi a estrutura de 2 respostas de exemplo (diagnóstico de CRM e lista de réguas) |
| Links externos | Checkout da Hotmart não foi aberto (é compra). Termos/Política/Exclusão abertos |

Se você entrar no Axoly dentro do navegador do app, eu percorro cada tela do menu logado e complemento este documento.

## 2. O que é o Axoly

"IA cognitiva para e-commerce": **sistema de decisão e execução** que cruza metas, mídia, CRO, CRM, conteúdo e tarefas; compara **planejado × realizado**, aponta o **driver** que mais afeta a meta e transforma em **tarefa com responsável e prazo**. Duas versões: **E-commerce** (lojista) e **Agências** (multi-cliente, squads, Kanban/Gantt, reuniões).

- Preço visto: R$ 299/mês nos 3 primeiros meses, depois R$ 998/mês; anual R$ 7.390 (12x R$ 615,83). Sem fidelidade no mensal; 7 dias de reembolso.
- Integrações: Shopify e similares, GA4, Meta Ads, Google Ads, **Bling, Tiny, Omie (ERP)**, **Axoly Pixel (próprio)**, WhatsApp.
- **Limite declarado:** o Axoly **não executa** disparos nem alterações na loja ("publicações, alterações na loja e disparos dependem do time e das ferramentas conectadas"). Ele planeja, analisa e organiza.

## 3. Módulos do Axoly (site + MCP) e de-para com o nosso CRM

Legenda: ✅ temos · 🟡 parcial · ❌ não temos · ➖ não faz sentido para nós

### Planejamento e metas
| Axoly | Nosso CRM | |
|---|---|---|
| Planejamento anual com drivers (retenção %, aprovação, ticket, conversão, investimento em mídia/grupos VIP/impulsionamento, sessões orgânicas, CPS) planejado × realizado por mês | Metas fixas no dashboard (ticket, recompra, tempo de envio); sem plano anual | ❌ |
| **Meta do Mês** (ritmo base dos últimos 7 dias, projeção de fechamento, ritmo necessário/dia, multiplicador de esforço) | — | ❌ |
| **Meta do Dia** e **Meta por Hora** (rateio da meta, acumulado vs. meta) | — | ❌ |
| Criador de Ações (ações comerciais do mês, split aquisição × retenção) | Calendário de eventos (Linha do Tempo) sem metas | 🟡 |
| Calendário de datas comemorativas por cliente | Linha do Tempo com categorias (preço, campanha, feriado…) | ✅ |
| Health score (planejamento, conteúdo, CRM, execução) | — | ➖ (é de agência) |

### Dados e análises
| Axoly | Nosso CRM | |
|---|---|---|
| Axoly Pixel + 12 dashboards (visão geral, aquisição, comportamento, conversão, receita, retenção, inventário, busca/SEO, tecnologia/geo) | Pixel só do pop-up (visitas); GA4 básico (sessões, tempo real, conversões) | 🟡 |
| Boletim GA4 por IA (conversão, funil, canais, região, produtos, dia/hora, heatmap dia×hora, produto×hora, produto×região, dispositivos) | GA4 básico | 🟡 |
| **Matriz Produto × Conversão** (Estrelas / Oportunidades / Nichos / Revisar) | Curva ABC e mais vendidos | 🟡 |
| UTM deep dive, Qualidade do tráfego, Busca interna, Saída de produto | Temos `landing_site`/`referring_site` nos pedidos (não explorados) | 🟡 |
| Retenção (coortes, recompra) | Coorte, tempo entre 1ª e 2ª compra, curva de recompra, frequência, ticket × recorrência, top estados | ✅ |
| Conectores (ERP Bling/Tiny/Omie) | Shopify + Tray (histórico) | 🟡 |
| Heatmap CRO (previsão da IA × cliques reais, rage/dead clicks) | — | ❌ |

### CRM e relacionamento
| Axoly | Nosso CRM | |
|---|---|---|
| Diagnóstico de CRM por IA (KPIs + 9 análises, cada uma com achado, o que fazer agora, oportunidade escondida, impacto em LTV/mídia, hipótese, próxima análise) | Análise geral com IA no dashboard + gráficos prontos | 🟡 (mais raso na parte "o que fazer") |
| Clusters (VIP, recorrente, novos, inativos) | **Análise RFM** com 11 segmentos + segmentos/listas salvas | ✅ |
| Biblioteca de **25+ réguas** com gatilho/canal/cluster e marcação "implementada" | Plantas de RFM e cashback + 14 automações por evento que acabamos de criar | 🟡 (falta o catálogo com status) |
| Ações de WhatsApp planejadas (base, oferta, janela, canais, **ROI projetado**) | Campanhas com custo estimado | 🟡 |
| Calendário de WhatsApp para **grupos VIP** | — | ❌ |
| Calendário e campanhas de **e-mail** | — (só WhatsApp) | ❌ |
| Matriz de **remarketing** (produto, dor, script, tags) | Modelos Meta + automações; sem matriz de dor/script | 🟡 |
| NPS e quizzes | **Pesquisas em árvore**, runtime no WhatsApp, análise por IA (mais avançado) | ✅ |
| Landing pages | Landing pages + pop-ups | ✅ |
| **Execução** (envio real) | **Fila de 80 msg/s, fluxos conversacionais, automações por evento, cashback** | ✅ (vantagem nossa) |

### Mídia, criativo e conteúdo
| Axoly | Nosso CRM | |
|---|---|---|
| Gestão Meta Ads (buckets Escalar/Otimizar/Pausar/Testar, anomalias, dayparting) | Gestão, Dayparting, Ad Pulse, Insights Criativos, Planejamento, Análise IA, **regras automáticas** | ✅ |
| Score preditivo de criativos (0–100 com semáforo) | Insights criativos | 🟡 |
| Planejamento de Google Ads | — | ❌ |
| Matriz criativa (roteiros) · Calendário social/stories · Studio de imagens IA · Personas por IA · Brain da marca · Mindmaps | Fila de conteúdo por IA, Instagram (visão geral, público, melhores conteúdos + IA), agente de matriz criativa (docs) | 🟡 |
| LiveShop (planejamento, aquecimento, execução, pós-live) | Live View em tempo real + fluxos de live | 🟡 |
| Funis visuais | ManyChat/Flow + Fluxo de Envio | 🟡 |

### CRO, UX, SEO e auditorias
| Axoly | Nosso CRM | |
|---|---|---|
| Auditoria UX por URL (10 blocos, visão cliente × especialista) · CRO review (funil + checklist de oferta) · Inside Commerce (13 pilares) · SEO · AEO | — | ❌ |

### Financeiro
| Axoly | Nosso CRM | |
|---|---|---|
| DRE planejado × realizado · fluxo de caixa · custo de equipe | — | ❌ |

### Operação de time e IA
| Axoly | Nosso CRM | |
|---|---|---|
| Tarefas (Kanban/Gantt), squads, workspace do analista, reuniões com transcrição → tarefas, playbooks, onboarding | — (ações sugeridas no dashboard não viram tarefa) | ❌ |
| **Chat de IA com contexto dos dados** ("quais tarefas atrasaram?") | — | ❌ |
| Histórico completo de alterações, permissões por perfil | Lista de e-mails autorizados | 🟡 |
| Academy + manual | — | ❌ |

## 4. Onde já estamos na frente
1. **Execução**: o Axoly planeja; nós enviamos (campanhas, fila rápida, fluxos conversacionais, automações por evento, cashback, pop-ups, pesquisa por WhatsApp).
2. **Pesquisas** com árvore, etiquetas e análise por IA.
3. **RFM** completo ligado a automações.
4. **Meta Ads** com regras que agem sozinhas.
5. Dados **do cliente individual** (360, histórico, conversas) — o Axoly trabalha com agregados.

## 5. O que vale implementar (priorizado)

Critério: usa dados que **já temos** (Shopify, Tray, WhatsApp, Meta), resolve o gargalo do negócio (recompra) e é pequeno o bastante para entregar logo.

### Faça primeiro (valor alto, esforço baixo/médio)
| # | Item | Por quê | Dados | Esforço |
|---|---|---|---|---|
| 1 | **Equação da receita da base** no dashboard (clientes ativos × taxa de recompra × ticket) com leitura automática do gargalo | Mostra qual alavanca mexer (recompra, ticket ou base) em vez de só gráficos | Pedidos | P |
| 2 | **Meta do mês / dia / hora** com projeção de fechamento e "ritmo necessário" | Acompanhar a meta em tempo real (e em live) | Pedidos Shopify + uma meta mensal | M |
| 3 | **Catálogo de réguas** (≈25 modelos prontos, com status "instalada / pausada / falta") e instalar em 1 clique | Reaproveita o que criamos hoje e evita esquecer régua | Automações | M |
| 4 | **Diagnóstico de CRM em 1 clique** com o formato "achado → o que fazer agora → oportunidade escondida → próxima análise" e botão "criar automação a partir desta ação" | Transforma análise em execução (o que o Axoly não faz) | Dados atuais + OpenAI | M |
| 5 | **UTM e qualidade do tráfego** por pedido (origem, página de entrada, recompra por origem) | Já gravamos `landing_site` e `referring_site` | Pedidos | M |
| 6 | **Matriz Produto × Conversão** (Estrelas / Oportunidades / Nichos / Revisar) | Diz o que anunciar, o que arrumar na página e o que descartar | GA4 itens (já conectado) | M |

### Depois (valor alto, esforço maior)
| # | Item | Observação |
|---|---|---|
| 7 | **Planejamento anual com drivers** (planejado × realizado) e **previsão de receita em 3 cenários** | Base é o item 2 |
| 8 | **Pergunte ao CRM** (chat de IA com acesso a clientes, pedidos, campanhas, automações) | Maior diferencial de uso; exige cuidado de segurança/limites |
| 9 | **Margem por pedido e CAC máximo** (DRE enxuta) | Precisa de custo por produto (Shopify tem campo de custo) |
| 10 | **Conciliação** loja × gateway (Mercado Pago/Vindi) × Meta | Resolve "números que nunca fecham" |
| 11 | **Alerta de ruptura/cobertura de estoque** antes da Black Friday | Depende do estoque na Shopify |
| 12 | **E-mail marketing** (calendário + envio) | Maior lacuna de canal; projeto grande |
| 13 | **Google Ads** (gestão como já fazemos no Meta) | Projeto grande |
| 14 | **Trilha de auditoria** (quem mudou o quê) e permissões por perfil | Necessário se o time crescer |

### Provavelmente não vale
Squads/Kanban/Gantt, reuniões com transcrição, health score de cliente, onboarding de clientes, planos de agência: são para quem gerencia **vários clientes**. Studio de imagens e matriz criativa só se for virar prioridade de marketing.

## 6. Sugestão de ordem
1 → 2 → 3 → 4 (um pacote de ~2 semanas que fecha o ciclo "ver gargalo → agir"), depois 5 e 6, e só então 7–9.

## 7. Ideias de método do blog do Axoly que valem copiar
- **Régua de CAC máximo** e **conta do pedido** (DRE por pedido).
- **Faixa de tolerância** nas metas (em vez de alvo único) — semáforo mais honesto.
- **Ritmos de gestão**: pulso diário (10 min), revisão semanal, fechamento mensal.
- **Índice de prontidão da Black Friday** (estoque, margem, régua regressiva) — encaixa com a pesquisa P5.
- **Matriz RFV com uma alavanca por segmento** (reconhecimento, ticket, hábito — nunca só desconto).
