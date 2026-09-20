import { describe, expect, it } from "vitest";
import {
  canonicalWhatsappGroupJid,
  currentWhatsappGroupSnapshot,
  dedupeWhatsappGroupsForSelection,
  whatsappParticipantIsAdmin,
  whatsappParticipantPhone,
  whatsappGroupSourceJid,
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

  it("normaliza os formatos antigo e oficial para o mesmo JID", () => {
    expect(canonicalWhatsappGroupJid("12036306176-group")).toBe("12036306176@g.us");
    expect(canonicalWhatsappGroupJid("12036306176@g.us")).toBe("12036306176@g.us");
    expect(whatsappGroupSourceJid({ remoteJid: "12036306176@g.us" })).toBe("12036306176@g.us");
  });

  it("remove o duplicado do seletor e preserva a linha já selecionada", () => {
    const groups = [
      { id: "antigo", group_jid: "12036306176-group", group_name: "Nome antigo" },
      { id: "oficial", group_jid: "12036306176@g.us", group_name: "Nome atual" },
    ];

    expect(dedupeWhatsappGroupsForSelection(groups).map((group) => group.id)).toEqual(["oficial"]);
    expect(dedupeWhatsappGroupsForSelection(groups, "antigo").map((group) => group.id)).toEqual(["antigo"]);
  });
});
