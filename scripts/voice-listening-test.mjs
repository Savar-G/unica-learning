// Runs the listening-test kit for Maya's voice (#533): bundles worker/maya-voice/src/listening-cli.ts with esbuild (the
// "@" alias maps to src, as in the worker) and runs it. LiveKit stays outside the bundle: it loads a native module.
// Usage: npm run voice:listen -- make --dir <folder> --fake
//        npm run voice:listen -- record --dir <folder> --listener <name>
//        npm run voice:listen -- score --dir <folder>
// See worker/maya-voice/src/listening-cli.ts for every option, and docs/maya-voice-deploy.md for the real run.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
// Inside node_modules, so the bundle finds LiveKit and the other packages it leaves outside.
const outdir = join(root, "node_modules/.cache/voice-listening-test");
mkdirSync(outdir, { recursive: true });
await build({
  entryPoints: { cli: join(root, "worker/maya-voice/src/listening-cli.ts") },
  outdir, bundle: true, format: "esm", platform: "node", target: "node22", outExtension: { ".js": ".mjs" },
  alias: { "@": join(root, "src") }, conditions: ["react-server"], packages: "external", logLevel: "warning",
});
await import(pathToFileURL(join(outdir, "cli.mjs")).href);
