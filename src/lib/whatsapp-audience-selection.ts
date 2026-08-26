export type WhatsappAudienceSelection = {
  segmentType: string;
  segmentId?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeWhatsappAudienceSelection(segmentType: string, segmentId?: string): WhatsappAudienceSelection {
  const type = String(segmentType ?? "").trim();
  const id = String(segmentId ?? "").trim();

  if (id) {
    if (!UUID_RE.test(id)) throw new Error("Identificador do segmento inválido.");
    return { segmentType: "custom", segmentId: id };
  }

  if (UUID_RE.test(type)) return { segmentType: "custom", segmentId: type };
  if (type === "custom") {
    throw new Error("O segmento selecionado perdeu o identificador. Volte à etapa Público e selecione novamente.");
  }
  if (!type) throw new Error("Selecione um público para a campanha.");

  return { segmentType: type };
}

export function maskWhatsappRecipientPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  const visible = digits.slice(-4);
  return `•••• ${visible}`;
}
