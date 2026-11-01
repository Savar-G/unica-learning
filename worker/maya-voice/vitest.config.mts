import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Maya's voice worker (#326): its own tests, outside `npm test` (the site's tests) and outside the Vercel build.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) }, conditions: ["react-server"] },
  test: { include: ["src/**/*.test.ts"], testTimeout: 30_000, server: { deps: { inline: [/src\/lib/] } } },
});
