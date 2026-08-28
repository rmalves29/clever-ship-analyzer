export type PopupTemplateKey = "essential" | "skincare" | "drop" | "whatsapp_steps" | "wheel" | "custom";
export type PopupLayout = "centered" | "split";
export type PopupImagePosition = "none" | "left" | "right" | "top";
export type PopupJourney = "single" | "progressive";
export type PopupInteraction = "form" | "wheel";
export type WheelPrizeType = "coupon" | "no_prize";

export type WheelPrize = {
  label: string;
  color: string;
  type: WheelPrizeType;
  /** Código já existente na Shopify — digitado manualmente, igual ao cupom fixo do pop-up. */
  couponCode: string;
  /** Peso do sorteio, em pontos — não precisa somar 100 (o sorteio normaliza pelo total). */
  probability: number;
};

/** Paleta padrão reaproveitada na roleta (editor, prévia e snippet do site) pra manter as
 *  cores consistentes quando um prêmio novo é adicionado sem cor escolhida ainda. */
export const WHEEL_PALETTE = ["#f1b93b", "#183b56", "#f0f3f4", "#cf7b53", "#8fb9a8", "#edd7ad", "#d7ff52", "#ef9cad"];

export type PopupDesignConfig = {
  templateKey: PopupTemplateKey;
  layout: PopupLayout;
  imagePosition: PopupImagePosition;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  buttonColor: string;
  buttonTextColor: string;
  width: number;
  borderRadius: number;
  overlayOpacity: number;
  badgeText: string;
  inputPlaceholder: string;
  namePlaceholder: string;
  resultHeadline: string;
  resultBody: string;
  resultButtonText: string;
  journey: PopupJourney;
  interaction: PopupInteraction;
  wheelPrizes: WheelPrize[];
};

export type PopupTemplatePreset = {
  key: PopupTemplateKey;
  name: string;
  description: string;
  category: string;
  headline: string;
  bodyText: string;
  buttonText: string;
  imageUrl: string;
  collectName: boolean;
  couponMode: "none" | "fixed" | "unique";
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  design: PopupDesignConfig;
};

const DEFAULT_DESIGN: PopupDesignConfig = {
  templateKey: "essential",
  layout: "centered",
  imagePosition: "none",
  backgroundColor: "#fffdf9",
  accentColor: "#d7ff52",
  textColor: "#111827",
  mutedColor: "#667085",
  buttonColor: "#111827",
  buttonTextColor: "#ffffff",
  width: 430,
  borderRadius: 24,
  overlayOpacity: 0.52,
  badgeText: "BEM-VINDO À NOSSA LOJA",
  inputPlaceholder: "Seu melhor WhatsApp",
  namePlaceholder: "Como podemos te chamar?",
  resultHeadline: "Seu benefício está liberado!",
  resultBody: "Copie o cupom abaixo e aproveite na sua compra.",
  resultButtonText: "COPIAR CUPOM",
  journey: "single",
  interaction: "form",
  wheelPrizes: [
    { label: "10% OFF", color: WHEEL_PALETTE[0]!, type: "coupon", couponCode: "", probability: 25 },
    { label: "15% OFF", color: WHEEL_PALETTE[1]!, type: "coupon", couponCode: "", probability: 25 },
    { label: "20% OFF", color: WHEEL_PALETTE[2]!, type: "coupon", couponCode: "", probability: 25 },
    { label: "SURPRESA", color: WHEEL_PALETTE[3]!, type: "coupon", couponCode: "", probability: 25 },
  ],
};

