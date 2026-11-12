import { describe, expect, it } from "vitest";
import { normalizeGatePath } from "./popup-gate.server";

describe("endereço da página travada", () => {
  it("aceita só o caminho", () => {
    expect(normalizeGatePath("/collections/black-friday")).toBe("/collections/black-friday");
    expect(normalizeGatePath("collections/Black-Friday/")).toBe("/collections/black-friday");
  });
  it("tira domínio, parâmetros e âncora", () => {
    expect(normalizeGatePath("https://maniadmulher.com/collections/black-friday?sort_by=price#x")).toBe("/collections/black-friday");
  });
  it("devolve vazio quando não há caminho", () => {
    expect(normalizeGatePath("")).toBe("");
    expect(normalizeGatePath("https://maniadmulher.com")).toBe("");
    expect(normalizeGatePath("   ")).toBe("");
  });
});
