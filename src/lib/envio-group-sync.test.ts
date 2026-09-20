import { describe, expect, it } from "vitest";
import {
  currentWhatsappGroupSnapshot,
  whatsappParticipantIsAdmin,
  whatsappParticipantPhone,
} from "./envio-group-sync";

describe("sincronização dos grupos do WhatsApp", () => {
  it("prioriza o nome atual retornado pelos detalhes do grupo", () => {
    const snapshot = currentWhatsappGroupSnapshot(
      { JID: "12036306176@g.us", Name: "NIVER DA BOSS #6176", ParticipantsCount: 1 },
      {
        data: {
          Subject: "Niver da BOSS #2 - Ads",
          Participants: [{ JID: "5531988722853@s.whatsapp.net", IsAdmin: true }, { JID: "5531999999999@s.whatsapp.net" }],
          inviteLink: "https://chat.whatsapp.com/atual",
        },
      },
    );

    expect(snapshot).toEqual({
      name: "Niver da BOSS #2 - Ads",
      participantCount: 2,
      participants: [
        { JID: "5531988722853@s.whatsapp.net", IsAdmin: true },
        { JID: "5531999999999@s.whatsapp.net" },
      ],
      inviteLink: "https://chat.whatsapp.com/atual",
    });
  });

  it("mantém os dados da listagem quando o detalhe não traz os campos", () => {
    expect(
      currentWhatsappGroupSnapshot(
        { name: "Grupo da listagem", participant_count: 94, invite_link: "https://chat.whatsapp.com/lista" },
        {},
      ),
    ).toMatchObject({
      name: "Grupo da listagem",
      participantCount: 94,
      inviteLink: "https://chat.whatsapp.com/lista",
    });
  });

  it("reconhece telefone e administrador nos formatos alternativos da API", () => {
    const participant = { jid: "5531988722853@s.whatsapp.net", is_admin: true };
    expect(whatsappParticipantPhone(participant)).toBe("5531988722853");
    expect(whatsappParticipantIsAdmin(participant)).toBe(true);
  });
});