export const POPUP_TEMPLATE_PRESETS: PopupTemplatePreset[] = [
  {
    key: "essential",
    name: "Essencial Clássico",
    description: "Captação direta e elegante para primeira compra.",
    category: "Captação",
    headline: "Sua primeira compra merece 15% OFF",
    bodyText: "Preencha seus dados para liberar o cupom e descobrir nossas novidades.",
    buttonText: "LIBERAR MEU DESCONTO",
    imageUrl: "",
    collectName: true,
    couponMode: "unique",
    discountType: "percentage",
    discountValue: 15,
    design: {
      ...DEFAULT_DESIGN,
      templateKey: "essential",
      width: 430,
      backgroundColor: "#fffdf9",
      accentColor: "#d7ff52",
    },
  },
  {
    key: "skincare",
    name: "Editorial Rosa",
    description: "Imagem editorial com formulário compacto e delicado.",
    category: "Oferta",
    headline: "Seu estilo, sua rotina, seu momento",
    bodyText: "Cadastre-se para receber uma condição especial preparada para você.",
    buttonText: "QUERO MEU BENEFÍCIO",
    imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80",
    collectName: false,
    couponMode: "unique",
    discountType: "percentage",
    discountValue: 15,
    design: {
      ...DEFAULT_DESIGN,
      templateKey: "skincare",
      layout: "split",
      imagePosition: "left",
      backgroundColor: "#fffaf4",
      accentColor: "#f7b7c2",
      buttonColor: "#ef9cad",
      width: 680,
      badgeText: "CONDIÇÃO ESPECIAL",
    },
  },
  {
    key: "drop",
    name: "Drop Contemporâneo",
    description: "Lançamento com contraste editorial e imagem lateral.",
    category: "Oferta",
    headline: "O novo drop chegou primeiro para você",
    bodyText: "Cadastre-se e receba uma condição exclusiva para conhecer a coleção.",
    buttonText: "GARANTIR MEU BENEFÍCIO",
    imageUrl: "https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=900&q=80",
    collectName: false,
    couponMode: "unique",
    discountType: "percentage",
    discountValue: 20,
    design: {
      ...DEFAULT_DESIGN,
      templateKey: "drop",
      layout: "split",
      imagePosition: "right",
      backgroundColor: "#f6f2ec",
      accentColor: "#d7ff52",
      buttonColor: "#050505",
      width: 700,
      badgeText: "ACESSO ANTECIPADO",
    },
  },
  {
    key: "whatsapp_steps",
    name: "WhatsApp em 3 etapas",
    description: "Captação progressiva: nome, WhatsApp e tela de cupom.",
    category: "Multi-etapas",
    headline: "15% OFF para sua primeira compra",
    bodyText: "Leva poucos segundos. No final você recebe seu benefício.",
    buttonText: "CONTINUAR",
    imageUrl: "",
    collectName: true,
    couponMode: "unique",
    discountType: "percentage",
    discountValue: 15,
    design: {
      ...DEFAULT_DESIGN,
      templateKey: "whatsapp_steps",
      journey: "progressive",
      width: 620,
      badgeText: "PRESENTE DE BOAS-VINDAS",
      backgroundColor: "#fffdf9",
      resultHeadline: "Seu cupom chegou ✨",
      resultBody: "Copie o código e use na sua primeira compra.",
    },
  },
  {
    key: "wheel",
    name: "Roleta Essencial",
    description: "Gamificação elegante com roleta e benefício após o cadastro.",
    category: "Interativo",
    headline: "Gire e descubra seu benefício",
    bodyText: "Cadastre seu WhatsApp e tente a sorte.",
    buttonText: "GIRAR A ROLETA",
    imageUrl: "",
    collectName: false,
    couponMode: "unique",
    discountType: "percentage",
    discountValue: 15,
    design: {
      ...DEFAULT_DESIGN,
      templateKey: "wheel",
      layout: "split",
      imagePosition: "left",
      interaction: "wheel",
      width: 700,
      badgeText: "TENTE A SORTE",
      wheelPrizes: DEFAULT_DESIGN.wheelPrizes,
      resultHeadline: "Você desbloqueou um benefício!",
      resultBody: "Seu cupom foi gerado e está pronto para usar.",
    },
  },
];

