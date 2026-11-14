import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }) } }));
import { sendSessionCampaignText } from "./whatsapp-session.server";

describe("envio de sessão", () => {
  const input = { to: "+5511999999999", text: "Oi!\nhttps://example.com", accessToken: "test", phoneNumberId: "test" };
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-14T22:00:00Z"));
    vi.stubGlobal("fetch", mocks.fetch); mocks.fetch.mockReset(); mocks.maybeSingle.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("envia texto com link e devolve id da Meta quando a janela está aberta", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { last_inbound_at: "2026-11-14T21:00:00Z" }, error: null });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "sent-test" }] }) });
    expect(await sendSessionCampaignText(input)).toEqual({ ok: true, waMessageId: "sent-test" });
    expect(JSON.parse(mocks.fetch.mock.calls[0]![1].body)).toMatchObject({ type: "text", text: { body: input.text, preview_url: true } });
  });
  it("revalida no próximo envio e não chama a Meta após o vencimento", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { last_inbound_at: "2026-11-13T22:00:00Z" }, error: null });
    expect(await sendSessionCampaignText(input)).toMatchObject({ ok: false, permanent: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("não envia se a consulta falhar ou não houver conversa", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "offline" } }).mockResolvedValueOnce({ data: null, error: null });
    expect(await sendSessionCampaignText(input)).toMatchObject({ ok: false });
    expect(await sendSessionCampaignText(input)).toMatchObject({ ok: false, permanent: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
