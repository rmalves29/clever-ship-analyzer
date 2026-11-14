import { describe, expect, it } from "vitest";
import { fetchAllStaticListMemberIds } from "./crm-static-list-members.server";

function makePager(total: number) {
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const rows = [];
    for (let i = from; i <= Math.min(to, total - 1); i++) rows.push({ customer_id: `c-${i}` });
    return { data: rows, error: null };
  };
  return { fetchPage, calls };
}

describe("fetchAllStaticListMemberIds", () => {
  it("lê listas maiores que 1.000 membros em várias páginas", async () => {
    const { fetchPage, calls } = makePager(8999);
    const ids = await fetchAllStaticListMemberIds(fetchPage);
    expect(ids).toHaveLength(8999);
    expect(calls).toHaveLength(9);
  });

  it("para na primeira página quando a lista é pequena", async () => {
    const { fetchPage, calls } = makePager(120);
    const ids = await fetchAllStaticListMemberIds(fetchPage);
    expect(ids).toHaveLength(120);
    expect(calls).toHaveLength(1);
  });

  it("não repete ids e lista vazia retorna vazio", async () => {
    const dup = async (from: number) =>
      from === 0
        ? { data: [{ customer_id: "a" }, { customer_id: "a" }, { customer_id: null }], error: null }
        : { data: [], error: null };
    expect(await fetchAllStaticListMemberIds(dup)).toEqual(["a"]);
    expect(await fetchAllStaticListMemberIds(async () => ({ data: [], error: null }))).toEqual([]);
  });

  it("propaga erro do banco", async () => {
    await expect(
      fetchAllStaticListMemberIds(async () => ({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});
