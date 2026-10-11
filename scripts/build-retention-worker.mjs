import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/retention-worker.ts"], outfile: ".retention/worker.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
  conditions: ["react-server"],
});
