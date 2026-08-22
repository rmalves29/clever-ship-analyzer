import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listEnvioGroups = createServerFn({ method: "GET" }).handler(async () => {
  const { listEnvioGroups: list } = await import("./envio-groups.server");
  return list();
});

export const syncEnvioGroupsFromWhatsapp = createServerFn({ method: "POST" }).handler(async () => {
  const { syncEnvioGroupsFromWhatsapp: sync } = await import("./envio-groups.server");
  return sync();
});

export const addEnvioGroupManual = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ groupJid: z.string().min(1), groupName: z.string().min(1), inviteLink: z.string().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { addEnvioGroupManual: add } = await import("./envio-groups.server");
    return add(data);
  });

export const updateEnvioGroup = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        is_entry_open: z.boolean().optional(),
        is_active: z.boolean().optional(),
        invite_link: z.string().optional(),
        group_name: z.string().optional(),
        max_participants: z.number().int().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { updateEnvioGroup: update } = await import("./envio-groups.server");
    const { id, ...patch } = data;
    return update(id, patch);
  });

export const deleteEnvioGroup = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteEnvioGroup: del } = await import("./envio-groups.server");
    return del(data.id);
  });
