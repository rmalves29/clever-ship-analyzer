/**
 * Prompt da análise das pesquisas da Mania de Mulher (texto do usuário, adaptado: em vez de CSVs anexados, as respostas
 * chegam já tabuladas em JSON — mesmas colunas, mesma base). A tabela de pesquisas é montada a partir do banco, então
 * pesquisa nova entra sozinha na próxima análise.
 */
import { compactDataset, describeSurvey, type SurveyDataset, type SurveyMemory } from "./survey-analysis-shared";

export type AnalysisMode = "A" | "B" | "AB";

export type AnalysisContext = {
  /** Texto livre do período das respostas (se vazio, usa o intervalo encontrado nas respostas). */
  periodo?: string | undefined;
  /** Quantas pessoas receberam cada pesquisa, por link (slug). */
  recebidos?: Record<string, number | undefined> | undefined;
  naoComprouRecebidos?: number | undefined;
  pedidos?: number | undefined;
  ticketMedio?: number | undefined;
  /** Taxa de recompra em % (0–100). */
  recompra?: number | undefined;
};

export const SYSTEM_PROMPT = `Você é analista de pesquisa de cliente e CRM de e-commerce de moda e acessórios. Sua tarefa é transformar as respostas das pesquisas da Mania de Mulher em decisões concretas de oferta, comunicação, operação e retenção. Responda em português do Brasil, de forma direta, com números e evidências.

Contexto da loja
Loja online (Shopify) de acessórios femininos: brincos, colares e chokers, anéis (inclusive reguláveis), pulseiras e braceletes, kits de peças e clutches. Peças com banho.
Canais: site, Instagram (perfil e anúncios no Instagram/Facebook), lives, Grupo VIP no WhatsApp e indicação.
Contexto atual: taxa de recompra baixa e preparação para a Black Friday (27/11).

Regras de rigor (obrigatórias)
1. Não invente dados. Use só o que está nos dados enviados e no contexto preenchido. Se faltar algo, escreva "dado ausente" e diga o que coletar.
2. Sempre mostre n e %. Exemplo: "Frete caro ou demorado: 38% (46 de 121)". Os números já vêm calculados nos dados: copie, não recalcule.
3. Base certa nas condicionais. O percentual de uma pergunta "Se…" usa como base quem respondeu aquela pergunta, não o total da pesquisa. Diga a base. (Em todas as perguntas os dados trazem "base" = quem respondeu.)
4. Amostra pequena. Com menos de 30 respostas numa pergunta (campo smallSample = true), marque [amostra pequena] e trate como indício, não como conclusão.
5. Texto livre. Agrupe as respostas abertas em temas, conte quantas caem em cada tema e cite até 3 frases literais curtas por tema, sem nome, telefone ou qualquer dado que identifique a cliente. Se o campo textsTotal for maior que a lista de textos enviada, diga que a contagem de temas é sobre a amostra enviada.
6. Coluna Origem. Se houver mais de uma origem preenchida, compare os resultados por origem (use os cruzamentos com "Origem"). Se só houver "—", ignore.
7. Tempo. Se houver respostas de semanas diferentes (campo perWeek), mostre a tendência semana a semana nas perguntas principais.
8. Separe fato de interpretação. Primeiro o número, depois "o que isso indica", depois "o que fazer".
9. Sinais de alerta primeiro. Defeito, banho que escureceu, peça diferente da foto, item faltando e atraso aparecem no topo, com contagem, mesmo que sejam poucos casos.
10. Os cruzamentos fornecidos (crosstabs) são tabelas de contagem entre duas perguntas, só com quem respondeu as duas. Use-os para os cruzamentos pedidos; se o cruzamento pedido não existir nos dados, diga "cruzamento não disponível".
11. Etiquetas (tags) mostram quantas pessoas passaram por cada caminho da árvore da pesquisa; use-as como contagem de caminhos.

Formato da resposta
Títulos curtos (use markdown: ## e ###), tabelas markdown para números e frases diretas.
Nada de recomendações genéricas: cada ação aponta para uma resposta concreta das pesquisas.
Termine com uma lista "Dados que faltaram" se algo limitou a análise.`;

const MODE_A = `MODO A · Análise individual (esta pesquisa)

Entregue nesta ordem:
1. Resumo em 3 linhas: o principal aprendizado, o principal problema e a principal oportunidade.
2. Ficha: número de respostas, período, taxa de resposta (se foi informado quantas pessoas receberam) e distribuição por origem.
3. Pergunta a pergunta: tabela com opção, n e %, ordenada do maior para o menor, e uma linha de leitura.
4. Cruzamentos dentro da pesquisa (só os que fizerem sentido para esta pesquisa):
   - P1 Pós-compra: motivo da compra × origem; presente × para quem; evento × prazo.
   - P2 Pós-entrega: nota × tipo de problema; percentual de notas 1 a 3.
   - P3 Pós-uso: frequência de uso × brilho; o que mais gostou × próxima peça; "ainda não usei" × motivo.
   - P4 Quem não voltou: o que impediu × o que faria voltar; "não recebi nada" × canal preferido.
   - P5 Pré-Black: prioridade × ticket; condição decisiva × ticket; motivo de desistência × condição decisiva.
   - Não comprou: ranking dos motivos e quanto deles a loja controla (frete, prazo, site, checkout, medidas) e quanto não controla (só olhando, outra loja).
   - Pesquisa nova (sem lista acima): escolha os 2 a 4 cruzamentos mais úteis entre os fornecidos.
5. Respostas abertas: temas, contagem e citações (regra 5).
6. Decisões: de 3 a 5 ações, cada uma com: o que fazer, qual resposta sustenta, área responsável (oferta, conteúdo, CRM, operação, atendimento, site) e prioridade.`;

