import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// The retention worker runs with plain Node, outside Next.js. Its dependency graph must never reach `next/*` or
// `@sentry/nextjs` (verified by src/lib/family-deletion-store.test.ts).
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/retention-worker.ts"], outfile: ".retention/worker.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
  conditions: ["react-server"],
});
