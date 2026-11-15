/**
 * Recuperação contínua de compras não concluídas — parte PURA (sem banco), usada pelo motor
 * (purchase-recovery.server.ts), pelo worker da fila e pelos testes.
 *
 * Regras de negócio (aceitas pelo proprietário):
 *  - Lote inicial: só tentativas de 13 e 14/11/2026 (Brasília) da lista revisada, revalidadas antes de enfileirar.
 *  - Depois: checkouts abandonados / pedidos expirados a partir da instalação do fluxo.
 *  - Espera 30 min após a tentativa; envio só 09h–19h (Brasília).
 *  - 1 mensagem inicial + no máximo 1 lembrete 4h após o ENVIO CONFIRMADO da primeira.
 *  - 1 recuperação aberta por telefone; cada tentativa entra 1 vez; nova tentativa só 7 dias depois.
 *  - Antes de cada envio: sai se houve compra/pedido pendente posterior, resposta, opt-out,
 *    tag sem-automacao, tentativa recuperada/inválida/cancelada. Sem dados = não envia.
 */
import { normalizeShopifyPhone } from "./shopify-order-phone";

export const PURCHASE_RECOVERY_KIND = "purchase_recovery" as const;
/** Versão da implementação exigida pela configuração armada; código antigo nunca processa o fluxo. */
export const PURCHASE_RECOVERY_IMPLEMENTATION = "purchase-recovery-v1";

export const RECOVERY_DELAY_MINUTES = 30;
export const RECOVERY_REMINDER_MINUTES = 240;
export const RECOVERY_COOLDOWN_DAYS = 7;
/** Janela de envio (relógio de Brasília): das 09:00 até antes das 19:00. */
export const RECOVERY_WINDOW = { startHour: 9, endHour: 19 } as const;

export const RECOVERY_TEMPLATES = {
  initial: {
    stepId: "recovery_initial",
    name: "recuperacao_compra_ajuda_v1",
    language: "pt_BR",
    body: "Oi, {{1}}! Vimos que sua compra não foi concluída. Se quiser retomar, acesse: {{2}}\nSe precisar de ajuda, responda por aqui. Para não receber mais mensagens, responda SAIR.",
  },
  reminder: {
    stepId: "recovery_reminder",
    name: "recuperacao_compra_lembrete_v1",
    language: "pt_BR",
    body: "Oi, {{1}}! Passando para lembrar que você pode retomar sua compra por aqui: {{2}}\nSe já concluiu ou precisa de ajuda, responda esta mensagem. Para não receber mais mensagens, responda SAIR.",
  },
} as const;

export type RecoveryStage = keyof typeof RECOVERY_TEMPLATES;

export const OPEN_ATTEMPT_STATUSES = ["pending", "queued_initial", "waiting_reminder", "queued_reminder"] as const;
export type AttemptStatus =
  | (typeof OPEN_ATTEMPT_STATUSES)[number]
  | "completed"
  | "exited"
  | "excluded"
  | "failed";

const BRT_OFFSET_MS = -3 * 3_600_000; // Brasília, sem horário de verão
const MINUTE = 60_000;
const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Configuração salva em whatsapp_automations.trigger_config
// ---------------------------------------------------------------------------

export type RecoveryConfig = {
  armed: boolean;
  implementation: string | null;
  allowedHost: string | null;
  initialSince: string | null;
  initialBefore: string | null;
  staticListId: string | null;
  continuousSince: string | null;
  blockingAutomationIds: string[];
  initialCampaignId: string | null;
  reminderCampaignId: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseRecoveryConfig(raw: unknown): RecoveryConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    armed: c["recoveryArmed"] === true,
    implementation: str(c["recoveryImplementation"]),
    allowedHost: str(c["recoveryAllowedHost"]),
    initialSince: str(c["recoverySince"]),
    initialBefore: str(c["recoveryBefore"]),
    staticListId: str(c["recoveryStaticListId"]),
    continuousSince: str(c["recoveryContinuousSince"]),
    blockingAutomationIds: Array.isArray(c["recoveryBlockingAutomationIds"])
      ? (c["recoveryBlockingAutomationIds"] as unknown[]).map(String).filter(Boolean)
      : [],
    initialCampaignId: str(c["recoveryInitialCampaignId"]),
    reminderCampaignId: str(c["recoveryReminderCampaignId"]),
  };
}

