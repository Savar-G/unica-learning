// Runs a Maya text session from the command line (#322): bundles scripts/maya-text-cli.ts with esbuild (the "@" alias
// maps to src, as in vitest) and runs it. LiveKit stays outside the bundle: it loads a native module.
// Usage: npm run maya:text -- --question add-27-39 [--model fake|openrouter] [--script file] [--runner livekit|plain]
// See scripts/maya-text-cli.ts for every option.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
// Inside node_modules, so the bundle finds LiveKit and the other packages it leaves outside.
const outdir = join(root, "node_modules/.cache/maya-text");
mkdirSync(outdir, { recursive: true });
await build({
  entryPoints: { cli: join(root, "scripts/maya-text-cli.ts") },
  outdir, bundle: true, format: "esm", platform: "node", target: "node22", outExtension: { ".js": ".mjs" },
  alias: { "@": join(root, "src") }, external: ["@livekit/*"], logLevel: "warning",
});
process.env.MAYA_ROOT ??= root;
await import(pathToFileURL(join(outdir, "cli.mjs")).href);
