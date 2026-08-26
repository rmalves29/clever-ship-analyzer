import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const pinSchema = z.string().regex(/^\d{6}$/, "O PIN precisa ter exatamente 6 números.");

export const getWhatsappPhoneRegistrationState = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getWhatsappPhoneRegistrationStatus } = await import("./whatsapp-phone-registration.server");
    return getWhatsappPhoneRegistrationStatus();
  });

export const registerWhatsappPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ pin: pinSchema }).parse(data))
  .handler(async ({ data }) => {
    const { registerCurrentWhatsappPhoneNumber } = await import("./whatsapp-phone-registration.server");
    return registerCurrentWhatsappPhoneNumber(data.pin);
  });

export const completeWhatsappEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        code: z.string().min(5),
        phoneNumberId: z.string().regex(/^\d+$/),
        wabaId: z.string().regex(/^\d+$/),
        pin: pinSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { completeWhatsappEmbeddedSignup: complete } = await import("./whatsapp-phone-registration.server");
    return complete(data);
  });
