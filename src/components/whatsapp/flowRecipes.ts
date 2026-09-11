/**
 * Modelos prontos de fluxo. Servem como ponto de partida na criação:
 * o usuário escolhe um cartão, o construtor abre já montado e conectado,
 * bastando ajustar textos/templates antes de salvar.
 */
import type { ConversationalFlowSeed, ConvStepSeed } from "./ConversationalFlowDialog";
import type { AutomationSeed, AutomationStepSeed } from "@/components/crm/AutomationDialog";

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function send(text: string, waitMinutes = 0, extra?: { buttonText?: string; buttonUrl?: string }): ConvStepSeed {
  return {
    id: id("cstep"),
    type: "send",
    waitMinutes,
    text,
    buttonText: extra?.buttonText ?? null,
    buttonUrl: extra?.buttonUrl ?? null,
    nextStepId: null,
  };
}

function chain(steps: ConvStepSeed[]): ConvStepSeed[] {
  for (let i = 0; i < steps.length - 1; i++) {
    const current = steps[i]!;
    if (current.type === "send") current.nextStepId = steps[i + 1]!.id;
  }
  return steps;
}

export type FlowRecipe = {
  key: string;
  title: string;
  description: string;
  build: () => ConversationalFlowSeed;
};

export const CONVERSATION_RECIPES: FlowRecipe[] = [
  {
    key: "menu_atendimento",
    title: "Menu de atendimento",
    description: "Cliente manda “oi” e recebe um menu com SAC, Vendas e Trocas.",
    build: () => {
      const sac = send("Certo! Me conta em poucas palavras o que aconteceu que já te ajudo por aqui. 💬");
      const vendas = send("Boa! Me diz qual peça te interessou que eu te mando fotos, valores e formas de pagamento. 🛍️");
      const trocas = send("Sem problema! Me passa o número do pedido que eu abro a troca pra você. 🔁");
      const menu: ConvStepSeed = {
        id: id("cstep"),
        type: "menu",
        waitMinutes: 0,
        text: "Oi! Que bom te ver por aqui 💛\nComo posso te ajudar hoje?",
        options: [
          { id: id("opt"), label: "SAC", nextStepId: sac.id },
          { id: id("opt"), label: "Vendas", nextStepId: vendas.id },
          { id: id("opt"), label: "Trocas", nextStepId: trocas.id },
        ],
      };
      return {
        nome: "Menu de atendimento",
        descricao: "Primeira resposta automática com menu de opções.",
        ativo: true,
        triggerType: "keyword",
        triggerValues: ["oi", "olá", "ola", "menu", "bom dia", "boa tarde"],
        steps: [menu, sac, vendas, trocas],
      };
    },
  },
  {
    key: "rastreio",
    title: "Rastreio do pedido",
    description: "Cliente pergunta “cadê meu pedido” e recebe o código de rastreio na hora.",
    build: () => ({
      nome: "Rastreio do pedido",
      descricao: "Responde automaticamente com o código de rastreio do último pedido.",
      ativo: true,
      triggerType: "keyword",
      triggerValues: ["rastreio", "rastrear", "cadê meu pedido", "entrega", "chegou"],
      steps: chain([
        send(
          "Oi, {{NOME_CLIENTE}}! Seu pedido {{NUMERO_PEDIDO}} já está a caminho 🚚\nCódigo de rastreio: {{CODIGO_RASTREIO}}",
          0,
          { buttonText: "Acompanhar entrega", buttonUrl: "{{LINK_RASTREIO}}" },
        ),
        send("Qualquer coisa é só me chamar por aqui que eu acompanho junto com você 💛", 2),
      ]),
    }),
  },
  {
    key: "sem_resposta",
    title: "Cliente parou de responder",
    description: "Depois de 15 minutos em silêncio, o bot faz uma última tentativa.",
    build: () => ({
      nome: "Cliente parou de responder",
      descricao: "Retoma a conversa quando o cliente some no meio do atendimento.",
      ativo: true,
      triggerType: "unanswered_timeout",
      triggerTimeoutMinutes: 15,
      triggerValues: [],
      steps: chain([
        send("Oi! Você ainda está por aí? Consigo te ajudar em mais alguma coisa? 😊"),
        send("Vou encerrar por aqui, mas é só me chamar quando quiser — respondo rapidinho 💛", 60),
      ]),
    }),
  },
  {
    key: "cupom",
    title: "Cupom por palavra-chave",
    description: "Cliente digita “cupom” e recebe o desconto com link direto pra loja.",
    build: () => ({
      nome: "Cupom por palavra-chave",
      descricao: "Entrega um cupom quando o cliente pede desconto.",
      ativo: true,
      triggerType: "keyword",
      triggerValues: ["cupom", "desconto", "promoção", "promocao"],
      steps: chain([
        send("Tenho sim! Use o cupom {{CUPOM_CASHBACK}} e aproveite 💛", 0, {
          buttonText: "Comprar agora",
          buttonUrl: "https://maniademulheracessorios.com.br",
        }),
        send("O cupom vale até {{VALIDADE_CASHBACK}}. Se precisar de ajuda pra finalizar, me chama! 🛒", 30),
      ]),
    }),
  },
];

