import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";

/** Estado do fluxo de recuperação de compras: gate da Meta, contagens, motivos de saída e últimas tentativas. */
export const getPurchaseRecoveryStatus = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getPurchaseRecoveryOverview } = await import("./purchase-recovery.server");
    return getPurchaseRecoveryOverview();
  });
