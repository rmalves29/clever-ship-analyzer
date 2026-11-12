import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.");

const gateSchema = z
  .object({
    enabled: z.boolean(),
    headline: z.string().trim().min(1, "Escreva o título.").max(120),
    bodyText: z.string().trim().max(800),
    imageUrl: z.string().url().nullable(),
    imageSize: z.number().int().min(120).max(480),
    imagePosX: z.number().int().min(0).max(100),
    imagePosY: z.number().int().min(0).max(100),
    imageZoom: z.number().min(1).max(3),
    password: z.string().trim().max(64),
    passwordPlaceholder: z.string().trim().min(1).max(60),
    buttonText: z.string().trim().min(1).max(40),
    showEnterButton: z.boolean(),
    scope: z.enum(["site", "paths"]),
    paths: z.array(z.string().trim().min(1).max(200)).max(20),
    buttons: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          text: z.string().trim().min(1, "Escreva o texto do botão.").max(60),
          url: z.string().trim().url("Cole o link completo do botão (https://…)."),
          color: hexColor,
        }),
      )
      .max(5, "No máximo 5 botões extras."),
    backgroundColor: hexColor,
    overlayOpacity: z.number().min(0.3).max(1),
    textColor: hexColor,
    buttonColor: hexColor,
  })
  .refine((v) => v.scope !== "paths" || v.paths.length > 0, {
    path: ["paths"],
    message: "Informe pelo menos um endereço (ex.: /collections/black-friday) ou escolha bloquear o site inteiro.",
  })
  .refine((v) => !v.enabled || v.password.length >= 4, {
    path: ["password"],
    message: "Defina uma senha de pelo menos 4 caracteres para ativar a trava.",
  });

export const getSiteGateSettings = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getGateSettings } = await import("./popup-gate.server");
    return getGateSettings();
  });

export const saveSiteGateSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => gateSchema.parse(data))
  .handler(async ({ data }) => {
    const { saveGateSettings } = await import("./popup-gate.server");
    return saveGateSettings(data);
  });
