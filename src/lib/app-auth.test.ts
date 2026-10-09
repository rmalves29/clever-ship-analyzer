import { afterEach, describe, expect, it } from "vitest";
import { allowedAppEmails, isEmailAllowed } from "./app-auth";

describe("lista de e-mails permitidos", () => {
  afterEach(() => {
    delete process.env["APP_AUTH_ALLOWED_EMAILS"];
  });

  it("sem lista, qualquer usuário válido passa (comportamento antigo)", () => {
    expect(isEmailAllowed("qualquer@x.com")).toBe(true);
    expect(isEmailAllowed(undefined)).toBe(true);
  });

  it("com lista, só os e-mails dela entram (sem diferenciar maiúsculas)", () => {
    process.env["APP_AUTH_ALLOWED_EMAILS"] = " A@x.com , b@y.com ";
    expect(allowedAppEmails()).toEqual(["a@x.com", "b@y.com"]);
    expect(isEmailAllowed("a@X.com")).toBe(true);
    expect(isEmailAllowed("b@y.com")).toBe(true);
    expect(isEmailAllowed("outro@x.com")).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
    expect(isEmailAllowed(null)).toBe(false);
  });
});