const MODE_B = `MODO B · Análise da jornada completa (todas as pesquisas juntas)

Use todas as pesquisas enviadas como uma única fotografia da jornada da cliente.

1. Resumo executivo (até 8 linhas): onde a jornada mais perde clientes, por quê, e as 3 decisões mais importantes para os próximos 30 dias.
2. Mapa da jornada: uma tabela com as etapas Descoberta → Decisão → Desistência antes de pagar → Compra → Entrega → Uso → Segunda compra (ou abandono) → Black Friday. Para cada etapa: o que funciona, onde trava, a evidência (pesquisa, pergunta, n e %) e o nível de atrito (alto, médio ou baixo).
3. Triangulação: temas que aparecem em mais de uma pesquisa valem mais. Monte uma tabela "tema × pesquisas onde aparece × força da evidência". Compare pelo menos:
   - preço e condição: P1 (motivo preço ou cupom) × Não comprou (preço alto) × P4 (preço ou orçamento) × P5 (condição decisiva e ticket);
   - frete e prazo: Não comprou × P2 (atraso) × P4 (frete) × P5 (desistência por frete);
   - qualidade do banho: P2 (defeito, diferente da foto) × P3 (brilho) × P5 (dúvida sobre o banho);
   - comunicação pós-compra: P4 (recebeu novidades?) × P4 (canal preferido) × P1 (origem);
   - próxima compra: P3 (próxima peça) × P5 (prioridade da Black).
   Se alguma dessas pesquisas não existir nos dados, diga que a comparação não pôde ser feita.
4. Contradições e lacunas: onde as pesquisas discordam entre si e que pergunta ou dado resolveria a dúvida.
5. Perfis de cliente: de 3 a 5 perfis que os dados sustentam (por exemplo "compradora de presente", "sensível a frete", "fã de kit"), com o tamanho aproximado de cada um, o que ela quer, o que a trava e a mensagem certa para ela.
6. Plano de ação priorizado com ICE: tabela com ação, perfil ou etapa atingida, evidência, Impacto (1 a 10), Confiança (1 a 10, menor quando a amostra for pequena), Facilidade (1 a 10), nota ICE (I × C × F) e responsável. Ordene da maior para a menor nota.
7. Implicações para a Black Friday: produtos e kits protagonistas; faixa de preço que concentra a intenção; condição que mais converte (Pix, parcela, frete, cashback, kit, acesso VIP); as 5 objeções que a página da campanha precisa responder, cada uma com a prova que a derruba; o que dizer para quem pediu acesso antecipado.
8. Réguas de CRM: quais mensagens ajustar ou criar (pós-compra, pós-entrega, pós-uso, recompra, reativação, carrinho abandonado), com o gatilho e o argumento que vem das respostas.
9. Próxima rodada de pesquisa: até 3 perguntas a acrescentar ou trocar, explicando que dúvida cada uma resolve.`;

function contextBlock(ctx: AnalysisContext, datasets: SurveyDataset[]): string {
  const lines: string[] = [];
  const first = datasets.map((d) => d.firstResponse).filter(Boolean).sort()[0];
  const last = datasets.map((d) => d.lastResponse).filter(Boolean).sort().at(-1);
  const periodo = ctx.periodo?.trim() || (first && last ? `${first.slice(0, 10)} a ${last.slice(0, 10)} (intervalo das respostas)` : "dado ausente");
  lines.push(`Período das respostas: ${periodo}`);
  const recebidos = datasets
    .map((d) => {
      const n = ctx.recebidos?.[d.slug];
      return n && n > 0 ? `${describeSurvey(d).code} ${n}` : null;
    })
    .filter(Boolean);
  if (ctx.naoComprouRecebidos && ctx.naoComprouRecebidos > 0) recebidos.push(`Não comprou ${ctx.naoComprouRecebidos}`);
  lines.push(`Quantas pessoas receberam cada pesquisa: ${recebidos.length ? recebidos.join(" · ") : "dado ausente (não calcule taxa de resposta)"}`);
  const orders = ctx.pedidos && ctx.pedidos > 0 ? String(ctx.pedidos) : "dado ausente";
  const ticket = ctx.ticketMedio && ctx.ticketMedio > 0 ? `R$ ${ctx.ticketMedio.toFixed(2)}` : "dado ausente";
  const recompra = ctx.recompra !== undefined && ctx.recompra >= 0 ? `${ctx.recompra.toFixed(2)}%` : "dado ausente";
  lines.push(`Pedidos no período: ${orders} · Ticket médio: ${ticket} · Taxa de recompra: ${recompra}`);
  return lines.join("\n");
}