/** Por que o fluxo NÃO pode processar agora (null = pode). Não olha a Meta — isso é o gate de modelos. */
export function recoveryProcessingBlocker(config: RecoveryConfig, requestHost: string | null | undefined): string | null {
  if (!config.armed) return "Fluxo não está armado.";
  if (config.implementation !== PURCHASE_RECOVERY_IMPLEMENTATION) return "Implementação armada não corresponde ao código em execução.";
  if (!config.allowedHost) return "Endereço publicado autorizado não configurado.";
  if (!requestHost || requestHost.toLowerCase() !== config.allowedHost.toLowerCase()) {
    return "Fluxo só roda pelo agendamento do site publicado.";
  }
  if (!config.continuousSince) return "Data de instalação do fluxo contínuo não configurada.";
  return null;
}

// ---------------------------------------------------------------------------
// Horário de Brasília
// ---------------------------------------------------------------------------

export function isWithinRecoveryWindow(at: Date): boolean {
  const local = new Date(at.getTime() + BRT_OFFSET_MS);
  const hour = local.getUTCHours();
  return hour >= RECOVERY_WINDOW.startHour && hour < RECOVERY_WINDOW.endHour;
}

/** Primeiro instante >= `at` dentro da janela 09h–19h de Brasília. */
export function nextRecoverySendTime(at: Date): Date {
  if (isWithinRecoveryWindow(at)) return at;
  const local = new Date(at.getTime() + BRT_OFFSET_MS);
  const dayStartLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), RECOVERY_WINDOW.startHour, 0, 0, 0);
  const sameDay = local.getUTCHours() < RECOVERY_WINDOW.startHour;
  return new Date((sameDay ? dayStartLocal : dayStartLocal + DAY) - BRT_OFFSET_MS);
}

export function eligibleAtFor(attemptAt: Date): Date {
  return new Date(attemptAt.getTime() + RECOVERY_DELAY_MINUTES * MINUTE);
}

/** Lembrete: 4h depois do envio CONFIRMADO da 1ª mensagem, empurrado para a próxima janela válida. */
export function reminderDueAt(initialSentAt: Date): Date {
  return nextRecoverySendTime(new Date(initialSentAt.getTime() + RECOVERY_REMINDER_MINUTES * MINUTE));
}

// ---------------------------------------------------------------------------
// Telefone, nome e link
// ---------------------------------------------------------------------------