export function getPopupTemplatePreset(key: PopupTemplateKey): PopupTemplatePreset {
  return POPUP_TEMPLATE_PRESETS.find((preset) => preset.key === key) ?? POPUP_TEMPLATE_PRESETS[0]!;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function validHex(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

/** Aceita tanto o formato antigo (string solta, ex.: "10% OFF") quanto o novo (objeto completo
 *  com cor/tipo/cupom/probabilidade) — pop-ups salvos antes dessa mudança continuam funcionando. */
function normalizeWheelPrize(raw: unknown, index: number): WheelPrize | null {
  const fallbackColor = WHEEL_PALETTE[index % WHEEL_PALETTE.length]!;

  if (typeof raw === "string") {
    const label = raw.trim().slice(0, 40);
    if (!label) return null;
    return { label, color: fallbackColor, type: "coupon", couponCode: "", probability: 25 };
  }

  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Sem early-return por label vazio: isso roda a cada tecla digitada no editor (patchDesign
  // re-normaliza o design inteiro), então descartar a linha por um instante de label vazio
  // faria a lista inteira "saltar" de volta pro preset se sobrasse menos de 2 prêmios válidos.
  const label = String(r["label"] ?? "").slice(0, 40);
  const type: WheelPrizeType = r["type"] === "no_prize" ? "no_prize" : "coupon";

  return {
    label,
    color: validHex(r["color"], fallbackColor),
    type,
    couponCode: type === "coupon" ? String(r["couponCode"] ?? "").trim().slice(0, 40).toUpperCase() : "",
    probability: clamp(Number(r["probability"]) || 0, 0, 100),
  };
}

/** Sorteia um prêmio da roleta respeitando o peso configurado em cada um (não precisa somar
 *  100 — é normalizado pelo total). Se todos os pesos forem 0, cai pra sorteio uniforme. */
export function pickWeightedWheelPrize(prizes: WheelPrize[]): WheelPrize | null {
  if (!prizes.length) return null;
  const total = prizes.reduce((sum, prize) => sum + Math.max(0, prize.probability), 0);
  if (total <= 0) return prizes[Math.floor(Math.random() * prizes.length)]!;

  let roll = Math.random() * total;
  for (const prize of prizes) {
    roll -= Math.max(0, prize.probability);
    if (roll <= 0) return prize;
  }
  return prizes[prizes.length - 1]!;
}

export function normalizePopupDesignConfig(value: unknown): PopupDesignConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const templateKey = ["essential", "skincare", "drop", "whatsapp_steps", "wheel", "custom"].includes(String(raw["templateKey"]))
    ? (String(raw["templateKey"]) as PopupTemplateKey)
    : DEFAULT_DESIGN.templateKey;
  const preset = templateKey === "custom" ? DEFAULT_DESIGN : getPopupTemplatePreset(templateKey).design;

  const wheelPrizes = Array.isArray(raw["wheelPrizes"])
    ? raw["wheelPrizes"]
        .map((item, index) => normalizeWheelPrize(item, index))
        .filter((prize): prize is WheelPrize => prize !== null)
        .slice(0, 8)
    : preset.wheelPrizes;

  return {
    templateKey,
    layout: raw["layout"] === "split" ? "split" : raw["layout"] === "centered" ? "centered" : preset.layout,
    imagePosition: ["none", "left", "right", "top"].includes(String(raw["imagePosition"]))
      ? (String(raw["imagePosition"]) as PopupImagePosition)
      : preset.imagePosition,
    backgroundColor: validHex(raw["backgroundColor"], preset.backgroundColor),
    accentColor: validHex(raw["accentColor"], preset.accentColor),
    textColor: validHex(raw["textColor"], preset.textColor),
    mutedColor: validHex(raw["mutedColor"], preset.mutedColor),
    buttonColor: validHex(raw["buttonColor"], preset.buttonColor),
    buttonTextColor: validHex(raw["buttonTextColor"], preset.buttonTextColor),
    width: clamp(Number(raw["width"] ?? preset.width) || preset.width, 320, 820),
    borderRadius: clamp(Number(raw["borderRadius"] ?? preset.borderRadius) || preset.borderRadius, 0, 48),
    overlayOpacity: clamp(Number(raw["overlayOpacity"] ?? preset.overlayOpacity) || preset.overlayOpacity, 0.15, 0.85),
    badgeText: String(raw["badgeText"] ?? preset.badgeText).slice(0, 80),
    inputPlaceholder: String(raw["inputPlaceholder"] ?? preset.inputPlaceholder).slice(0, 100),
    namePlaceholder: String(raw["namePlaceholder"] ?? preset.namePlaceholder).slice(0, 100),
    resultHeadline: String(raw["resultHeadline"] ?? preset.resultHeadline).slice(0, 180),
    resultBody: String(raw["resultBody"] ?? preset.resultBody).slice(0, 300),
    resultButtonText: String(raw["resultButtonText"] ?? preset.resultButtonText).slice(0, 80),
    journey: raw["journey"] === "progressive" ? "progressive" : raw["journey"] === "single" ? "single" : preset.journey,
    interaction: raw["interaction"] === "wheel" ? "wheel" : raw["interaction"] === "form" ? "form" : preset.interaction,
    wheelPrizes: wheelPrizes.length >= 2 ? wheelPrizes : preset.wheelPrizes,
  };
}

export function buildPopupTemplateDraft(key: PopupTemplateKey) {
  const preset = getPopupTemplatePreset(key);
  return {
    headline: preset.headline,
    body_text: preset.bodyText,
    button_text: preset.buttonText,
    image_url: preset.imageUrl,
    collect_name: preset.collectName,
    coupon_mode: preset.couponMode,
    discount_type: preset.discountType,
    discount_value: preset.discountValue,
    design_config: structuredClone(preset.design),
  };
}

export function popupStageCount(design: PopupDesignConfig, collectName: boolean): number {
  if (design.journey !== "progressive") return 2;
  return collectName ? 3 : 2;
}