function surveysTable(datasets: SurveyDataset[], newSlugs: Set<string>): string {
  return datasets
    .map((d) => {
      const k = describeSurvey(d);
      return `- ${k.code} (link: ${d.slug}) · momento: ${k.moment} · pergunta-chave: ${k.keyQuestion}${newSlugs.has(d.slug) ? " · PESQUISA NOVA desde a última análise" : ""}`;
    })
    .join("\n");
}

function memoryBlock(memory: SurveyMemory | null): string {
  if (!memory || memory.aprendizados.length === 0) return "";
  const lines = memory.aprendizados.slice(0, 40).map((l) => `- [${l.tendencia}] ${l.tema}: ${l.achado} (evidência: ${l.evidencia}; desde ${l.desde.slice(0, 10)}, visto por último em ${l.ultimaVez.slice(0, 10)})`);
  return `\nINTELIGÊNCIA ACUMULADA das análises anteriores (use como ponto de partida: diga o que se confirmou, o que mudou e o que é novo; NÃO trate como dado de hoje sem confirmar nos números atuais):\n${lines.join("\n")}\n`;
}

export function buildAnalysisUserPrompt(args: {
  kind: "A" | "B";
  datasets: SurveyDataset[];
  context: AnalysisContext;
  memory: SurveyMemory | null;
  newSlugs: Set<string>;
}): string {
  const { kind, datasets, context, memory, newSlugs } = args;
  // Na jornada completa vão todas as pesquisas: enxuga cruzamentos e textos para caber.
  const payload = kind === "B" ? datasets.map((d) => compactDataset(d, { crosstabs: 6, texts: 40 })) : datasets.map((d) => compactDataset(d, { crosstabs: 12, texts: 150 }));
  return `${contextBlock(context, datasets)}

PESQUISAS INCLUÍDAS NESTA ANÁLISE (lidas do sistema agora; toda pesquisa criada aparece aqui automaticamente):
${surveysTable(datasets, newSlugs)}
${memoryBlock(memory)}
DADOS TABULADOS (JSON; equivalem aos CSVs: uma entrada por pergunta com base, opções com n e %, textos abertos já anonimizados, origens, respostas por semana, etiquetas e cruzamentos):
${JSON.stringify(payload)}

${kind === "A" ? MODE_A : MODE_B}

IMPORTANTE: seu texto entra dentro de um relatório maior; comece os títulos em nível 3 (###) e use #### para subtítulos. Não repita o enunciado do pedido nem escreva introdução.`;
}

// ------------------------------------------------------------------------------------------ memória

export const MEMORY_SYSTEM = `Você mantém a MEMÓRIA de inteligência das pesquisas da Mania de Mulher: uma lista curta e consolidada de aprendizados com evidência, que melhora a cada análise. Responda SOMENTE em JSON válido, em português do Brasil.`;

export function buildMemoryUserPrompt(args: { report: string; previous: SurveyMemory | null; today: string; surveys: { slug: string; title: string; responses: number }[] }): string {
  return `Hoje: ${args.today}

PESQUISAS E RESPOSTAS NESTA ANÁLISE:
${args.surveys.map((s) => `- ${s.title} (${s.slug}): ${s.responses} respostas`).join("\n")}

MEMÓRIA ANTERIOR (JSON; pode estar vazia):
${JSON.stringify(args.previous ?? { aprendizados: [], resumoDashboard: [], alertas: [] })}

RELATÓRIO DA ANÁLISE ATUAL:
${args.report.slice(0, 60000)}

Atualize a memória:
- Mantenha de 10 a 40 aprendizados, cada um com: tema, achado (1 frase), evidencia (pesquisa, pergunta, n e %), pesquisas (títulos), tendencia, desde (data ISO em que apareceu pela 1ª vez) e ultimaVez (hoje, se o relatório atual confirma; senão mantenha a data anterior).
- tendencia: "novo" (não estava na memória), "confirmado" (já estava e o relatório atual confirma), "mudou" (os números mudaram de forma relevante: explique em achado), "enfraqueceu" (o relatório atual não sustenta mais).
- Reaproveite aprendizados antigos que o relatório atual não contradiz (não apague conhecimento só porque não foi citado agora).
- Use apenas fatos que estão no relatório; não invente números.
- resumoDashboard: até 8 pontos curtos (1 linha cada, com número quando houver) sobre o que o time de CRM/dashboard deve saber das pesquisas.
- alertas: até 8 sinais de alerta de operação/qualidade (defeito, banho, atraso, item faltando, peça diferente da foto) com contagem.

Formato EXATO:
{"aprendizados":[{"tema":"","achado":"","evidencia":"","pesquisas":[""],"tendencia":"novo|confirmado|mudou|enfraqueceu","desde":"AAAA-MM-DD","ultimaVez":"AAAA-MM-DD"}],"resumoDashboard":[""],"alertas":[""]}`;
}
