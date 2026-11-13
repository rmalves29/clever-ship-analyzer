import { isWithinSendWindow } from "./automation-step-options";

/**
 * Convite do Grupo VIP enviado como TEXTO LIVRE nas últimas horas da janela de 24h da Meta — a janela que a própria cliente
 * abriu ao responder uma mensagem das réguas. Texto livre dentro da janela não é cobrado; quem não respondeu não recebe nada.
 */
export const VIP_INVITE_LINK = "https://app.cartzy.com.br/fluxo/app/black-friday-2";
/** Hora da janela (contada da última resposta da cliente) em que o convite deve sair. */
export const VIP_INVITE_AFTER_HOURS = 20;
/** Limite de segurança: depois disso a janela de 24h está perto demais de fechar. */
export const VIP_INVITE_CLOSE_HOURS = 23.5;
export const TAG_VIP_INVITE_SENT = "vip-convite-enviado";
/** Quem tem alguma destas marcas não recebe o convite. */
export const VIP_BLOCK_TAGS = ["black-sem-interesse", "sem-automacao", TAG_VIP_INVITE_SENT];
/** As réguas que participam têm `vipWindowInvite: true` no gatilho. */
export const VIP_TRIGGER_FLAG = "vipWindowInvite";

const HOUR_MS = 3_600_000;
const BRT_OFFSET_MS = -3 * HOUR_MS;
const OPEN_MIN = 8 * 60;
const CLOSE_MIN = 20 * 60 + 30;

export function vipInviteText(firstName: string | null | undefined): string {
  const name = (firstName ?? "").trim().split(/\s+/)[0] ?? "";
  const greeting = name ? `Oi, ${name}! 💖` : "Oi! 💖";
  return `${greeting} Você sabia que temos um Grupo VIP exclusivo? Por lá você recebe ofertas especiais, cupons de desconto, produtos com preços exclusivos e a senha da Black Friday. Entre pelo link: ${VIP_INVITE_LINK} ✨`;
}

function brtMinutes(at: Date): number {
  const local = new Date(at.getTime() + BRT_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/**
 * Instante em que o convite deve sair para uma cliente que respondeu por último em `lastInbound`: na 20ª hora da janela,
 * sempre dentro de 08:00–20:30 (Brasília). Se a 20ª hora cair de madrugada, vai para as 08:00 (se ainda sobrar janela)
 * ou para as 20:30 anteriores; se cair depois das 20:30, vai para as 20:30 do mesmo dia.
 */
export function vipInviteDueAt(lastInbound: Date): Date {
  const target = new Date(lastInbound.getTime() + VIP_INVITE_AFTER_HOURS * HOUR_MS);
  if (isWithinSendWindow(target)) return target;
  const closeAt = lastInbound.getTime() + VIP_INVITE_CLOSE_HOURS * HOUR_MS;
  const mins = brtMinutes(target);
  if (mins < OPEN_MIN) {
    const morning = target.getTime() + (OPEN_MIN - mins) * 60_000;
    if (morning < closeAt) return new Date(morning);
    return new Date(target.getTime() - (mins + (24 * 60 - CLOSE_MIN)) * 60_000); // 20:30 do dia anterior
  }
  return new Date(target.getTime() - (mins - CLOSE_MIN) * 60_000); // 20:30 do mesmo dia
}

/** Já é hora de enviar, a janela ainda está aberta com folga e o horário atual é permitido. */
export function vipInviteSendable(lastInbound: Date, now: Date): boolean {
  const due = vipInviteDueAt(lastInbound).getTime();
  const closeAt = lastInbound.getTime() + VIP_INVITE_CLOSE_HOURS * HOUR_MS;
  return now.getTime() >= due && now.getTime() < closeAt && isWithinSendWindow(now);
}
