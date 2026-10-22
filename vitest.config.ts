import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // « server-only » refuse d'être importé hors de React Server Components : neutralisé en test.
  resolve: { alias: { "@": path.resolve(__dirname, "."), "server-only": path.resolve(__dirname, "tests/unit/stubs/server-only.ts") } },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
