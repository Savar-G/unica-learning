// Builds Maya's voice worker (#326) into worker/maya-voice/dist/main.mjs: one ESM file with the site's modules it uses
// (src/lib, through the "@" alias), and every npm package left outside (LiveKit loads native modules). The
// "react-server" condition makes `server-only` an empty module, as on the site's server. Run it with
// `node --conditions=react-server worker/maya-voice/dist/main.mjs dev|start` (npm run voice:dev / voice:start).
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
await build({
  absWorkingDir: root,
  entryPoints: [resolve(here, "src/main.ts")],
  outfile: resolve(here, "dist/main.mjs"),
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
  alias: { "@": resolve(root, "src") }, conditions: ["react-server"], logLevel: "warning",
});
console.log("voice worker built: worker/maya-voice/dist/main.mjs");
