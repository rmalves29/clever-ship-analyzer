import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests do not need the application/server build plugins.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/lib/whatsapp-session*.test.ts", "src/lib/wa-campaign-drafts-shared.test.ts"] },
});
