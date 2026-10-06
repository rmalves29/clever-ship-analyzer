/** Trava de acesso por senha do site (pop-up de tela cheia, sem botão de fechar).
 *  A configuração mora em site_gate_settings (1 linha). A senha NUNCA sai deste arquivo para o
 *  navegador: a config pública não a inclui e a conferência é feita aqui, no servidor. */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type GateSettings = {
  enabled: boolean;
  headline: string;
  bodyText: string;
  imageUrl: string | null;
  imageSize: number;
  imagePosX: number;
  imagePosY: number;
  imageZoom: number;
  password: string;
  passwordPlaceholder: string;
  buttonText: string;
  groupUrl: string | null;
  groupButtonText: string;
  backgroundColor: string;
  textColor: string;
  buttonColor: string;
  groupButtonColor: string;
};

export const DEFAULT_GATE_SETTINGS: GateSettings = {
  enabled: false,
  headline: "Área exclusiva",
  bodyText: "Para entrar no site, digite a senha. Ela é enviada no nosso grupo VIP.",
  imageUrl: null,
  imageSize: 280,
  imagePosX: 50,
  imagePosY: 50,
  imageZoom: 1,
  password: "",
  passwordPlaceholder: "Digite a senha",
  buttonText: "Entrar",
  groupUrl: null,
  groupButtonText: "Entrar no grupo VIP para receber a senha",
  backgroundColor: "#0f172a",
  textColor: "#ffffff",
  buttonColor: "#25d366",
  groupButtonColor: "#25d366",
};

function rowToSettings(row: any): GateSettings {
  if (!row) return { ...DEFAULT_GATE_SETTINGS };
  return {
    enabled: row.enabled === true,
    headline: row.headline ?? DEFAULT_GATE_SETTINGS.headline,
    bodyText: row.body_text ?? DEFAULT_GATE_SETTINGS.bodyText,
    imageUrl: row.image_url ?? null,
    imageSize: Number(row.image_size ?? DEFAULT_GATE_SETTINGS.imageSize),
    imagePosX: Number(row.image_pos_x ?? DEFAULT_GATE_SETTINGS.imagePosX),
    imagePosY: Number(row.image_pos_y ?? DEFAULT_GATE_SETTINGS.imagePosY),
    imageZoom: Number(row.image_zoom ?? DEFAULT_GATE_SETTINGS.imageZoom),
    password: row.password ?? "",
    passwordPlaceholder: row.password_placeholder ?? DEFAULT_GATE_SETTINGS.passwordPlaceholder,
    buttonText: row.button_text ?? DEFAULT_GATE_SETTINGS.buttonText,
    groupUrl: row.group_url ?? null,
    groupButtonText: row.group_button_text ?? DEFAULT_GATE_SETTINGS.groupButtonText,
    backgroundColor: row.background_color ?? DEFAULT_GATE_SETTINGS.backgroundColor,
    textColor: row.text_color ?? DEFAULT_GATE_SETTINGS.textColor,
    buttonColor: row.button_color ?? DEFAULT_GATE_SETTINGS.buttonColor,
    groupButtonColor: row.group_button_color ?? DEFAULT_GATE_SETTINGS.groupButtonColor,
  };
}

/** Versão completa (com a senha) — só para a tela de administração. */
export async function getGateSettings(): Promise<GateSettings> {
  const db = await admin();
  const { data, error } = await db.from("site_gate_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Erro ao ler a trava de acesso: ${error.message}`);
  return rowToSettings(data);
}

/** Salva a trava. Trocar a senha gera uma nova `gate_version`, o que derruba o acesso de quem já
 *  tinha entrado com a senha antiga (todos precisam digitar a nova). */
export async function saveGateSettings(input: GateSettings): Promise<GateSettings> {
  const db = await admin();
  const { data: current } = await db.from("site_gate_settings").select("password").eq("id", 1).maybeSingle();
  const passwordChanged = (current?.password ?? "") !== input.password;

  const { error } = await db.from("site_gate_settings").upsert(
    {
      id: 1,
      enabled: input.enabled,
      headline: input.headline,
      body_text: input.bodyText,
      image_url: input.imageUrl,
      image_size: input.imageSize,
      image_pos_x: input.imagePosX,
      image_pos_y: input.imagePosY,
      image_zoom: input.imageZoom,
      password: input.password,
      password_placeholder: input.passwordPlaceholder,
      button_text: input.buttonText,
      group_url: input.groupUrl,
      group_button_text: input.groupButtonText,
      background_color: input.backgroundColor,
      text_color: input.textColor,
      button_color: input.buttonColor,
      group_button_color: input.groupButtonColor,
      ...(passwordChanged ? { gate_version: crypto.randomUUID() } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Erro ao salvar a trava de acesso: ${error.message}`);
  return getGateSettings();
}

/** Config pública usada pelo loader do site. Sem senha e só "enabled" quando há senha definida. */
export async function getPublicGateConfig(): Promise<Record<string, unknown>> {
  const settings = await getGateSettings();
  if (!settings.enabled || !settings.password) return { enabled: false };
  return {
    enabled: true,
    headline: settings.headline,
    bodyText: settings.bodyText,
    imageUrl: settings.imageUrl,
    imageSize: settings.imageSize,
    imagePosX: settings.imagePosX,
    imagePosY: settings.imagePosY,
    imageZoom: settings.imageZoom,
    passwordPlaceholder: settings.passwordPlaceholder,
    buttonText: settings.buttonText,
    groupUrl: settings.groupUrl,
    groupButtonText: settings.groupButtonText,
    backgroundColor: settings.backgroundColor,
    textColor: settings.textColor,
    buttonColor: settings.buttonColor,
    groupButtonColor: settings.groupButtonColor,
  };
}

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Confere a senha digitada (devolve um token de acesso) ou um token guardado de uma visita
 *  anterior (devolve success se ainda for válido, ou seja, se a senha não foi trocada). */
export async function verifyGateUnlock(input: {
  password?: string | undefined;
  token?: string | undefined;
}): Promise<{ success: boolean; token?: string }> {
  const db = await admin();
  const { data } = await db.from("site_gate_settings").select("enabled, password, gate_version").eq("id", 1).maybeSingle();
  if (!data || data.enabled !== true || !data.password) return { success: true };

  if (input.token) {
    return { success: safeEqual(String(input.token), String(data.gate_version)) };
  }

  const typed = String(input.password ?? "").trim();
  if (typed && safeEqual(typed.toLowerCase(), String(data.password).trim().toLowerCase())) {
    return { success: true, token: String(data.gate_version) };
  }
  // Freio simples contra tentativa em massa.
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { success: false };
}
