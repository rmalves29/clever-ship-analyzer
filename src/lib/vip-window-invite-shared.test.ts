import { describe, expect, it } from "vitest";
import { vipInviteDueAt, vipInviteSendable, vipInviteText, VIP_INVITE_LINK } from "./vip-window-invite-shared";

// Brasília = UTC-3. Ajudante: monta uma data pelo relógio de Brasília.
const brt = (iso: string) => new Date(`${iso}-03:00`);
const show = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

describe("convite do Grupo VIP na janela de 24h", () => {
  it("sai na 20ª hora quando cai em horário permitido", () => {
    expect(show(vipInviteDueAt(brt("2026-11-13T14:00:00")))).toBe("2026-11-14 10:00");
    expect(show(vipInviteDueAt(brt("2026-11-13T00:30:00")))).toBe("2026-11-13 20:30"); // limite 20:30 incluso
  });

  it("20ª hora de madrugada vai para as 08:00 se ainda sobrar janela", () => {
    expect(show(vipInviteDueAt(brt("2026-11-13T10:00:00")))).toBe("2026-11-14 08:00"); // 06:00 -> 08:00 (22h)
    expect(show(vipInviteDueAt(brt("2026-11-13T09:00:00")))).toBe("2026-11-14 08:00"); // 05:00 -> 08:00 (23h)
  });

  it("madrugada sem janela suficiente volta para as 20:30 anteriores", () => {
    expect(show(vipInviteDueAt(brt("2026-11-13T06:00:00")))).toBe("2026-11-13 20:30"); // 02:00 -> 20:30 do dia anterior
  });

  it("depois das 20:30 vai para as 20:30 do mesmo dia", () => {
    expect(show(vipInviteDueAt(brt("2026-11-13T01:00:00")))).toBe("2026-11-13 20:30"); // 21:00 -> 20:30
    expect(show(vipInviteDueAt(brt("2026-11-13T03:00:00")))).toBe("2026-11-13 20:30"); // 23:00 -> 20:30
  });

  it("nunca agenda fora de 08:00–20:30 nem depois de fechar a janela", () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 15, 30, 45]) {
        const last = brt(`2026-11-13T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
        const due = vipInviteDueAt(last);
        const local = new Date(due.getTime() - 3 * 3_600_000);
        const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
        expect(mins).toBeGreaterThanOrEqual(8 * 60);
        expect(mins).toBeLessThanOrEqual(20 * 60 + 30);
        expect(due.getTime()).toBeGreaterThanOrEqual(last.getTime());
        expect(due.getTime()).toBeLessThan(last.getTime() + 23.5 * 3_600_000);
      }
    }
  });

  it("só envia entre o horário previsto e o fim da janela, em horário permitido", () => {
    const last = brt("2026-11-13T14:00:00"); // devido 10:00 do dia 14
    expect(vipInviteSendable(last, brt("2026-11-14T09:50:00"))).toBe(false); // cedo
    expect(vipInviteSendable(last, brt("2026-11-14T10:00:00"))).toBe(true);
    expect(vipInviteSendable(last, brt("2026-11-14T13:00:00"))).toBe(true);
    expect(vipInviteSendable(last, brt("2026-11-14T13:31:00"))).toBe(false); // passou de 23,5 h
  });

  it("o texto leva o nome e o link do grupo", () => {
    expect(vipInviteText("Maria Clara")).toContain("Oi, Maria!");
    expect(vipInviteText(null)).toContain("Oi!");
    expect(vipInviteText("Ana")).toContain(VIP_INVITE_LINK);
  });
});
