import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const importSchema = z.object({
  tag: z.string().min(1).max(60),
  rows: z
    .array(
      z.object({
        name: z.string().nullable().optional(),
        phone: z.string().min(1),
        email: z.string().nullable().optional(),
        tag: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(5000),
});

/** Importa uma lista de contatos (nome, telefone, e-mail e tag opcionais) vinda de um CSV — cria
 *  ou atualiza a ficha de cada um em shopify_customers com a tag da leva (+ a tag por linha, se
 *  tiver), pra virar público de campanha depois. */
export const importContactsCsv = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => importSchema.parse(data))
  .handler(async ({ data }) => {
    const { importContacts } = await import("./crm-import.server");
    const result = await importContacts(
      data.rows.map((r) => ({ name: r.name ?? null, phone: r.phone, email: r.email ?? null, tag: r.tag ?? null })),
      data.tag,
    );
    return { success: true as const, ...result };
  });
