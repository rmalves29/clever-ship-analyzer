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
    groupUrl: z.string().trim().url("Cole o link completo do grupo (https://…).").nullable(),
    groupButtonText: z.string().trim().min(1).max(80),
    backgroundColor: hexColor,
    textColor: hexColor,
    buttonColor: hexColor,
    groupButtonColor: hexColor,
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