/** Chave canônica do telefone (E.164; celular BR sempre com o 9). */
export function phoneKey(raw: unknown): string | null {
  const e164 = normalizeShopifyPhone(raw);
  if (!e164) return null;
  const digits = e164.slice(1);
  // Celular BR antigo sem o 9: 55 + DDD + 8 dígitos começando em 6–9.
  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) return `+${digits.slice(0, 4)}9${digits.slice(4)}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Formas sob as quais o mesmo celular pode aparecer (com e sem o 9) — para cruzar pedidos, respostas e opt-out. */
export function phoneVariants(raw: unknown): string[] {
  const key = phoneKey(raw);
  if (!key) return [];
  const digits = key.slice(1);
  const variants = new Set([key]);
  if (/^55\d{2}9[6-9]\d{7}$/.test(digits)) variants.add(`+${digits.slice(0, 4)}${digits.slice(5)}`);
  return [...variants];
}

export function firstNameForMessage(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const word = String(candidate ?? "")
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^\p{L}'-]/gu, "");
    if (word && word.length >= 2 && !/@/.test(word)) {
      const lower = word.toLocaleLowerCase("pt-BR").slice(0, 30);
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    }
  }
  return "cliente";
}

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/** Link individual da tentativa: HTTPS, domínio da própria loja, caminho de checkout, sem placeholder. */
export function validateRecoveryUrl(raw: unknown, allowedHosts: readonly string[]): UrlCheck {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, reason: "sem link de checkout" };
  if (value.length > 1000 || /\s/.test(value) || /[{}<>]/.test(value)) return { ok: false, reason: "link com formato inválido" };
  if (/exemplo|example|placeholder/i.test(value)) return { ok: false, reason: "link de exemplo" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "link com formato inválido" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "link sem HTTPS" };
  const hosts = new Set(allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean));
  if (!hosts.has(url.hostname.toLowerCase())) return { ok: false, reason: "link fora do domínio da loja" };
  if (url.username || url.password || url.port) return { ok: false, reason: "link com formato inválido" };
  if (!/\/checkouts\//.test(url.pathname)) return { ok: false, reason: "link não é de checkout" };
  return { ok: true, url: url.toString() };
}

export function allowedStoreHosts(storefrontDomain: string | null | undefined, shopDomain: string | null | undefined): string[] {
  const hosts = new Set<string>();
  for (const raw of [storefrontDomain, shopDomain]) {
    const host = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host) continue;
    hosts.add(host);
    if (!host.startsWith("www.") && !host.endsWith(".myshopify.com")) hosts.add(`www.${host}`);
  }
  return [...hosts];
}

// ---------------------------------------------------------------------------
// Seleção de tentativas (entrada no fluxo)
// ---------------------------------------------------------------------------

export type AttemptCandidate = {
  attemptKey: string;
  source: "checkout" | "order";
  sourceId: string;
  cohort: "initial" | "continuous";
  customerId: string | null;
  email: string | null;
  rawPhone: string | null;
  firstName: string;
  rawUrl: string | null;
  attemptAt: string;
  /** Checkout já concluído / pedido já pago no momento da descoberta. */
  alreadyRecovered?: boolean;
};

export type ExistingAttempt = {
  attemptKey: string;
  phoneKey: string | null;
  status: AttemptStatus;
  createdAt: string;
  recoveryUrl: string | null;
};

export type AttemptRow = {
  attempt_key: string;
  source: "checkout" | "order";
  source_id: string;
  cohort: "initial" | "continuous";
  customer_id: string | null;
  email: string | null;
  phone: string | null;
  phone_key: string | null;
  first_name: string;
  recovery_url: string | null;
  attempt_at: string;
  eligible_at: string;
  status: "pending" | "excluded";
  exit_reason: string | null;
};

/**
 * Decide quem entra. Devolve linhas a gravar: "pending" (entra) ou "excluded" (com motivo, para relatório).
 * Tentativas ainda dentro dos 30 min ficam de fora (nem gravadas) e voltam no próximo ciclo.
 */
export function selectAttemptsForEnrollment(
  candidates: AttemptCandidate[],
  existing: ExistingAttempt[],
  allowedHosts: readonly string[],
  now: Date,
): AttemptRow[] {
  const known = new Set(existing.map((e) => e.attemptKey));
  const openPhones = new Set(
    existing.filter((e) => e.phoneKey && (OPEN_ATTEMPT_STATUSES as readonly string[]).includes(e.status)).map((e) => e.phoneKey as string),
  );
  const lastEnteredByPhone = new Map<string, number>();
  const urlOwner = new Map<string, string>();
  for (const e of existing) {
    if (e.recoveryUrl && e.phoneKey) urlOwner.set(e.recoveryUrl, e.phoneKey);
    if (!e.phoneKey || e.status === "excluded") continue;
    const at = new Date(e.createdAt).getTime();
    if (at > (lastEnteredByPhone.get(e.phoneKey) ?? 0)) lastEnteredByPhone.set(e.phoneKey, at);
  }

  const seenKeys = new Set<string>();
  const ready = candidates.filter((c) => {
    if (known.has(c.attemptKey) || seenKeys.has(c.attemptKey)) return false;
    seenKeys.add(c.attemptKey);
    const at = new Date(c.attemptAt);
    return Number.isFinite(at.getTime()) && eligibleAtFor(at).getTime() <= now.getTime();
  });

  const toRow = (c: AttemptCandidate, status: "pending" | "excluded", reason: string | null, url: string | null): AttemptRow => {
    const key = phoneKey(c.rawPhone);
    return {
      attempt_key: c.attemptKey,
      source: c.source,
      source_id: c.sourceId,
      cohort: c.cohort,
      customer_id: c.customerId,
      email: c.email ? c.email.trim().toLowerCase() : null,
      phone: key,
      phone_key: key,
      first_name: c.firstName,
      recovery_url: url,
      attempt_at: new Date(c.attemptAt).toISOString(),
      eligible_at: eligibleAtFor(new Date(c.attemptAt)).toISOString(),
      status,
      exit_reason: reason,
    };
  };

  // Mais recente primeiro: dentro do mesmo telefone, só a última tentativa entra.
  const ordered = [...ready].sort((a, b) => new Date(b.attemptAt).getTime() - new Date(a.attemptAt).getTime());
  const takenPhones = new Set<string>();
  const rows: AttemptRow[] = [];
  for (const c of ordered) {
    const key = phoneKey(c.rawPhone);
    const urlCheck = validateRecoveryUrl(c.rawUrl, allowedHosts);
    const url = urlCheck.ok ? urlCheck.url : null;
    const exclude = (reason: string) => rows.push(toRow(c, "excluded", reason, url));

    if (c.alreadyRecovered) { exclude("tentativa já recuperada antes da entrada"); continue; }
    if (!key) { exclude("sem telefone válido"); continue; }
    if (c.source === "order" && !urlCheck.ok) { exclude("pedido expirado sem link reutilizável seguro"); continue; }
    if (!urlCheck.ok) { exclude(`link inválido: ${urlCheck.reason}`); continue; }
    if (takenPhones.has(key)) { exclude("duplicada: tentativa mais recente do mesmo telefone já entrou"); continue; }
    if (openPhones.has(key)) { exclude("pessoa já está em uma recuperação aberta"); continue; }
    const owner = urlOwner.get(url as string);
    if (owner && owner !== key) { exclude("link pertence a outro telefone"); continue; }
    const lastEntered = lastEnteredByPhone.get(key);
    if (lastEntered !== undefined && new Date(c.attemptAt).getTime() < lastEntered + RECOVERY_COOLDOWN_DAYS * DAY) {
      exclude("reentrada bloqueada: nova tentativa só 7 dias após a última entrada");
      continue;
    }
    takenPhones.add(key);
    urlOwner.set(url as string, key);
    rows.push(toRow(c, "pending", null, url));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Conferência imediatamente antes de cada envio
// ---------------------------------------------------------------------------

export const PURCHASE_STATUSES = ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;
export const PENDING_ORDER_STATUSES = ["PENDING", "AUTHORIZED"] as const;

export type GuardOrder = { id: string; createdAt: string; financialStatus: string | null; cancelledAt: string | null };

export type RecoveryGuardFacts = {
  source: "checkout" | "order";
  sourceId: string;
  attemptAt: string;
  phoneValid: boolean;
  urlValid: boolean;
  /** A tentativa original ainda existe na base sincronizada. */
  sourceFound: boolean;
  /** checkout.completedAt (checkout recuperado). */
  sourceCompletedAt: string | null;
  /** Pedido de origem (tentativas por pedido expirado). */
  sourceOrder: GuardOrder | null;
  /** Pedidos correlacionados por cliente/email/telefone (qualquer data — o filtro é aqui). */
  relatedOrders: GuardOrder[];
  /** Última mensagem recebida do cliente (qualquer variante do telefone). */
  lastInboundAt: string | null;
  suppressed: boolean;
  blockedTag: boolean;
  openBlockingRun: boolean;
  /** Lembrete: a 1ª mensagem acabou falhando na entrega (webhook da Meta). */
  previousMessageFailed?: boolean;
};

export type GuardDecision = { send: true } | { send: false; reason: string };

export function evaluateRecoveryGuards(f: RecoveryGuardFacts): GuardDecision {
  const attemptAt = new Date(f.attemptAt).getTime();
  if (!Number.isFinite(attemptAt)) return { send: false, reason: "tentativa inválida (data ausente)" };
  if (!f.phoneValid) return { send: false, reason: "telefone inválido" };
  if (!f.urlValid) return { send: false, reason: "link da tentativa inválido" };
  if (!f.sourceFound) return { send: false, reason: "tentativa original não encontrada" };
  if (f.sourceCompletedAt) return { send: false, reason: "tentativa recuperada (checkout concluído)" };
  if (f.source === "order") {
    if (!f.sourceOrder) return { send: false, reason: "tentativa original não encontrada" };
    const status = String(f.sourceOrder.financialStatus ?? "").toUpperCase();
    if ((PURCHASE_STATUSES as readonly string[]).includes(status)) return { send: false, reason: "compra concluída no mesmo pedido" };
    if ((PENDING_ORDER_STATUSES as readonly string[]).includes(status)) return { send: false, reason: "pedido original voltou a pendente" };
    if (f.sourceOrder.cancelledAt) return { send: false, reason: "tentativa cancelada" };
  }
  for (const order of f.relatedOrders) {
    if (f.source === "order" && order.id === f.sourceId) continue;
    const createdAt = new Date(order.createdAt).getTime();
    if (!Number.isFinite(createdAt) || createdAt < attemptAt) continue;
    const status = String(order.financialStatus ?? "").toUpperCase();
    if ((PURCHASE_STATUSES as readonly string[]).includes(status)) return { send: false, reason: "compra posterior à tentativa" };
    if ((PENDING_ORDER_STATUSES as readonly string[]).includes(status)) return { send: false, reason: "pedido posterior pendente/autorizado" };
  }
  if (f.lastInboundAt && new Date(f.lastInboundAt).getTime() >= attemptAt) return { send: false, reason: "cliente respondeu" };
  if (f.suppressed) return { send: false, reason: "opt-out de marketing" };
  if (f.blockedTag) return { send: false, reason: "contato marcado como sem-automacao" };
  if (f.openBlockingRun) return { send: false, reason: "cliente em outra automação (PIX pendente)" };
  if (f.previousMessageFailed) return { send: false, reason: "1ª mensagem falhou na entrega" };
  return { send: true };
}

// ---------------------------------------------------------------------------
// Gate dos modelos na Meta
// ---------------------------------------------------------------------------

export type MetaTemplate = { id: string; name: string; language: string; status: string; category?: string; components?: { type: string; text?: string }[] };

export type TemplateGateEntry = { name: string; id: string | null; status: string; category: string | null; bodyMatches: boolean };
export type TemplateGate = { ok: boolean; checkedAt: string; reason: string | null; initial: TemplateGateEntry; reminder: TemplateGateEntry };

const normalizeBody = (text: string) => text.replace(/\r\n/g, "\n").trim();

export function evaluateTemplateGate(
  templates: MetaTemplate[] | null,
  apiError: string | null,
  now: Date,
): TemplateGate {
  const entry = (stage: RecoveryStage): TemplateGateEntry => {
    const def = RECOVERY_TEMPLATES[stage];
    if (!templates) return { name: def.name, id: null, status: "ERRO_API", category: null, bodyMatches: false };
    const found = templates.find((t) => t.name === def.name && t.language === def.language);
    if (!found) return { name: def.name, id: null, status: "NAO_ENCONTRADO", category: null, bodyMatches: false };
    const body = found.components?.find((c) => c.type === "BODY")?.text ?? "";
    return {
      name: def.name,
      id: found.id,
      status: String(found.status ?? "").toUpperCase(),
      category: found.category ?? null,
      bodyMatches: normalizeBody(body) === normalizeBody(def.body),
    };
  };
  const initial = entry("initial");
  const reminder = entry("reminder");
  let reason: string | null = null;
  if (apiError || !templates) reason = `Falha ao consultar a Meta: ${apiError ?? "sem resposta"}`;
  else {
    for (const e of [initial, reminder]) {
      if (e.status !== "APPROVED") { reason = `Modelo ${e.name} está ${e.status}`; break; }
      if (!e.bodyMatches) { reason = `Modelo ${e.name} com texto diferente do aprovado para o fluxo`; break; }
    }
  }
  return { ok: reason === null, checkedAt: now.toISOString(), reason, initial, reminder };
}

// ---------------------------------------------------------------------------
// Reconciliação com o resultado real da fila
// ---------------------------------------------------------------------------

export type QueueRecipientState = { status: string; sentAt: string | null; waMessageId: string | null; errorMessage: string | null };

export type AttemptPatch = Partial<{
  status: AttemptStatus;
  exit_reason: string | null;
  initial_sent_at: string;
  reminder_due_at: string;
  reminder_sent_at: string;
  last_error: string | null;
}>;

const SENT_STATES = new Set(["sent", "delivered", "read"]);

/** Próximo estado da tentativa a partir do destinatário da fila (null = ainda na fila). */
export function reconcileAttemptWithQueue(stage: RecoveryStage, recipient: QueueRecipientState | null): AttemptPatch | null {
  if (!recipient) return { status: "failed", last_error: "Registro da fila não encontrado." };
  if (SENT_STATES.has(recipient.status)) {
    // Envio confirmado = Meta aceitou e devolveu o id da mensagem.
    if (!recipient.sentAt || !recipient.waMessageId) return null;
    if (stage === "initial") {
      return {
        status: "waiting_reminder",
        initial_sent_at: recipient.sentAt,
        reminder_due_at: reminderDueAt(new Date(recipient.sentAt)).toISOString(),
        last_error: null,
      };
    }
    return { status: "completed", reminder_sent_at: recipient.sentAt, exit_reason: "lembrete enviado", last_error: null };
  }
  if (recipient.status === "failed") {
    return { status: "failed", last_error: recipient.errorMessage ?? `Falha no envio (${stage === "initial" ? "1ª mensagem" : "lembrete"}).` };
  }
  if (recipient.status === "cancelled") {
    return { status: "exited", exit_reason: recipient.errorMessage ?? "cancelado antes do envio" };
  }
  return null;
}

export function recoveryParams(firstName: string, url: string): string[] {
  return [firstName, url];
}