function autoSend(templateName: string, waitValue: number, waitUnit: "minutes" | "days"): AutomationStepSeed {
  return {
    id: id("step"),
    type: "send",
    waitMinutes: waitUnit === "days" ? waitValue * 1440 : waitValue,
    waitValue,
    waitUnit,
    templateName,
    bodyParams: [],
    nextStepId: null,
  };
}

function autoChain(steps: AutomationStepSeed[]): AutomationStepSeed[] {
  for (let i = 0; i < steps.length - 1; i++) {
    const current = steps[i]!;
    if (current.type === "send") current.nextStepId = steps[i + 1]!.id;
  }
  return steps;
}

export type AutomationRecipe = {
  key: string;
  title: string;
  description: string;
  build: () => AutomationSeed;
};

export const AUTOMATION_RECIPES: AutomationRecipe[] = [
  {
    key: "recompra_30d",
    title: "Convite de recompra",
    description: "Quem comprou há 30 dias recebe um lembrete e, 3 dias depois, uma oferta.",
    build: () => ({
      nome: "Convite de recompra",
      descricao: "Duas mensagens para quem já comprou e ainda não voltou.",
      segmentType: "recompra_30d",
      requerAprovacao: true,
      ativo: false,
      steps: autoChain([autoSend("", 0, "minutes"), autoSend("", 3, "days")]),
    }),
  },
  {
    key: "sem_recompra",
    title: "Resgate de cliente parado",
    description: "Cliente sem comprar há tempo recebe uma oferta de retorno.",
    build: () => ({
      nome: "Resgate de cliente parado",
      descricao: "Uma mensagem de reativação e um reforço uma semana depois.",
      segmentType: "sem_recompra",
      requerAprovacao: true,
      ativo: false,
      steps: autoChain([autoSend("", 0, "minutes"), autoSend("", 7, "days")]),
    }),
  },
  {
    key: "envio_atrasado",
    title: "Aviso de envio atrasado",
    description: "Avisa o cliente antes que ele venha cobrar o pedido.",
    build: () => ({
      nome: "Aviso de envio atrasado",
      descricao: "Mensagem proativa para pedidos com envio em atraso.",
      segmentType: "envio_atrasado",
      requerAprovacao: true,
      ativo: false,
      steps: autoChain([autoSend("", 0, "minutes")]),
    }),
  },
  {
    key: "ticket_alto",
    title: "Pós-venda VIP",
    description: "Clientes de ticket alto recebem um agradecimento e um mimo.",
    build: () => ({
      nome: "Pós-venda VIP",
      descricao: "Agradecimento no dia seguinte e benefício exclusivo depois de 5 dias.",
      segmentType: "ticket_alto",
      requerAprovacao: true,
      ativo: false,
      steps: autoChain([autoSend("", 1, "days"), autoSend("", 5, "days")]),
    }),
  },
];
