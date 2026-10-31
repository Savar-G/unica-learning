// Runs the Maya practice suite from the command line (#325): bundles scripts/maya-practice-cli.ts with esbuild (the "@"
// alias maps to src, as in vitest) and runs it.
// Usage: npm run maya:practice -- [--fake] [--estimate] [--max-usd n] [--cases C01,C02] [--runs 3]
// See scripts/maya-practice-cli.ts for every option.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
// Inside node_modules, so the bundle finds LiveKit and the other packages it leaves outside.
const outdir = join(root, "node_modules/.cache/maya-practice");
mkdirSync(outdir, { recursive: true });
await build({
  entryPoints: { cli: join(root, "scripts/maya-practice-cli.ts") },
  outdir, bundle: true, format: "esm", platform: "node", target: "node22", outExtension: { ".js": ".mjs" },
  alias: { "@": join(root, "src") }, external: ["@livekit/*"], logLevel: "warning",
});
process.env.MAYA_ROOT ??= root;
await import(pathToFileURL(join(outdir, "cli.mjs")).href);
