import { describe, expect, it } from "vitest";
import { brtDateTime, buildEnvioEventsCsv, envioEventsFileName, formatBrPhone } from "./envio-events-csv";

describe("formatBrPhone", () => {
  it("formata celular e fixo brasileiros", () => {
    expect(formatBrPhone("5531999998888")).toBe("+55 (31) 99999-8888");
    expect(formatBrPhone("553133334444")).toBe("+55 (31) 3333-4444");
  });
  it("mantém outros formatos só com dígitos e vazio quando não há telefone", () => {
    expect(formatBrPhone("14155550123")).toBe("+14155550123");
    expect(formatBrPhone("+55 31 99999-8888")).toBe("+55 (31) 99999-8888");
    expect(formatBrPhone(null)).toBe("");
    expect(formatBrPhone("")).toBe("");
  });
});

describe("brtDateTime", () => {
  it("converte UTC para o horário de Brasília sem virar o dia errado", () => {
    expect(brtDateTime("2026-11-14T12:00:30.000Z")).toEqual(["14/11/2026", "09:00:30"]);
    expect(brtDateTime("2026-11-14T02:30:00.000Z")).toEqual(["13/11/2026", "23:30:00"]);
  });
  it("data inválida vira vazio", () => {
    expect(brtDateTime("nope")).toEqual(["", ""]);
  });
});

describe("buildEnvioEventsCsv", () => {
  it("gera cabeçalho, BOM e uma linha por evento", () => {
    const csv = buildEnvioEventsCsv([
      {
        createdAt: "2026-11-14T12:00:30.000Z",
        eventType: "join",
        phone: "5531999998888",
        groupName: "GRUPO VIP DA MM #13",
        campaignName: "Black Friday ADS",
        groupCampaignNames: ["Black Friday ADS", "Geral"],
      },
      {
        createdAt: "2026-11-14T13:00:00.000Z",
        eventType: "leave",
        phone: null,
        groupName: 'Grupo "especial"; teste',
        campaignName: "Sem campanha",
        groupCampaignNames: [],
      },
    ]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe("data;hora;evento;telefone;grupo;campanha_do_link;campanhas_do_grupo");
    expect(lines[1]).toBe("14/11/2026;09:00:30;Entrou;+55 (31) 99999-8888;GRUPO VIP DA MM #13;Black Friday ADS;Black Friday ADS + Geral");
    expect(lines[2]).toBe('14/11/2026;10:00:00;Saiu;;"Grupo ""especial""; teste";Sem campanha;');
    expect(lines).toHaveLength(3);
  });
});

describe("envioEventsFileName", () => {
  it("nomeia pelo tipo e período", () => {
    expect(envioEventsFileName("join", "30d", "2026-11-14")).toBe("fluxo-envio-entradas-30d-2026-11-14.csv");
    expect(envioEventsFileName("leave", "all", "2026-11-14")).toBe("fluxo-envio-saidas-all-2026-11-14.csv");
    expect(envioEventsFileName("all", "2026-11-01_a_2026-11-14", "2026-11-14")).toBe(
      "fluxo-envio-entradas-e-saidas-2026-11-01_a_2026-11-14-2026-11-14.csv",
    );
  });
});
