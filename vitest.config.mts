import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The bank scans and board tests take a few seconds alone and can go past the 5 s default when several suites run at once.
  test: { include: ["src/**/*.test.ts"], testTimeout: 30_000 },
});
