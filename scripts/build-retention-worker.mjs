import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// The worker runs with plain Node, outside Next.js. `src/lib/supabase-auth.ts` (reached through stripe.ts and
// card-reconcile-server.ts) imports `next/headers` for the parent's session, which the worker never uses, and plain
// Node cannot resolve that bare path (the retention runs of 2026-11-06 to 11-08 failed on it). Replace it with a stub
// that refuses every call, so the worker loads and a session read in it fails loudly.
const nextHeadersStub = {
  name: "next-headers-stub",
  setup(b) {
    b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: "next/headers", namespace: "retention-stub" }));
    b.onLoad({ filter: /.*/, namespace: "retention-stub" }, () => ({
      loader: "js",
      contents: `const refuse = () => { throw new Error("next/headers is not available in the retention worker"); };
export const cookies = refuse, headers = refuse, draftMode = refuse;`,
    }));
  },
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  absWorkingDir: root, entryPoints: ["scripts/retention-worker.ts"], outfile: ".retention/worker.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
  conditions: ["react-server"], plugins: [nextHeadersStub],
});
